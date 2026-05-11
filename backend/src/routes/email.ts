import { Router, Request, Response } from "express";
import { ContactSource, ContactType, EmailProvider, PmsJobType, Prisma } from "@prisma/client";
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
import { fullGmailSync } from "../services/gmailSyncService";
import { archiveThread as gmailArchiveThread, markThreadRead, markThreadUnread, starThread, unarchiveThread as gmailUnarchiveThread, unstarThread } from "../services/gmailService";

const router = Router();

type LinkTargets = {
  opportunityId?: string;
  productionId?: string;
  contactId?: string;
};

function cleanSubject(subject: string): string {
  return subject.replace(/^(re|fwd?|fw):\s*/gi, "").trim() || subject;
}

function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "Unknown",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function inferNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._\-+]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ") || email;
}

function inferCompanyFromEmail(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const parts = domain.split(".").filter(Boolean);
  const main = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return main ? main.charAt(0).toUpperCase() + main.slice(1) : "";
}

async function findOrCreateCompany(name?: string | null): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await prisma.company.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing.id;
  const created = await prisma.company.create({ data: { name: trimmed } });
  return created.id;
}

const emailThreadCrmInclude = {
  linkedContact: { include: { company: true } },
  linkedOpportunity: { include: { company: true } },
  linkedProduction: true,
} satisfies Prisma.EmailThreadInclude;

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
  if (account.provider !== EmailProvider.GOOGLE) startIdleSync(account.id).catch((err) => console.error("Initial IDLE sync failed:", err));
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
  if (body.isActive === true && account.provider !== EmailProvider.GOOGLE) startIdleSync(account.id).catch((err) => console.error("IDLE restart failed:", err));
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
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (account?.provider === EmailProvider.GOOGLE) await fullGmailSync(account);
    else await syncAccount(accountId);
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
    fullGmailSync(account).catch((err) => console.error("[GMAIL SYNC] Google initial sync failed:", err));
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
    folder: req.query.folder === "sent" || req.query.folder === "flagged" || req.query.folder === "archived" || req.query.folder === "inbox" || req.query.folder === "starred" || req.query.folder === "unread" || req.query.folder === "all" ? req.query.folder : undefined,
    isRead: req.query.unread !== undefined ? !boolQuery(req.query.unread) : undefined,
    isFlagged: boolQuery(req.query.flagged),
    isArchived: boolQuery(req.query.archived),
    linkedTo: typeof req.query.linkedTo === "string" ? req.query.linkedTo : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    page: intValue(req.query.page),
  });
  res.json(result);
});

