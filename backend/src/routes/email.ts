import { Router, Request, Response } from "express";
import { EmailProvider } from "@prisma/client";
import prisma from "../prisma";
import { encrypt } from "../services/encryptionService";
import {
  exchangeGoogleCode,
  getGoogleOAuthUrl,
  getIdleStatus,
  getEmailAttachment,
  getImapClient,
  getThread,
  getThreads,
  googleOAuthConfigured,
  saveEmailAttachmentToJob,
  sendEmail,
  startIdleSync,
  stopIdleSync,
  syncAccount,
} from "../services/emailService";

const router = Router();

type AccountBody = {
  label?: string;
  emailAddress?: string;
  provider?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
  password?: string;
  isActive?: boolean;
  isPrimary?: boolean;
};

function boolQuery(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
}

function intValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function contentDispositionFilename(filename: string): string {
  return filename.replace(/"/g, "'");
}

function redactAccount<T extends { encryptedPassword?: string | null; encryptedAccessToken?: string | null; encryptedRefreshToken?: string | null }>(account: T) {
  return {
    ...account,
    encryptedPassword: account.encryptedPassword ? "redacted" : null,
    encryptedAccessToken: account.encryptedAccessToken ? "redacted" : null,
    encryptedRefreshToken: account.encryptedRefreshToken ? "redacted" : null,
  };
}

async function testAccountConnection(accountId: string): Promise<void> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");
  const client = await getImapClient(account);
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

router.get("/accounts", async (_req: Request, res: Response): Promise<void> => {
  const accounts = await prisma.emailAccount.findMany({ orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  res.json(accounts.map(redactAccount));
});

router.post("/accounts", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AccountBody;
  if (!body.label || !body.emailAddress || !body.username || !body.password) {
    res.status(400).json({ error: "Label, email address, username and password are required" });
    return;
  }
  const account = await prisma.emailAccount.create({
    data: {
      label: body.label,
      emailAddress: body.emailAddress.toLowerCase(),
      provider: EmailProvider.IMAP,
      imapHost: body.imapHost || "imap.gmail.com",
      imapPort: intValue(body.imapPort) ?? 993,
      smtpHost: body.smtpHost || "smtp.gmail.com",
      smtpPort: intValue(body.smtpPort) ?? 587,
      username: body.username,
      encryptedPassword: encrypt(body.password),
      isPrimary: Boolean(body.isPrimary),
    },
  });
  try {
    await testAccountConnection(account.id);
  } catch (err) {
    await prisma.emailAccount.delete({ where: { id: account.id } });
    res.status(400).json({ error: err instanceof Error ? err.message : "Connection failed" });
    return;
  }
  if (account.isPrimary) {
    await prisma.emailAccount.updateMany({ where: { id: { not: account.id } }, data: { isPrimary: false } });
  }
  syncAccount(account.id).catch((err) => console.error("Initial email sync failed:", err));
  startIdleSync(account.id).catch((err) => console.error("Initial IDLE sync failed:", err));
  res.status(201).json(redactAccount(account));
});

router.patch("/accounts/:accountId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AccountBody;
  if (body.isPrimary) {
    await prisma.emailAccount.updateMany({ where: { id: { not: req.params.accountId } }, data: { isPrimary: false } });
  }
  const account = await prisma.emailAccount.update({
    where: { id: req.params.accountId },
    data: {
      label: body.label,
      isActive: body.isActive,
      isPrimary: body.isPrimary,
    },
  });
  if (body.isActive === false) stopIdleSync(account.id);
  if (body.isActive === true) startIdleSync(account.id).catch((err) => console.error("IDLE restart failed:", err));
  res.json(redactAccount(account));
});

router.delete("/accounts/:accountId", async (req: Request, res: Response): Promise<void> => {
  stopIdleSync(req.params.accountId);
  await prisma.emailAccount.delete({ where: { id: req.params.accountId } });
  res.status(204).end();
});

router.post("/accounts/:accountId/sync", async (req: Request, res: Response): Promise<void> => {
  const { accountId } = req.params;
  res.json({ status: "syncing" });
  try {
    console.log(`[EMAIL SYNC] Starting manual sync for account ${accountId}`);
    await syncAccount(accountId);
    console.log(`[EMAIL SYNC] Manual sync completed for account ${accountId}`);
  } catch (err) {
    console.error(`[EMAIL SYNC] Manual sync failed for account ${accountId}:`, err instanceof Error ? err.message : err);
    if (err instanceof Error) console.error(err.stack);
  }
});

router.post("/accounts/:accountId/test", async (req: Request, res: Response): Promise<void> => {
  try {
    await testAccountConnection(req.params.accountId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
  }
});

router.post("/test-imap", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AccountBody;
  if (!body.emailAddress || !body.username || !body.password) {
    res.status(400).json({ success: false, error: "Email address, username and password are required" });
    return;
  }
  const account = await prisma.emailAccount.create({
    data: {
      label: "Connection test",
      emailAddress: body.emailAddress.toLowerCase(),
      provider: EmailProvider.IMAP,
      imapHost: body.imapHost || "imap.gmail.com",
      imapPort: intValue(body.imapPort) ?? 993,
      smtpHost: body.smtpHost || "smtp.gmail.com",
      smtpPort: intValue(body.smtpPort) ?? 587,
      username: body.username,
      encryptedPassword: encrypt(body.password),
      isActive: false,
    },
  });
  try {
    await testAccountConnection(account.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : "Connection failed" });
  } finally {
    await prisma.emailAccount.delete({ where: { id: account.id } }).catch(() => undefined);
  }
});

