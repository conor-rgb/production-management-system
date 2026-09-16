import { randomUUID } from "node:crypto";

export const DRIVE_FOLDER = "application/vnd.google-apps.folder";
export const DEFAULT_PROJECTS_ROOT = "1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR";
export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; parents?: string[]; trashed?: boolean; capabilities?: { canAddChildren?: boolean }; modifiedTime?: string; size?: string };
export function driveId(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter a Google Drive folder link or ID.");
  let id = input.trim();
  if (id.startsWith("https://")) {
    const url = new URL(id);
    if (url.hostname !== "drive.google.com") throw new Error("Use a drive.google.com folder link.");
    id = url.pathname.match(/\/folders\/([\w-]+)/)?.[1] ?? url.searchParams.get("id") ?? "";
  }
  if (!/^[\w-]{10,200}$/.test(id)) throw new Error("Invalid Google Drive folder ID.");
  return id;
}
const quote = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// All requests are sent to fixed Google endpoints; user links never become fetch URLs.
export class DriveRequestError extends Error { constructor(public status: number, message: string) { super(message); } }

export class DriveClient {
  constructor(private token: string) {}
  private async request<T>(route: string, init?: RequestInit, upload = false): Promise<T> {
    const response = await fetch(`https://www.googleapis.com/${upload ? "upload/" : ""}drive/v3/${route}`, {
      ...init, headers: { Authorization: `Bearer ${this.token}`, ...init?.headers }, signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Google Drive connection expired. Reconnect in Files.");
      if (response.status === 403) {
        // Only interpret known reason codes; never expose raw provider payloads.
        const payload = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null;
        const reasons = [...(Array.isArray(payload?.error?.errors) ? payload.error.errors : []), ...(Array.isArray(payload?.error?.details) ? payload.error.details : [])].map(item => item?.reason);
        if (reasons.some(reason => reason === "accessNotConfigured" || reason === "SERVICE_DISABLED")) throw new Error("Google Drive API is not enabled for this app. In Google Cloud, select the app's project, open APIs & Services > Library > Google Drive API and enable it. Then reconnect in Files.");
        if (reasons.some(reason => reason === "insufficientPermissions" || reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT")) throw new Error("Google Drive permission is missing. Reconnect in Files and approve the requested Drive access.");
        if (reasons.includes("domainPolicy")) throw new Error("Google Workspace policy is blocking Drive access for this app. Check the app's access policy for the connected account's organisational unit.");
        if (reasons.some(reason => reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || reason === "dailyLimitExceeded")) throw new Error("Google Drive request quota was reached. Wait and retry; check the app's Google Cloud quota if it persists.");
        throw new Error("Google Drive denied access. Check the connected account and folder permissions.");
      }
      if (response.status === 404) throw new DriveRequestError(404, "Google Drive file or folder is unavailable.");
      throw new Error(`Google Drive request failed (${response.status}). Retry later.`);
    }
    return response.json() as Promise<T>;
  }
  async download(id: string) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error("The published file is unavailable in Google Drive. Check its permissions or restore it in Drive.");
    return response;
  }
  metadata(id: string) {
    return this.request<DriveFile>(`files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,trashed,capabilities(canAddChildren)`);
  }
  async folder(id: string) {
    const folder = await this.metadata(id);
    if (folder.trashed || folder.mimeType !== DRIVE_FOLDER) throw new Error("Choose an available Google Drive folder.");
    return folder;
  }
  async children(parentId: string, pageToken?: string, onlyFolders = false) {
    const q = `'${quote(parentId)}' in parents and trashed = false${onlyFolders ? ` and mimeType = '${DRIVE_FOLDER}'` : ""}`;
    return this.list(q, pageToken);
  }
  private list(q: string, pageToken?: string) {
    const query = new URLSearchParams({ q, pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true", fields: "nextPageToken,files(id,name,mimeType,webViewLink,parents,modifiedTime,size)", orderBy: "folder,name" });
    if (pageToken) query.set("pageToken", pageToken);
    return this.request<{ files: DriveFile[]; nextPageToken?: string }>(`files?${query}`);
  }
  async withinRoot(folderId: string, rootId: string): Promise<void> {
    let current = folderId;
    for (let depth = 0; depth < 30; depth++) {
      if (current === rootId) return;
      const item = await this.folder(current);
      if (!item.parents?.[0]) break;
      current = item.parents[0];
    }
    throw new Error("Choose a folder inside the configured projects folder.");
  }
  async ensureFolder(parentId: string, name: string) {
    const found = await this.list(`'${quote(parentId)}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER}' and name = '${quote(name)}'`);
    if (found.files.length > 1) throw new Error(`Several folders are named ${name}. Resolve the duplicate folders in Drive before publishing.`);
    if (found.files[0]) return found.files[0];
    return this.request<DriveFile>("files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: DRIVE_FOLDER, parents: [parentId] }),
    });
  }
  async ensureTaggedFolder(parentId: string, name: string, tag: string) {
    const found = await this.list(`'${quote(parentId)}' in parents and trashed = false and mimeType = '${DRIVE_FOLDER}' and appProperties has { key='productionHubFolder' and value='${quote(tag)}' }`);
    if (found.files.length > 1) throw new Error("Duplicate project folders need review in Drive.");
    if (found.files[0]) return found.files[0];
    return this.request<DriveFile>("files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: DRIVE_FOLDER, parents: [parentId], appProperties: { productionHubFolder: tag } }),
    });
  }
  async reserveId(): Promise<string> {
    const result = await this.request<{ ids: string[] }>("files/generateIds?count=1&space=drive&type=files");
    if (!result.ids[0]) throw new Error("Google Drive could not reserve a file ID.");
    return result.ids[0];
  }
  async upload(parentId: string, file: { id: string; name: string; mimeType: string; buffer: Buffer; driveFileId?: string | null }) {
    // Durable ID plus app property makes retries after a lost response recover the existing upload.
    const existing = file.driveFileId ? await this.metadata(file.driveFileId).catch(error => { if (error instanceof DriveRequestError && error.status === 404) return undefined; throw error; }) : (await this.list(`trashed = false and appProperties has { key='productionHubFileId' and value='${quote(file.id)}' }`)).files[0];
    if (existing?.trashed) throw new Error("The published file is in Drive trash. Restore it before retrying.");
    if (existing && existing.parents?.includes(parentId)) return existing;
    if (existing) throw new Error("This file was moved in Drive. Restore its destination before retrying.");
    const boundary = `hub_${randomUUID()}`;
    const metadata = { ...(file.driveFileId ? { id: file.driveFileId } : {}), name: file.name, parents: [parentId], appProperties: { productionHubFileId: file.id } };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
      file.buffer, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return this.request<DriveFile>("files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    }, true);
  }
}