router.get("/threads/search-link-targets", async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type : "all";
  const results: {
    opportunities?: Array<{ id: string; title: string; clientName: string | null; brand: string | null; stage: string; value: string | null; company?: { id: string; name: string } | null }>;
    productions?: Array<{ id: string; title: string; jobCode: string | null; clientName: string | null; brand: string | null; status: string }>;
    contacts?: Array<{ id: string; firstName: string; lastName: string | null; email: string | null; type: string; company?: { id: string; name: string } | null }>;
  } = {};
  const contains = { contains: q, mode: "insensitive" as const };

  if (type === "all" || type === "opportunity") {
    results.opportunities = await prisma.opportunity.findMany({
      where: {
        stage: { not: "LOST" },
        ...(q ? {
          OR: [
            { title: contains },
            { clientName: contains },
            { brand: contains },
            { description: contains },
            { company: { name: contains } },
          ],
        } : {}),
      },
      select: { id: true, title: true, clientName: true, brand: true, stage: true, value: true, company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }).then((items) => items.map((item) => ({ ...item, value: item.value?.toString() ?? null })));
  }

  if (type === "all" || type === "production") {
    results.productions = await prisma.production.findMany({
      where: {
        status: { not: "WRAPPED" },
        ...(q ? {
          OR: [
            { title: contains },
            { clientName: contains },
            { brand: contains },
            { jobCode: contains },
          ],
        } : {}),
      },
      select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  }

  if (type === "all" || type === "contact") {
    results.contacts = await prisma.contact.findMany({
      where: q ? {
        OR: [
          { firstName: contains },
          { lastName: contains },
          { email: contains },
          { company: { name: contains } },
        ],
      } : {},
      select: { id: true, firstName: true, lastName: true, email: true, type: true, company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  }

  res.json(results);
});

router.get("/threads/:threadId", async (req: Request, res: Response): Promise<void> => {
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : undefined;
  const thread = await getThread(req.params.threadId, {
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    limit: intValue(req.query.limit),
  });
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (!thread.isRead && thread.account?.provider === EmailProvider.GOOGLE && thread.gmailThreadId) {
    markThreadRead(thread.account, thread.gmailThreadId).catch((err) => console.error("[GMAIL] Mark read failed:", err instanceof Error ? err.message : err));
  }
  await prisma.emailThread.update({ where: { id: req.params.threadId }, data: { isRead: true, isUnread: false } });
  await prisma.emailMessage.updateMany({ where: { threadId: req.params.threadId }, data: { isUnread: false } });
  res.json({ ...thread, isRead: true });
});

router.patch("/threads/:threadId/read", async (req: Request, res: Response): Promise<void> => {
  const read = Boolean((req.body as { isRead?: boolean; read?: boolean }).isRead ?? (req.body as { read?: boolean }).read);
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) {
    if (read) await markThreadRead(current.account, current.gmailThreadId);
    else await markThreadUnread(current.account, current.gmailThreadId);
  }
  const thread = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: { isRead: read, isUnread: !read },
  });
  await prisma.emailMessage.updateMany({ where: { threadId: thread.id }, data: { isUnread: !read } });
  res.json(thread);
});

router.post("/threads/:threadId/read", async (req: Request, res: Response): Promise<void> => {
  const read = Boolean((req.body as { read?: boolean }).read);
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) {
    if (read) await markThreadRead(current.account, current.gmailThreadId);
    else await markThreadUnread(current.account, current.gmailThreadId);
  }
  await prisma.emailThread.update({ where: { id: current.id }, data: { isRead: read, isUnread: !read } });
  await prisma.emailMessage.updateMany({ where: { threadId: current.id }, data: { isUnread: !read } });
  res.json({ success: true });
});

router.patch("/threads/:threadId/flag", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const account = current.accountId ? await prisma.emailAccount.findUnique({ where: { id: current.accountId } }) : null;
  const starred = !current.isFlagged;
  if (account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) {
    if (starred) await starThread(account, current.gmailThreadId);
    else await unstarThread(account, current.gmailThreadId);
  }
  const thread = await prisma.emailThread.update({ where: { id: current.id }, data: { isFlagged: starred, isStarred: starred } });
  res.json(thread);
});

router.post("/threads/:threadId/star", async (req: Request, res: Response): Promise<void> => {
  const starred = Boolean((req.body as { starred?: boolean }).starred);
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) {
    if (starred) await starThread(current.account, current.gmailThreadId);
    else await unstarThread(current.account, current.gmailThreadId);
  }
  const thread = await prisma.emailThread.update({ where: { id: current.id }, data: { isFlagged: starred, isStarred: starred } });
  res.json(thread);
});

router.patch("/threads/:threadId/archive", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) {
    await gmailArchiveThread(current.account, current.gmailThreadId);
  }
  const thread = await prisma.emailThread.update({ where: { id: req.params.threadId }, data: { isArchived: true, inInbox: false } });
  res.json(thread);
});

router.post("/threads/:threadId/archive", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) await gmailArchiveThread(current.account, current.gmailThreadId);
  const thread = await prisma.emailThread.update({ where: { id: current.id }, data: { isArchived: true, inInbox: false } });
  res.json(thread);
});

router.post("/threads/:threadId/unarchive", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.emailThread.findUnique({ where: { id: req.params.threadId }, include: { account: true } });
  if (!current) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  if (current.account?.provider === EmailProvider.GOOGLE && current.gmailThreadId) await gmailUnarchiveThread(current.account, current.gmailThreadId);
  const thread = await prisma.emailThread.update({ where: { id: current.id }, data: { isArchived: false, inInbox: true } });
  res.json(thread);
});

