import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import dotenv from "../../backend/node_modules/dotenv";
import { Prisma, PrismaClient } from "../../backend/node_modules/@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../../backend/.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_EXPORT_ROOT = path.join(REPO_ROOT, "exports", "legacy-export");
const EXCLUDED_MODELS = new Set(["Session"]);
const SENSITIVE_FIELD_RE = /(password|secret|accessToken|refreshToken|encryptedPassword|encryptedAccessToken|encryptedRefreshToken|session|jwt|apiKey|clientSecret)/i;
const prisma = new PrismaClient();

type AnyRecord = Record<string, unknown>;
type Manifest = {
  schemaVersion: string;
  generatedAt: string;
  mode: "dry-run" | "full";
  git: { branch: string; commit: string };
  outputDirectory: string;
  models: Array<{ name: string; count: number; exportedCount: number; fields: string[]; redactedFields: string[]; jsonFile?: string; csvFile?: string }>;
  checksums: Record<string, string>;
};

function parseArgs() {
  const args = process.argv.slice(2);
  return { dir: valueAfter(args, "--dir") };
}

function valueAfter(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}

function delegateName(modelName: string): string {
  return modelName[0].toLowerCase() + modelName.slice(1);
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

async function findMany(modelName: string, args: unknown): Promise<AnyRecord[]> {
  const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<AnyRecord[]> }>)[delegateName(modelName)];
  return delegate.findMany(args);
}

async function findFirst(modelName: string, where: AnyRecord): Promise<AnyRecord | null> {
  const delegate = (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<AnyRecord | null> }>)[delegateName(modelName)];
  return delegate.findFirst({ where, select: { id: true } });
}

async function loadLatestDir(): Promise<string> {
  const latestPath = path.join(DEFAULT_EXPORT_ROOT, "LATEST");
  return (await fsp.readFile(latestPath, "utf8")).trim();
}

async function validateChecksums(exportDir: string, manifest: Manifest) {
  const failures: string[] = [];
  for (const [file, expected] of Object.entries(manifest.checksums ?? {})) {
    const actual = await sha256File(path.join(exportDir, file));
    if (actual !== expected) failures.push(file);
  }
  return failures;
}

async function validateCounts(exportDir: string, manifest: Manifest) {
  const results: Array<{ model: string; sourceCount: number; exportedCount: number; jsonCount: number; ok: boolean }> = [];
  for (const model of manifest.models) {
    const sourceCount = await countModel(model.name);
    let jsonCount = 0;
    if (model.jsonFile) {
      const rows = JSON.parse(await fsp.readFile(path.join(exportDir, model.jsonFile), "utf8"));
      jsonCount = Array.isArray(rows) ? rows.length : -1;
    }
    results.push({ model: model.name, sourceCount, exportedCount: model.exportedCount, jsonCount, ok: sourceCount === model.exportedCount && sourceCount === jsonCount });
  }
  return results;
}

async function validateOrphans() {
  const warnings: Array<{ model: string; relation: string; checked: number; orphaned: number; examples: AnyRecord[] }> = [];
  const models = Prisma.dmmf.datamodel.models.filter((model) => !EXCLUDED_MODELS.has(model.name));
  for (const model of models) {
    const idField = model.fields.find((field) => field.isId)?.name ?? "id";
    for (const relation of model.fields.filter((field) => field.kind === "object" && field.relationFromFields?.length)) {
      const fromFields = relation.relationFromFields ?? [];
      const toFields = relation.relationToFields ?? [];
      if (fromFields.length !== toFields.length) continue;
      const select = Object.fromEntries([idField, ...fromFields].map((field) => [field, true]));
      const rows = await findMany(model.name, { select });
      let checked = 0;
      let orphaned = 0;
      const examples: AnyRecord[] = [];
      for (const row of rows) {
        if (!fromFields.every((field) => row[field] !== null && row[field] !== undefined)) continue;
        checked += 1;
        const where = Object.fromEntries(fromFields.map((field, index) => [toFields[index], row[field]]));
        const found = await findFirst(relation.type, where);
        if (!found) {
          orphaned += 1;
          if (examples.length < 5) examples.push({ id: row[idField], relation: relation.name, where });
        }
      }
      if (orphaned > 0) warnings.push({ model: model.name, relation: relation.name, checked, orphaned, examples });
    }
  }
  return warnings;
}