router.get("/oauth/google/start", (_req: Request, res: Response): void => {
  if (!googleOAuthConfigured()) {
    res.status(503).json({ error: "Google OAuth not configured" });
    return;
  }
  res.json({ url: getGoogleOAuthUrl() });
});

export async function googleOAuthCallbackHandler(req: Request, res: Response): Promise<void> {
  if (!googleOAuthConfigured()) {
    res.status(503).json({ error: "Google OAuth not configured" });
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    res.status(400).json({ error: "Missing OAuth code" });
    return;
  }
  try {
    const token = await exchangeGoogleCode(code);
    const emailAddress = token.emailAddress;
    await prisma.emailAccount.deleteMany({
      where: {
        OR: [
          { emailAddress: { contains: "unknown.local" } },
          { emailAddress: "unknown" },
        ],
      },
    });
    const account = await prisma.emailAccount.create({
      data: {
        label: "Gmail",
        emailAddress,
        provider: EmailProvider.GOOGLE,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        username: emailAddress,
        encryptedAccessToken: encrypt(token.accessToken),
        encryptedRefreshToken: token.refreshToken ? encrypt(token.refreshToken) : undefined,
        tokenExpiry: token.expiresAt,
      },
    });
    syncAccount(account.id).catch((err) => console.error("Google initial sync failed:", err));
    startIdleSync(account.id).catch((err) => console.error("Google IDLE sync failed:", err));
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gmail connected</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1f; background: #f8f8f6; }
      main { width: min(420px, calc(100vw - 32px)); border: 1px solid #e5e5e5; border-radius: 12px; background: white; padding: 24px; text-align: center; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 8px; font-size: 18px; }
      p { margin: 0 0 16px; color: #666; font-size: 14px; line-height: 1.5; }
      a { color: #1a1a1f; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>Gmail connected successfully</h1>
      <p>This tab should close automatically. Your email account list will refresh in Settings.</p>
      <a href="/settings?section=email&connected=true">Return to settings</a>
    </main>
    <script>
      window.opener?.postMessage('gmail-connected', '*');
      window.setTimeout(function () { window.close(); }, 300);
    </script>
  </body>
</html>`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth failed";
    res.status(400).type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>OAuth failed</title></head>
  <body>
    <h2>OAuth failed</h2>
    <pre>${JSON.stringify({ error: message }, null, 2)}</pre>
    <a href="/settings?section=email">Return to settings</a>
  </body>
</html>`);
  }
}

router.get("/oauth/google/callback", googleOAuthCallbackHandler);

router.get("/threads", async (req: Request, res: Response): Promise<void> => {
  const result = await getThreads({
    accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
    folder: req.query.folder === "sent" || req.query.folder === "flagged" || req.query.folder === "archived" || req.query.folder === "inbox" ? req.query.folder : undefined,
    isRead: req.query.unread !== undefined ? !boolQuery(req.query.unread) : undefined,
    isFlagged: boolQuery(req.query.flagged),
    isArchived: boolQuery(req.query.archived),
    linkedTo: typeof req.query.linkedTo === "string" ? req.query.linkedTo : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    page: intValue(req.query.page),
  });
  res.json(result);
});

router.get("/threads/:threadId", async (req: Request, res: Response): Promise<void> => {
  const thread = await getThread(req.params.threadId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  await prisma.emailThread.update({ where: { id: req.params.threadId }, data: { isRead: true } });
  res.json({ ...thread, isRead: true });
});

router.patch("/threads/:threadId/read", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: { isRead: Boolean((req.body as { isRead?: boolean }).isRead) },
  });
  res.json(thread);
});

router.patch("/threads/:threadId/flag", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const thread = await prisma.emailThread.update({ where: { id: current.id }, data: { isFlagged: !current.isFlagged } });
  res.json(thread);
});

router.patch("/threads/:threadId/archive", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.update({ where: { id: req.params.threadId }, data: { isArchived: true } });
  res.json(thread);
});

router.patch("/threads/:threadId/link", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { contactId?: string; opportunityId?: string; productionId?: string };
  const thread = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: {
      linkedContactId: body.contactId ?? null,
      linkedOpportunityId: body.opportunityId ?? null,
      linkedProductionId: body.productionId ?? null,
    },
  });
  res.json(thread);
});