router.patch("/threads/:threadId/link", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as LinkTargets;
  if (!body.opportunityId && !body.productionId && !body.contactId) {
    res.status(400).json({ error: "At least one link target required" });
    return;
  }
  const updated = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: {
      linkedOpportunityId: body.opportunityId ?? undefined,
      linkedProductionId: body.productionId ?? undefined,
      linkedContactId: body.contactId ?? undefined,
    },
    include: emailThreadCrmInclude,
  });
  console.log(`[EMAIL CRM] Linked thread ${req.params.threadId} → opportunity:${body.opportunityId ?? ""} production:${body.productionId ?? ""} contact:${body.contactId ?? ""}`);
  res.json(updated);
});

router.patch("/threads/:threadId/unlink", async (req: Request, res: Response): Promise<void> => {
  const field = ((req.body as { field?: string }).field ?? "all").toLowerCase();
  const data: Prisma.EmailThreadUpdateInput = {};
  if (field === "opportunity" || field === "all") data.linkedOpportunity = { disconnect: true };
  if (field === "production" || field === "all") data.linkedProduction = { disconnect: true };
  if (field === "contact" || field === "all") data.linkedContact = { disconnect: true };
  const updated = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data,
    include: emailThreadCrmInclude,
  });
  console.log(`[EMAIL CRM] Unlinked ${field} from thread ${req.params.threadId}`);
  res.json(updated);
});

router.post("/threads/:threadId/create-opportunity", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.findUnique({
    where: { id: req.params.threadId },
    include: {
      account: true,
      messages: {
        orderBy: { sentAt: "asc" },
        take: 8,
        select: { fromAddress: true, fromName: true, bodyText: true, snippet: true, sentAt: true, isFromMe: true },
      },
    },
  });
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  const firstExternal = thread.messages.find((message) => !message.isFromMe) ?? thread.messages[0];
  const senderEmail = firstExternal?.fromAddress ?? "";
  const senderName = firstExternal?.fromName || inferNameFromEmail(senderEmail);
  const existingContact = senderEmail
    ? await prisma.contact.findFirst({
        where: { email: { equals: senderEmail, mode: "insensitive" } },
        include: { company: true },
      })
    : null;
  const company = existingContact?.company?.name || inferCompanyFromEmail(senderEmail);
  const bodyText = firstExternal?.bodyText || firstExternal?.snippet || thread.snippet || "";
  res.json({
    prefill: {
      title: cleanSubject(thread.subject),
      clientName: existingContact ? `${existingContact.firstName}${existingContact.lastName ? ` ${existingContact.lastName}` : ""}` : senderName || company,
      company,
      contactId: existingContact?.id ?? null,
      contactEmail: senderEmail,
      contactName: senderName,
      source: "EMAIL",
      description: bodyText.slice(0, 500).trim(),
      dateReceived: firstExternal?.sentAt ?? new Date(),
      linkedThreadId: thread.id,
    },
    thread: {
      id: thread.id,
      subject: thread.subject,
      participants: thread.participants,
    },
  });
});

