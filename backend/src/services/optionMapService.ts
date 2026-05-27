import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import prisma from "../prisma";
import { ensureProductionFolders } from "./fileStorage";

const STATIC_MAP_API = "https://maps.googleapis.com/maps/api/staticmap";

function mapsApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return key;
}

function cleanPathPart(value: string): string {
  return value.replace(/[\\/:\*\?"<>\|]/g, " ").replace(/\s+/g, " ").trim() || "Options";
}

function hasStoredMap(pathname: string | null): pathname is string {
  return Boolean(pathname && fsSync.existsSync(pathname));
}

function coordinate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchStaticMap(latitude: number, longitude: number): Promise<Buffer> {
  const url = new URL(STATIC_MAP_API);
  url.searchParams.set("center", `${latitude},${longitude}`);
  url.searchParams.set("zoom", "14");
  url.searchParams.set("size", "640x420");
  url.searchParams.set("scale", "2");
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.append("markers", `color:0x111111|${latitude},${longitude}`);
  url.searchParams.set("key", mapsApiKey());

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Static Maps failed: ${response.status} ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function ensureCandidateStaticMap(candidateId: string): Promise<string | null> {
  const candidate = await prisma.optionCandidate.findUnique({
    where: { id: candidateId },
    include: {
      selectedAddress: true,
      group: { select: { name: true } },
    },
  });
  if (!candidate) throw new Error("Candidate not found");
  if (hasStoredMap(candidate.mapImagePath)) return candidate.mapImagePath;

  const latitude = coordinate(candidate.latitude) ?? coordinate(candidate.selectedAddress?.latitude);
  const longitude = coordinate(candidate.longitude) ?? coordinate(candidate.selectedAddress?.longitude);
  if (latitude === null || longitude === null) return null;

  const image = await fetchStaticMap(latitude, longitude);
  const productionRoot = await ensureProductionFolders(candidate.productionId);
  const dir = path.join(productionRoot, "Options", cleanPathPart(candidate.group.name), candidate.id);
  await fs.mkdir(dir, { recursive: true });
  const storedPath = path.join(dir, "map.png");
  await fs.writeFile(storedPath, image);

  await prisma.optionCandidate.update({
    where: { id: candidate.id },
    data: {
      latitude,
      longitude,
      mapImagePath: storedPath,
      mapImageUpdatedAt: new Date(),
    },
  });

  return storedPath;
}