router.patch("/threads/:threadId/unlink", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: { linkedContactId: null, linkedOpportunityId: null, linkedProductionId: null },
  });
  res.json(thread);
});

router.post("/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const message = await sendEmail(req.body);
    res.status(201).json(message);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to send email" });
  }
});

router.post("/threads/:threadId/reply", async (req: Request, res: Response): Promise<void> => {
  const thread = await getThread(req.params.threadId);
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const body = req.body as { fromAccountId?: string; bodyHtml?: string; replyAll?: boolean };
  const last = thread.messages[thread.messages.length - 1];
  const recipients = body.replyAll
    ? thread.participants.filter((participant) => participant !== thread.account?.emailAddress.toLowerCase())
    : [last?.fromAddress].filter((value): value is string => Boolean(value));
  const message = await sendEmail({
    fromAccountId: body.fromAccountId ?? thread.accountId ?? "",
    to: recipients,
    subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
    bodyHtml: body.bodyHtml ?? "",
    threadId: thread.id,
    inReplyTo: last?.externalMessageId,
    linkedOpportunityId: thread.linkedOpportunityId ?? undefined,
    linkedProductionId: thread.linkedProductionId ?? undefined,
  });
  res.status(201).json(message);
});

router.get("/messages/:messageId/attachment/:index", async (req: Request, res: Response): Promise<void> => {
  try {
    const index = intValue(req.params.index);
    if (index === undefined || index < 0) {
      res.status(400).json({ error: "Invalid attachment index" });
      return;
    }
    const attachment = await getEmailAttachment(req.params.messageId, index);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(attachment.content.byteLength));
    res.setHeader("Content-Disposition", `attachment; filename="${contentDispositionFilename(attachment.filename)}"`);
    res.send(attachment.content);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Attachment not found" });
  }
});

router.post("/messages/:messageId/attachment/:index/save-to-job", async (req: Request, res: Response): Promise<void> => {
  try {
    const index = intValue(req.params.index);
    if (index === undefined || index < 0) {
      res.status(400).json({ error: "Invalid attachment index" });
      return;
    }
    const body = req.body as { productionId?: string; folder?: string; notes?: string };
    if (!body.productionId || !body.folder) {
      res.status(400).json({ error: "productionId and folder are required" });
      return;
    }
    const file = await saveEmailAttachmentToJob({
      messageId: req.params.messageId,
      attachmentIndex: index,
      productionId: body.productionId,
      folder: body.folder,
      notes: body.notes,
    });
    res.status(201).json(file);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save attachment" });
  }
});

router.get("/templates", async (_req: Request, res: Response): Promise<void> => {
  res.json(await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } }));
});

router.post("/templates", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; subject?: string; bodyHtml?: string; defaultCc?: string; defaultBcc?: string };
  const template = await prisma.emailTemplate.create({
    data: {
      name: body.name ?? "Untitled",
      subject: body.subject ?? "",
      bodyHtml: body.bodyHtml ?? "",
      defaultCc: body.defaultCc,
      defaultBcc: body.defaultBcc,
    },
  });
  res.status(201).json(template);
});

router.patch("/templates/:id", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; subject?: string; bodyHtml?: string; defaultCc?: string; defaultBcc?: string };
  res.json(await prisma.emailTemplate.update({ where: { id: req.params.id }, data: body }));
});

router.delete("/templates/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.emailTemplate.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.get("/signature", async (_req: Request, res: Response): Promise<void> => {
  const settings = await prisma.settings.findFirst();
  const primaryAccount = await prisma.emailAccount.findFirst({
    where: { isPrimary: true, isActive: true },
  });
  const fallbackEmail = primaryAccount?.emailAddress ?? "conor@unlimited.bond";
  const rawSignature = settings?.defaultEmailSignature || `Conor | unlimited.bond | ${fallbackEmail}`;
  res.json({ signature: rawSignature.replace("[emailAddress]", fallbackEmail) });
});

router.patch("/signature", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { signature?: string };
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }
  const updated = await prisma.settings.update({ where: { id: settings.id }, data: { defaultEmailSignature: body.signature ?? "" } });
  res.json({ signature: updated.defaultEmailSignature });
});

router.get("/unread-count", async (_req: Request, res: Response): Promise<void> => {
  const count = await prisma.emailThread.count({ where: { isRead: false, isArchived: false, account: { isActive: true } } });
  res.json({ count });
});

router.get("/health", async (_req: Request, res: Response): Promise<void> => {
  const statuses = getIdleStatus();
  const accounts = await prisma.emailAccount.findMany({ orderBy: { createdAt: "asc" } });
  res.json(accounts.map((account) => ({
    accountId: account.id,
    emailAddress: account.emailAddress,
    connected: statuses.get(account.id)?.connected ?? false,
    lastSyncedAt: account.lastSyncedAt,
  })));
});

export default router;
