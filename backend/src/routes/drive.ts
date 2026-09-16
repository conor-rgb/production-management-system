import { randomBytes } from "node:crypto";
import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import prisma from "../prisma";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../services/encryptionService";
import { DEFAULT_PROJECTS_ROOT, DriveClient, driveId } from "../services/driveClient";
import { driveClient } from "../services/driveStorage";

const router = Router();
const scope = "https://www.googleapis.com/auth/drive";
const rootId = () => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || DEFAULT_PROJECTS_ROOT;
const redirectUri = () => process.env.GOOGLE_DRIVE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || "";
const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUri() && process.env.EMAIL_ENCRYPTION_KEY?.length === 32);
const route = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };

router.get("/status", route(async (_req, res) => {
  const connection = await prisma.driveConnection.findUnique({ where: { id: "workspace" }, select: { rootFolderId: true, connectedAt: true } });
  res.json({ configured: configured(), connected: Boolean(connection), rootFolderId: connection?.rootFolderId ?? rootId(), connectedAt: connection?.connectedAt ?? null });
}));
router.get("/oauth/start", (req, res) => {
  if (!configured()) { res.status(503).json({ error: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (or GOOGLE_DRIVE_REDIRECT_URI) and EMAIL_ENCRYPTION_KEY on the server." }); return; }
  // Stored sessions retain their original cookie policy across deployments.
  // Refresh it before leaving the site so Google can return the same session.
  req.session.cookie.sameSite = "lax";
  const state = `drive.${randomBytes(32).toString("hex")}`;
  req.session.driveOAuth = { state, expiresAt: Date.now() + 10 * 60_000 };
  req.session.save(error => {
    if (error) { res.status(500).json({ error: "Could not start Google connection." }); return; }
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope, access_type: "offline", prompt: "consent", state });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
});
export const driveOAuthCallbackHandler = route(async (req, res) => {
  const state = req.session.driveOAuth;
  delete req.session.driveOAuth;
  await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  if (!state || state.expiresAt < Date.now() || req.query.state !== state.state || typeof req.query.code !== "string") {
    res.status(400).send("Google connection was cancelled or expired. Return to Files and reconnect."); return;
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), code: req.query.code, grant_type: "authorization_code" }), signal: AbortSignal.timeout(15_000),
  });
  const token = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
  if (!response.ok || !token.access_token || !token.refresh_token || !token.scope?.split(" ").includes(scope)) throw new Error("Google Drive permission was not granted. Reconnect and allow Drive access.");
  const client = new DriveClient(token.access_token);
  const root = await client.folder(rootId());
  if (!root.capabilities?.canAddChildren) throw new Error("The connected Google account cannot add files to your projects folder.");
  await prisma.driveConnection.upsert({ where: { id: "workspace" }, create: { id: "workspace", refreshToken: encrypt(token.refresh_token), rootFolderId: root.id }, update: { refreshToken: encrypt(token.refresh_token), rootFolderId: root.id, connectedAt: new Date() } });
  res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/files`);
});
router.get("/oauth/callback", driveOAuthCallbackHandler);

// The prefix selects the provider flow; session state still authenticates it.
export const googleCallbackWithDrive = (gmailCallback: RequestHandler): RequestHandler => (req, res, next) => {
  const states = Array.isArray(req.query.state) ? req.query.state : [req.query.state];
  if (req.session?.driveOAuth || states.some(state => typeof state === "string" && state.startsWith("drive."))) {
    requireAuth(req, res, error => {
      if (error) { next(error); return; }
      driveOAuthCallbackHandler(req, res, callbackError => {
        if (callbackError) driveErrorHandler(callbackError, req, res, next);
      });
    });
    return;
  }
  gmailCallback(req, res, next);
};
router.get("/folders", route(async (req, res) => {
  const { client, connection } = await driveClient();
  res.json(await client.children(connection.rootFolderId, typeof req.query.pageToken === "string" ? req.query.pageToken : undefined, true));
}));
router.get("/projects/:id", route(async (req, res) => {
  const project = await prisma.production.findUnique({ where: { id: req.params.id }, select: { driveFolderId: true, driveFolderName: true } });
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  const counts = await prisma.jobFile.groupBy({ by: ["driveSyncStatus"], where: { productionId: req.params.id }, _count: { _all: true } });
  const failures = await prisma.jobFile.findMany({ where: { productionId: req.params.id, driveSyncStatus: "ERROR" }, take: 20, select: { id: true, originalFilename: true, driveSyncError: true } });
  res.json({ ...project, counts: Object.fromEntries(counts.map(c => [c.driveSyncStatus, c._count._all])), failures });
}));
router.post("/projects/:id/link", route(async (req, res) => {
  const id = driveId(req.body.folderId);
  const { client, connection } = await driveClient();
  if (id === connection.rootFolderId) throw new Error("Select this project's folder, not the parent projects folder.");
  const folder = await client.folder(id);
  await client.withinRoot(id, connection.rootFolderId);
  if (!folder.capabilities?.canAddChildren) throw new Error("You need permission to add files to this project folder.");
  const project = await prisma.production.findUnique({ where: { id: req.params.id }, select: { driveFolderId: true, workspaceVersion: true } });
  if (!project) { res.status(404).json({ error: "Project not found." }); return; }
  if (project.workspaceVersion === 2 && project.driveFolderId !== id) throw new Error("New projects use automatic Drive setup. Open Costs → Estimate to set up or retry the project folders.");
  if (project.driveFolderId && project.driveFolderId !== id) throw new Error("This project already has a Drive folder. Reassignment requires a file migration.");
  await prisma.production.update({ where: { id: req.params.id }, data: { driveFolderId: id, driveFolderName: folder.name } });
  res.json({ driveFolderId: id, driveFolderName: folder.name });
}));
router.post("/projects/:id/create-folder", route(async (req, res) => {
  const { client, connection } = await driveClient();
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`drive:${req.params.id}`}))`;
    const project = await tx.production.findUnique({ where: { id: req.params.id }, select: { id: true, title: true, jobCode: true, driveFolderId: true, driveFolderName: true, workspaceVersion: true } });
    if (!project) throw new Error("Project not found.");
    if (project.driveFolderId) return project;
    if (project.workspaceVersion === 2) throw new Error("Open Costs → Estimate to set up or retry this project’s Drive folders.");
    if (!project.jobCode) throw new Error("Give this project a job code before creating its Drive folder.");
    const name = `${project.jobCode} | ${project.title}`.replace(/[\r\n]/g, " ").slice(0, 200);
    const folder = await client.ensureFolder(connection.rootFolderId, name);
    return tx.production.update({ where: { id: project.id }, data: { driveFolderId: folder.id, driveFolderName: folder.name }, select: { driveFolderId: true, driveFolderName: true } });
  }, { timeout: 130_000 });
  res.json(result);
}));
router.post("/projects/:id/publish", route(async (req, res) => {
  const project = await prisma.production.findUnique({ where: { id: req.params.id }, select: { driveFolderId: true, workspaceVersion: true } });
  if (!project?.driveFolderId) throw new Error("Link a project folder first.");
  await driveClient(); // Fail visibly before queuing if disconnected.
  const result = await prisma.jobFile.updateMany({ where: { productionId: req.params.id, driveSyncStatus: { in: ["LOCAL", "ERROR"] } }, data: { driveSyncStatus: "PENDING", driveSyncError: null } });
  res.json({ queued: result.count });
}));
router.get("/projects/:id/browse", route(async (req, res) => {
  const project = await prisma.production.findUnique({ where: { id: req.params.id }, select: { driveFolderId: true, workspaceVersion: true } });
  if (!project?.driveFolderId) throw new Error("Link a project folder first.");
  const { client, connection } = await driveClient();
  const folder = req.query.folderId ? driveId(req.query.folderId) : project.driveFolderId;
  await client.withinRoot(project.driveFolderId, connection.rootFolderId);
  await client.withinRoot(folder, project.driveFolderId);
  res.json(await client.children(folder, typeof req.query.pageToken === "string" ? req.query.pageToken : undefined));
}));
function driveErrorHandler(error: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) {
  if (error.code === "P2002") { res.status(409).json({ error: "That folder is already linked to another project." }); return; }
  const message = error.message;
  // Do not expose Prisma diagnostics, connection strings or provider token responses.
  res.status(400).json({ error: /Google|folder|project|Project|permission|Drive|connection|Select|Link|Choose|Invalid|Enter|Use/.test(message) && !message.includes("prisma") ? message : "Drive request failed. Check the connection and try again." });
}
router.use(driveErrorHandler);
export default router;