async function duplicateCandidates() {
  const candidates: Array<{ model: string; field: string; duplicateGroups: number; examples: Array<{ value: string; count: number }> }> = [];
  const candidateFields = ["email", "emailAddress", "name", "title", "jobCode", "originalFilename", "storedFilename", "externalThreadId", "externalMessageId", "gmailThreadId", "gmailMessageId"];
  for (const model of Prisma.dmmf.datamodel.models.filter((item) => !EXCLUDED_MODELS.has(item.name))) {
    const idField = model.fields.find((field) => field.isId)?.name ?? "id";
    for (const field of model.fields.filter((item) => item.kind === "scalar" && candidateFields.includes(item.name) && !SENSITIVE_FIELD_RE.test(item.name))) {
      const rows = await findMany(model.name, { select: { [idField]: true, [field.name]: true } });
      const groups = new Map<string, number>();
      for (const row of rows) {
        const value = row[field.name];
        if (typeof value !== "string" || value.trim() === "") continue;
        const key = value.trim().toLowerCase();
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      const duplicates = Array.from(groups.entries()).filter(([, count]) => count > 1);
      if (duplicates.length > 0) {
        candidates.push({
          model: model.name,
          field: field.name,
          duplicateGroups: duplicates.length,
          examples: duplicates.slice(0, 10).map(([value, count]) => ({ value, count })),
        });
      }
    }
  }
  return candidates;
}

async function main() {
  const { dir } = parseArgs();
  const exportDir = path.resolve(dir ?? await loadLatestDir());
  const manifest: Manifest = JSON.parse(await fsp.readFile(path.join(exportDir, "manifest.json"), "utf8"));
  if (manifest.mode !== "full") throw new Error(`Validation requires a full export, got ${manifest.mode}`);

  const checksumFailures = await validateChecksums(exportDir, manifest);
  const countResults = await validateCounts(exportDir, manifest);
  const orphanWarnings = await validateOrphans();
  const duplicates = await duplicateCandidates();

  const report = {
    exportDir,
    validatedAt: new Date().toISOString(),
    schemaVersion: manifest.schemaVersion,
    git: manifest.git,
    checksumFailures,
    countResults,
    orphanWarnings,
    duplicateCandidates: duplicates,
  };
  await fsp.writeFile(path.join(exportDir, "validation-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const failedCounts = countResults.filter((item) => !item.ok);
  const warningLines = [
    ...(orphanWarnings.length === 0
      ? ["- No orphaned required/optional foreign-key references were detected by the generic validator."]
      : orphanWarnings.map((item) => `- ${item.model}.${item.relation}: ${item.orphaned}/${item.checked} referenced rows missing.`)),
    ...(duplicates.length === 0
      ? ["- No duplicate candidates were detected in checked identity fields."]
      : duplicates.map((item) => `- ${item.model}.${item.field}: ${item.duplicateGroups} duplicate candidate group(s).`)),
  ];
  const markdown = [
    "# Legacy Export Validation Report",
    "",
    `- Export directory: \`${exportDir}\``,
    `- Validated at: ${report.validatedAt}`,
    `- Git commit: \`${manifest.git.commit}\``,
    `- Models validated: ${countResults.length}`,
    `- Checksum status: ${checksumFailures.length === 0 ? "passed" : `failed for ${checksumFailures.length} files`}`,
    `- Count status: ${failedCounts.length === 0 ? "passed" : `failed for ${failedCounts.length} models`}`,
    `- Orphan relationship groups: ${orphanWarnings.length}`,
    `- Duplicate candidate groups: ${duplicates.reduce((sum, item) => sum + item.duplicateGroups, 0)}`,
    "",
    "## Count Results",
    "",
    "| Model | Source | Exported | JSON | Status |",
    "| --- | ---: | ---: | ---: | --- |",
    ...countResults.map((item) => `| ${item.model} | ${item.sourceCount} | ${item.exportedCount} | ${item.jsonCount} | ${item.ok ? "ok" : "mismatch"} |`),
    "",
    "## Warnings",
    "",
    ...warningLines,
    "",
  ].join("\n");
  await fsp.mkdir(path.join(REPO_ROOT, "exports"), { recursive: true });
  await fsp.writeFile(path.join(REPO_ROOT, "exports", "VALIDATION_REPORT.md"), markdown, "utf8");

  console.log(JSON.stringify({
    exportDir,
    checksumFailures: checksumFailures.length,
    countMismatches: failedCounts.length,
    orphanRelationshipGroups: orphanWarnings.length,
    duplicateCandidateGroups: duplicates.reduce((sum, item) => sum + item.duplicateGroups, 0),
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
