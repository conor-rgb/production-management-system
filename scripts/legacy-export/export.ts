import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

import dotenv from "../../backend/node_modules/dotenv";
import { Prisma, PrismaClient } from "../../backend/node_modules/@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../../backend/.env") });

const EXPORT_SCHEMA_VERSION = "legacy-export-v1";
const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_EXPORT_ROOT = path.join(REPO_ROOT, "exports", "legacy-export");
const EXCLUDED_MODELS = new Set(["Session"]);
const FORCE_REDACT_FIELDS: Record<string, string[]> = {
  Settings: ["password"],
  EmailAccount: ["encryptedPassword", "encryptedAccessToken", "encryptedRefreshToken"],
};
const SENSITIVE_FIELD_RE = /(password|secret|accessToken|refreshToken|encryptedPassword|encryptedAccessToken|encryptedRefreshToken|session|jwt|apiKey|clientSecret)/i;

type ExportMode = "dry-run" | "full";
type AnyRecord = Record<string, unknown>;

type ExportManifest = {
  schemaVersion: string;
  generatedAt: string;
  mode: ExportMode;
  git: { branch: string; commit: string };
  sourceDatabase: { provider: string; schema?: string | null };
  outputDirectory: string;
  excludedModels: string[];
  models: Array<{
    name: string;
    delegate: string;
    tableName?: string;
    count: number;
    exportedCount: number;
    fields: string[];
    redactedFields: string[];
    jsonFile?: string;
    csvFile?: string;
  }>;
  checksums: Record<string, string>;
  warnings: string[];
};

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    outDir: valueAfter(args, "--out"),
  };
}

function valueAfter(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}

function delegateName(modelName: string): string {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

function shellOutput(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unknown";
  }
}

function redactedFieldsFor(model: Prisma.DMMF.Model): Set<string> {
  const forced = new Set(FORCE_REDACT_FIELDS[model.name] ?? []);
  for (const field of model.fields) {
    if (field.kind !== "scalar" && field.kind !== "enum") continue;
    if (SENSITIVE_FIELD_RE.test(field.name)) forced.add(field.name);
  }
  return forced;
}

function exportableScalarFields(model: Prisma.DMMF.Model): string[] {
  const redacted = redactedFieldsFor(model);
  return model.fields
    .filter((field) => (field.kind === "scalar" || field.kind === "enum") && !redacted.has(field.name))
    .map((field) => field.name);
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const maybeDecimal = value as { toString?: () => string; constructor?: { name?: string } };
    if (maybeDecimal.constructor?.name === "Decimal" && typeof maybeDecimal.toString === "function") return maybeDecimal.toString();
    const output: AnyRecord = {};
    for (const [key, nested] of Object.entries(value as AnyRecord)) output[key] = serializeValue(nested);
    return output;
  }
  return value;
}

function projectRecord(record: AnyRecord, fields: string[]): AnyRecord {
  const projected: AnyRecord = {};
  for (const field of fields) projected[field] = serializeValue(record[field] ?? null);
  return projected;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function toCsv(rows: AnyRecord[], fields: string[]): string {
  const lines = [fields.map(csvCell).join(",")];
  for (const row of rows) lines.push(fields.map((field) => csvCell(row[field])).join(","));
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function countModel(modelName: string): Promise<number> {
  const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[delegateName(modelName)];
  return delegate.count();
}

async function readModel(model: Prisma.DMMF.Model): Promise<AnyRecord[]> {
  const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<AnyRecord[]> }>)[delegateName(model.name)];
  const fields = exportableScalarFields(model);
  const select = Object.fromEntries(fields.map((field) => [field, true]));
  return delegate.findMany({ select, orderBy: model.fields.some((field) => field.name === "createdAt") ? { createdAt: "asc" } : undefined });
}

async function main() {
  const { dryRun, outDir } = parseArgs();
  const mode: ExportMode = dryRun ? "dry-run" : "full";
  const stamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "T").replace("Z", "Z");
  const outputDirectory = path.resolve(outDir ?? path.join(DEFAULT_EXPORT_ROOT, `${stamp}-${mode}`));
  await fsp.mkdir(outputDirectory, { recursive: true });

  const errors: Array<Record<string, unknown>> = [];
  const checksums: Record<string, string> = {};
  const warnings: string[] = [];
  const models = Prisma.dmmf.datamodel.models.filter((model) => !EXCLUDED_MODELS.has(model.name));
  const manifest: ExportManifest = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    git: {
      branch: shellOutput("git", ["branch", "--show-current"]),
      commit: shellOutput("git", ["rev-parse", "HEAD"]),
    },
    sourceDatabase: {
      provider: "postgresql",
      schema: (() => {
        try {
          return new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
        } catch {
          return null;
        }
      })(),
    },
    outputDirectory,
    excludedModels: Array.from(EXCLUDED_MODELS),
    models: [],
    checksums,
    warnings,
  };

  for (const model of models) {
    const fields = exportableScalarFields(model);
    const redactedFields = Array.from(redactedFieldsFor(model)).sort();
    const entry = {
      name: model.name,
      delegate: delegateName(model.name),
      tableName: model.dbName ?? undefined,
      count: 0,
      exportedCount: 0,
      fields,
      redactedFields,
      jsonFile: dryRun ? undefined : `${model.name}.json`,
      csvFile: dryRun ? undefined : `${model.name}.csv`,
    };

    try {
      entry.count = await countModel(model.name);
      if (!dryRun) {
        const rows = (await readModel(model)).map((row) => projectRecord(row, fields));
        entry.exportedCount = rows.length;
        const jsonPath = path.join(outputDirectory, `${model.name}.json`);
        const csvPath = path.join(outputDirectory, `${model.name}.csv`);
        await writeJson(jsonPath, rows);
        await fsp.writeFile(csvPath, toCsv(rows, fields), "utf8");
        checksums[`${model.name}.json`] = await sha256File(jsonPath);
        checksums[`${model.name}.csv`] = await sha256File(csvPath);
        if (entry.count !== entry.exportedCount) warnings.push(`${model.name}: source count ${entry.count} != exported count ${entry.exportedCount}`);
      }
    } catch (err) {
      errors.push({ model: model.name, message: err instanceof Error ? err.message : String(err) });
    }

    manifest.models.push(entry);
  }

  await writeJson(path.join(outputDirectory, "errors.json"), errors);
  checksums["errors.json"] = await sha256File(path.join(outputDirectory, "errors.json"));
  await writeJson(path.join(outputDirectory, "manifest.json"), manifest);
  await fsp.mkdir(DEFAULT_EXPORT_ROOT, { recursive: true });
  await fsp.writeFile(path.join(DEFAULT_EXPORT_ROOT, "LATEST"), `${outputDirectory}\n`, "utf8");

  console.log(JSON.stringify({
    mode,
    outputDirectory,
    modelCount: manifest.models.length,
    totalSourceRows: manifest.models.reduce((sum, model) => sum + model.count, 0),
    totalExportedRows: manifest.models.reduce((sum, model) => sum + model.exportedCount, 0),
    warnings: manifest.warnings.length,
    errors: errors.length,
  }, null, 2));
}

main()
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