router.post("/threads/:threadId/confirm-opportunity", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    title?: string;
    clientName?: string;
    company?: string;
    brand?: string;
    jobType?: PmsJobType;
    estimatedValue?: number | string;
    followUpDate?: string;
    description?: string;
    contactId?: string;
    contactEmail?: string;
    contactName?: string;
    createContact?: boolean;
  };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "title required" });
    return;
  }
  if (!body.clientName?.trim()) {
    res.status(400).json({ error: "clientName required" });
    return;
  }
  const title = body.title.trim();
  const clientName = body.clientName.trim();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const companyId = await (async () => {
        const trimmed = body.company?.trim();
        if (!trimmed) return undefined;
        const existing = await tx.company.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
        if (existing) return existing.id;
        const created = await tx.company.create({ data: { name: trimmed } });
        return created.id;
      })();

      let resolvedContactId = body.contactId || undefined;
      if (body.createContact && body.contactEmail && !resolvedContactId) {
        const existing = await tx.contact.findFirst({ where: { email: { equals: body.contactEmail, mode: "insensitive" } } });
        if (existing) {
          resolvedContactId = existing.id;
        } else {
          const name = splitName(body.contactName || body.clientName || inferNameFromEmail(body.contactEmail));
          const contact = await tx.contact.create({
            data: {
              firstName: name.firstName,
              lastName: name.lastName,
              email: body.contactEmail.toLowerCase(),
              companyId,
              type: ContactType.CLIENT,
              source: ContactSource.OTHER,
            },
          });
          resolvedContactId = contact.id;
          console.log(`[EMAIL CRM] Created contact ${contact.email ?? contact.id} from opportunity creation`);
        }
      }

      const opportunity = await tx.opportunity.create({
        data: {
          title,
          clientName,
          companyId,
          brand: body.brand || undefined,
          jobType: body.jobType,
          value: body.estimatedValue !== undefined && body.estimatedValue !== "" ? String(body.estimatedValue) : undefined,
          description: body.description || undefined,
          source: "EMAIL",
          stage: "ENQUIRY",
          dateReceived: new Date(),
          followUpDate: body.followUpDate ? new Date(body.followUpDate) : undefined,
          contactId: resolvedContactId,
        },
        include: { contact: true, company: true },
      });

      await tx.emailThread.update({
        where: { id: req.params.threadId },
        data: {
          linkedOpportunityId: opportunity.id,
          linkedContactId: resolvedContactId,
        },
      });

      return { opportunity, linked: true };
    });
    console.log(`[EMAIL CRM] Created opportunity ${result.opportunity.id} from thread ${req.params.threadId}`);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create opportunity" });
  }
});

router.get("/threads/:threadId/people", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.findUnique({
    where: { id: req.params.threadId },
    include: {
      account: true,
      messages: {
        select: {
          fromAddress: true,
          fromName: true,
          toAddresses: true,
          ccAddresses: true,
          bccAddresses: true,
          isFromMe: true,
        },
      },
    },
  });
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const addressMap = new Map<string, { email: string; name: string; roles: string[] }>();
  const addAddress = (email: string, name: string, role: string): void => {
    const key = email.toLowerCase().trim();
    if (!key || !key.includes("@")) return;
    const existing = addressMap.get(key);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      if (!existing.name && name) existing.name = name;
    } else {
      addressMap.set(key, { email: key, name, roles: [role] });
    }
  };

  for (const message of thread.messages) {
    addAddress(message.fromAddress, message.fromName ?? "", "from");
    message.toAddresses.forEach((email) => addAddress(email, "", "to"));
    message.ccAddresses.forEach((email) => addAddress(email, "", "cc"));
    message.bccAddresses.forEach((email) => addAddress(email, "", "bcc"));
  }

  const addresses = Array.from(addressMap.keys());
  const contacts = addresses.length
    ? await prisma.contact.findMany({
        where: { email: { in: addresses, mode: "insensitive" } },
        include: { company: true },
      })
    : [];
  const contactByEmail = new Map(contacts.map((contact) => [contact.email?.toLowerCase(), contact]));
  const accountEmail = thread.account?.emailAddress.toLowerCase();
  const roleOrder = ["from", "to", "cc", "bcc"];
  const people = Array.from(addressMap.values())
    .map((person) => {
      const contact = contactByEmail.get(person.email.toLowerCase()) ?? null;
      return {
        email: person.email,
        name: contact ? `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}` : person.name || inferNameFromEmail(person.email),
        roles: person.roles,
        inferredCompany: contact?.company?.name ?? inferCompanyFromEmail(person.email),
        domain: person.email.split("@")[1] ?? "",
        isMe: person.email.toLowerCase() === accountEmail,
        existingContact: contact ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          type: contact.type,
          company: contact.company,
        } : null,
        isLinkedToThread: Boolean(contact && thread.linkedContactId === contact.id),
      };
    })
    .sort((a, b) => {
      const aOrder = Math.min(...a.roles.map((role) => roleOrder.indexOf(role)).filter((index) => index >= 0));
      const bOrder = Math.min(...b.roles.map((role) => roleOrder.indexOf(role)).filter((index) => index >= 0));
      return aOrder - bOrder;
    });

  res.json({ people });
});

router.post("/threads/:threadId/people/create-contact", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    email?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    type?: ContactType;
    tags?: string[];
    linkToThread?: boolean;
  };
  if (!body.email || !body.firstName) {
    res.status(400).json({ error: "email and firstName required" });
    return;
  }
  const existing = await prisma.contact.findFirst({
    where: { email: { equals: body.email, mode: "insensitive" } },
    include: { company: true },
  });
  if (existing) {
    res.status(409).json({ error: "Contact already exists", contact: existing });
    return;
  }
  const companyId = await findOrCreateCompany(body.company);
  const contact = await prisma.contact.create({
    data: {
      firstName: body.firstName.trim(),
      lastName: body.lastName?.trim() || null,
      email: body.email.toLowerCase(),
      companyId,
      type: body.type ?? ContactType.CLIENT,
      source: ContactSource.OTHER,
      tags: body.tags ?? [],
    },
    include: { company: true },
  });
  if (body.linkToThread ?? true) {
    const thread = await prisma.emailThread.findUnique({ where: { id: req.params.threadId } });
    if (thread && !thread.linkedContactId) {
      await prisma.emailThread.update({ where: { id: thread.id }, data: { linkedContactId: contact.id } });
    }
  }
  console.log(`[EMAIL CRM] Created contact ${contact.email ?? contact.id} from thread ${req.params.threadId}`);
  res.json(contact);
});

router.post("/threads/:threadId/people/link-contact", async (req: Request, res: Response): Promise<void> => {
  const contactId = (req.body as { contactId?: string }).contactId;
  if (!contactId) {
    res.status(400).json({ error: "contactId required" });
    return;
  }
  const updated = await prisma.emailThread.update({
    where: { id: req.params.threadId },
    data: { linkedContactId: contactId },
    include: emailThreadCrmInclude,
  });
  console.log(`[EMAIL CRM] Linked contact ${contactId} to thread ${req.params.threadId}`);
  res.json(updated);
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
    const body = req.body as { productionId?: string | null; notes?: string };
    const productionId = typeof body.productionId === "string" && body.productionId.trim()
      ? body.productionId.trim()
      : undefined;
    const file = await saveEmailAttachmentToJob({
      messageId: req.params.messageId,
      attachmentIndex: index,
      productionId,
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
  const count = await prisma.emailThread.count({
    where: {
      OR: [{ isRead: false }, { isUnread: true }],
      isArchived: false,
      inInbox: true,
      isTrashed: false,
      account: { isActive: true },
    },
  });
  res.json({ count });
});

router.get("/search", async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ threads: [] });
    return;
  }
  const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
  const threads = await prisma.emailThread.findMany({
    where: {
      accountId,
      isTrashed: false,
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { snippet: { contains: q, mode: "insensitive" } },
        { participants: { has: q.toLowerCase() } },
        { messages: { some: { bodyText: { contains: q, mode: "insensitive" } } } },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
    include: {
      linkedContact: { include: { company: true } },
      linkedOpportunity: true,
      linkedProduction: true,
      _count: { select: { messages: true } },
    },
  });
  res.json({ threads });
});

router.get("/health", async (_req: Request, res: Response): Promise<void> => {
  const statuses = getIdleStatus();
  const accounts = await prisma.emailAccount.findMany({ orderBy: { createdAt: "asc" } });
  res.json(accounts.map((account) => ({
    accountId: account.id,
    emailAddress: account.emailAddress,
    connected: account.provider === EmailProvider.GOOGLE ? account.isActive : statuses.get(account.id)?.connected ?? false,
    lastSyncedAt: account.lastSyncedAt,
  })));
});

export default router;
