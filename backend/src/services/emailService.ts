import { EmailAccount, EmailProvider, Prisma } from "@prisma/client";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import prisma from "../prisma";
import { decrypt, encrypt } from "./encryptionService";
import { autoFileDocument, autoFileMailAttachment, isJobFolder, type JobFolder } from "./fileStorage";

const PAGE_SIZE = 50;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "email",
  "profile",
];

type IdleState = {
  client?: ImapFlow;
  retry?: NodeJS.Timeout;
  connected: boolean;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  id?: string;
  name?: string;
  verified_email?: boolean;
  picture?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenInfo = {
  email?: string;
  error?: string;
  error_description?: string;
};

type FetchMessageWithThread = {
  threadId?: string | number;
};

const idleConnections = new Map<string, IdleState>();

export interface SendEmailOptions {
  fromAccountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  linkedOpportunityId?: string;
  linkedProductionId?: string;
  threadId?: string;
  inReplyTo?: string;
}

export interface ThreadListOptions {
  accountId?: string;
  folder?: "inbox" | "sent" | "flagged" | "archived";
  isRead?: boolean;
  isFlagged?: boolean;
  isArchived?: boolean;
  linkedContactId?: string;
  linkedOpportunityId?: string;
  linkedProductionId?: string;
  linkedTo?: string;
  search?: string;
  page?: number;
}

type ThreadAttachmentSummary = {
  messageId: string;
  attachmentIndex: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isInline?: boolean;
  jobFileId?: string;
  jobFile?: {
    id: string;
    productionId: string | null;
    folder: string;
    originalFilename: string;
    storedFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
    linkedBudgetLineId: string | null;
    isReceipt: boolean;
    receiptVendor: string | null;
    receiptAmount: number | null;
    receiptDate: Date | null;
    notes: string | null;
    sourceEmailThreadId: string | null;
    sourceEmailMessageId: string | null;
    sourceEmailAttachmentIndex: number | null;
    sourceEmailFilename: string | null;
  };
};

type StoredAttachment = {
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  contentId?: string | null;
  isInline?: boolean;
};

type EmailAttachmentContent = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
};

const THREAD_MESSAGE_LIMIT = 10;

type SyncMailboxResult = {
  threadCount: number;
  messageCount: number;
  errorCount: number;
};

export function resolveDisplayName(emailAddress: string, fromName?: string | null, contactName?: string | null): string {
  if (contactName) return contactName;

  if (fromName && fromName.trim() && fromName.toLowerCase() !== emailAddress.toLowerCase()) {
    return fromName;
  }

  const [local = "", domain = ""] = emailAddress.split("@");
  const genericPrefixes = [
    "noreply",
    "no-reply",
    "info",
    "hello",
    "support",
    "contact",
    "admin",
    "team",
    "news",
    "newsletter",
    "notifications",
    "notification",
    "donotreply",
    "mailer",
    "updates",
    "reply",
    "bounce",
    "postmaster",
  ];

  if (genericPrefixes.some((prefix) => local.toLowerCase().includes(prefix))) {
    const domainParts = domain.split(".");
    const mainDomain = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0];
    const fallback = mainDomain || "unknown";
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  }

  return local
    .replace(/[._\-+]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ") || emailAddress;
}

export function getAvatarColor(email: string): string {
  const colors = [
    "#5B8DEF",
    "#E8A838",
    "#E85D5D",
    "#5DBE8A",
    "#9B5DEF",
    "#EF8C5D",
    "#5DBEE8",
    "#EF5DB8",
    "#8DEF5B",
    "#EF9B5D",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? colors[0];
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function getGoogleOAuthUrl(): string {
  if (!googleOAuthConfigured()) throw new Error("Google OAuth not configured");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES.join(" "),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  emailAddress: string;
}> {
  if (!googleOAuthConfigured()) throw new Error("Google OAuth not configured");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  });
  console.log(`[OAUTH] Token exchange response status: ${response.status}`);
  const token = await response.json() as GoogleTokenResponse;
  console.log(`[OAUTH] Has access_token: ${Boolean(token.access_token)}`);
  console.log(`[OAUTH] Has refresh_token: ${Boolean(token.refresh_token)}`);
  console.log(`[OAUTH] Token expiry: ${token.expires_in ?? 0}s`);
  if (!token.access_token) {
    console.error("[OAUTH] Token exchange failed:", JSON.stringify(token));
    throw new Error(`Token exchange failed: ${token.error_description ?? token.error ?? "unknown"}`);
  }
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const userInfo = await userInfoRes.json() as GoogleUserInfo;
  console.log("[OAUTH] Userinfo response:", JSON.stringify(userInfo));

  let emailAddress = userInfo.email;
  if (!emailAddress || emailAddress === "unknown") {
    console.error("[OAUTH] Could not get real email from userinfo:", userInfo);
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token.access_token}`);
    const tokenInfo = await tokenInfoRes.json() as GoogleTokenInfo;
    console.log("[OAUTH] Token info response:", JSON.stringify(tokenInfo));
    emailAddress = tokenInfo.email;
  }

  if (!emailAddress) {
    throw new Error("Could not get email address. Please try again.");
  }

  console.log(`[OAUTH] User email: ${emailAddress}`);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined,
    emailAddress,
  };
}

async function refreshGoogleToken(account: EmailAccount): Promise<EmailAccount> {
  if (!account.encryptedRefreshToken) {
    throw new Error(`No refresh token for ${account.emailAddress}`);
  }
  const refreshToken = decrypt(account.encryptedRefreshToken);
  console.log(`[TOKEN] Refreshing Google access token for ${account.emailAddress}`);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const token = await response.json() as GoogleTokenResponse;
  if (!token.access_token) {
    console.error("[TOKEN] Refresh failed:", token);
    throw new Error(`Token refresh failed: ${token.error_description ?? token.error ?? "unknown"}`);
  }
  console.log(`[TOKEN] Token refreshed, expires in ${token.expires_in ?? 0}s`);
  const tokenExpiry = new Date(Date.now() + ((token.expires_in ?? 3600) * 1000));
  return prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      encryptedAccessToken: encrypt(token.access_token),
      tokenExpiry,
    },
  });
}

export async function ensureAccessToken(account: EmailAccount): Promise<string> {
  if (account.provider !== EmailProvider.GOOGLE) throw new Error("Account is not Google");
  const expired = account.tokenExpiry ? account.tokenExpiry.getTime() < Date.now() + 60_000 : false;
  const refreshed = expired ? await refreshGoogleToken(account) : account;
  if (!refreshed.encryptedAccessToken) throw new Error("Google access token missing");
  return decrypt(refreshed.encryptedAccessToken);
}

export async function getImapClient(account: EmailAccount): Promise<ImapFlow> {
  if (account.provider === EmailProvider.GOOGLE) {
    if (!account.encryptedAccessToken) {
      throw new Error(`No access token stored for ${account.emailAddress}`);
    }

    let accessToken: string;
    try {
      accessToken = decrypt(account.encryptedAccessToken);
    } catch (err) {
      throw new Error(`Failed to decrypt access token for ${account.emailAddress}: ${err instanceof Error ? err.message : "unknown"}`);
    }

    console.log(`[IMAP] Creating Google OAuth2 ImapFlow client for ${account.emailAddress}`);

    return new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: account.emailAddress,
        accessToken,
      },
      logger: false,
    });
  }

  if (!account.encryptedPassword) {
    throw new Error(`No password stored for ${account.emailAddress}`);
  }

  const password = decrypt(account.encryptedPassword);
  console.log(`[IMAP] Creating IMAP client for ${account.emailAddress} at ${account.imapHost}:${account.imapPort}`);

  return new ImapFlow({
    host: account.imapHost ?? "imap.gmail.com",
    port: account.imapPort ?? 993,
    secure: (account.imapPort ?? 993) === 993,
    auth: {
      user: account.username ?? account.emailAddress,
      pass: password,
    },
    logger: false,
  });
}

export async function getSmtpTransporter(account: EmailAccount) {
  const user = account.username || account.emailAddress;
  const secure = (account.smtpPort ?? 587) === 465;
  if (account.provider === EmailProvider.GOOGLE) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: account.encryptedRefreshToken ? decrypt(account.encryptedRefreshToken) : undefined,
        accessToken: await ensureAccessToken(account),
      },
    });
  }
  return nodemailer.createTransport({
    host: account.smtpHost || account.imapHost || "localhost",
    port: account.smtpPort ?? 587,
    secure,
    auth: {
      user,
      pass: account.encryptedPassword ? decrypt(account.encryptedPassword) : "",
    },
  });
}

function addressList(address?: AddressObject | AddressObject[]): string[] {
  if (!address) return [];
  const list = Array.isArray(address) ? address.flatMap((item) => item.value) : address.value;
  return list.map((item) => item.address?.toLowerCase()).filter((value): value is string => Boolean(value));
}

function firstAddress(address?: AddressObject | AddressObject[]): { address: string; name?: string } {
  const source = Array.isArray(address) ? address[0] : address;
  const first = source?.value[0];
  return { address: first?.address?.toLowerCase() ?? "", name: first?.name || undefined };
}

function headerValue(mail: ParsedMail, name: string): string | undefined {
  const value = mail.headers.get(name.toLowerCase());
  if (!value) return undefined;
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

function threadKey(mail: ParsedMail): string {
  const gmailThread = headerValue(mail, "x-gm-thrid");
  if (gmailThread) return gmailThread;
  const references = headerValue(mail, "references");
  if (references) return references.split(/\s+/)[0] ?? references;
  const inReplyTo = headerValue(mail, "in-reply-to");
  return inReplyTo || mail.messageId || `message-${Date.now()}`;
}

function attachmentMetadata(mail: ParsedMail): Prisma.InputJsonValue {
  const html = typeof mail.html === "string" ? mail.html : "";
  return mail.attachments.map((attachment) => ({
    filename: attachment.filename ?? "attachment",
    mimeType: attachment.contentType,
    sizeBytes: attachment.size,
    contentId: attachment.contentId,
    isInline: isInlineMailAttachment(attachment.contentId, html),
  }));
}

function isInlineMailAttachment(contentId: string | undefined, html: string): boolean {
  if (!contentId) return false;
  const cleanContentId = contentId.replace(/[<>]/g, "");
  return html.includes(`cid:${contentId}`) || html.includes(`cid:${cleanContentId}`);
}

function contactDisplayName(contact?: { firstName: string; lastName: string | null } | null): string | null {
  if (!contact) return null;
  return `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
}

function parseAttachments(value: Prisma.JsonValue): StoredAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: StoredAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const attachment = item as Record<string, Prisma.JsonValue>;
    attachments.push({
      filename: typeof attachment.filename === "string" ? attachment.filename : "attachment",
      mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : "application/octet-stream",
      sizeBytes: typeof attachment.sizeBytes === "number" ? attachment.sizeBytes : 0,
      contentId: typeof attachment.contentId === "string" ? attachment.contentId : null,
      isInline: typeof attachment.isInline === "boolean" ? attachment.isInline : false,
    });
  }
  return attachments;
}

async function syncMailbox(client: ImapFlow, account: EmailAccount, folderName: string, forceFromMe: boolean): Promise<SyncMailboxResult> {
  const mailbox = await client.mailboxOpen(folderName);
  console.log(`[SYNC] Opened ${folderName} — total messages: ${mailbox.exists}`);

  const syncDays = parseInt(process.env.EMAIL_SYNC_DAYS ?? "7", 10);
  const syncLimit = parseInt(process.env.EMAIL_SYNC_LIMIT ?? "200", 10);
  const since = new Date();
  since.setDate(since.getDate() - syncDays);

  console.log(`[SYNC] Searching ${folderName} for messages since ${since.toDateString()} (${syncDays} days)`);

  const searchResult = await client.search({ since }, { uid: true });
  const allUids = searchResult || [];
  const recentUids = allUids.slice(-syncLimit);

  console.log(`[SYNC] Found ${allUids.length} messages in ${folderName} since ${syncDays} days ago, fetching most recent ${recentUids.length}`);

  if (recentUids.length === 0) {
    console.log(`[SYNC] No new messages to sync in ${folderName}`);
    return { threadCount: 0, messageCount: 0, errorCount: 0 };
  }

  let messageCount = 0;
  let threadCount = 0;
  let errorCount = 0;

  for await (const message of client.fetch(recentUids, {
    envelope: true,
    bodyStructure: true,
    source: true,
    flags: true,
    threadId: true,
  }, { uid: true })) {
    try {
      if (!message.source) continue;
      const parsed = await simpleParser(message.source);
      const from = firstAddress(parsed.from);
      const toAddresses = addressList(parsed.to);
      const ccAddresses = addressList(parsed.cc);
      const bccAddresses = addressList(parsed.bcc);
      const sentAt = parsed.date ?? message.envelope?.date ?? new Date();
      const typedMessage = message as typeof message & FetchMessageWithThread;
      const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
      const externalThreadId = String(
        typedMessage.threadId
        ?? references[0]
        ?? parsed.inReplyTo
        ?? parsed.messageId
        ?? message.envelope?.messageId
        ?? `${account.id}-${message.uid}`
      );
      const participants = Array.from(new Set([from.address, ...toAddresses, ...ccAddresses].filter(Boolean)));
      const flags = new Set(Array.from(message.flags ?? []));

      const existingThread = await prisma.emailThread.findFirst({
        where: { accountId: account.id, externalThreadId },
      });

      let thread: { id: string };
      if (!existingThread) {
        thread = await prisma.emailThread.create({
          data: {
            accountId: account.id,
            externalThreadId,
            subject: parsed.subject ?? "(no subject)",
            participants,
            lastMessageAt: sentAt,
            isRead: flags.has("\\Seen") || forceFromMe,
            isFlagged: flags.has("\\Flagged"),
            isArchived: false,
          },
        });
        threadCount++;
      } else {
        thread = existingThread;
        const updatedParticipants = Array.from(new Set([...existingThread.participants, ...participants]));
        await prisma.emailThread.update({
          where: { id: existingThread.id },
          data: {
            lastMessageAt: sentAt > existingThread.lastMessageAt ? sentAt : existingThread.lastMessageAt,
            participants: updatedParticipants,
          },
        });
      }

      const externalMessageId = parsed.messageId ?? message.envelope?.messageId ?? `${account.id}-${message.uid}`;
      const existingMessage = await prisma.emailMessage.findFirst({
        where: { externalMessageId },
      });
      const bodyHtml = parsed.html || parsed.textAsHtml || "";
      const attachments = parsed.attachments.map((attachment) => ({
        filename: attachment.filename ?? "attachment",
        mimeType: attachment.contentType ?? "application/octet-stream",
        sizeBytes: attachment.size ?? 0,
        contentId: attachment.contentId ?? null,
        isInline: isInlineMailAttachment(attachment.contentId, bodyHtml),
      }));

      if (!existingMessage) {
        const accountEmail = account.emailAddress.toLowerCase();
        const fromAddress = from.address.toLowerCase();

        await prisma.emailMessage.create({
          data: {
            threadId: thread.id,
            externalMessageId,
            fromAddress: from.address || account.emailAddress,
            fromName: from.name ?? "",
            toAddresses,
            ccAddresses,
            bccAddresses,
            subject: parsed.subject ?? "(no subject)",
            bodyHtml,
            bodyText: parsed.text ?? "",
            sentAt,
            isFromMe: forceFromMe || fromAddress === accountEmail,
            hasAttachments: attachments.length > 0,
            attachments,
            imapMailbox: folderName,
            imapUid: message.uid,
          },
        });
        messageCount++;
      } else if (!existingMessage.imapMailbox || !existingMessage.imapUid) {
        await prisma.emailMessage.update({
          where: { id: existingMessage.id },
          data: {
            imapMailbox: folderName,
            imapUid: message.uid,
            attachments,
            hasAttachments: attachments.length > 0,
          },
        });
      }
    } catch (msgErr) {
      errorCount++;
      console.error(`[SYNC] Error processing message in ${folderName}:`, msgErr instanceof Error ? msgErr.message : msgErr);
    }
  }

  console.log(`[SYNC] ${folderName} sync complete: ${threadCount} new threads, ${messageCount} new messages, ${errorCount} errors`);
  return { threadCount, messageCount, errorCount };
}

export async function syncAccount(accountId: string): Promise<void> {
  console.log(`[SYNC] Loading account ${accountId}`);

  let account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(`[SYNC] Account ${accountId} not found in database`);
    return;
  }

  console.log(`[SYNC] Account: ${account.emailAddress}, provider: ${account.provider}, hasAccessToken: ${Boolean(account.encryptedAccessToken)}, hasRefreshToken: ${Boolean(account.encryptedRefreshToken)}`);

  if (account.provider === EmailProvider.GOOGLE) {
    if (!account.encryptedAccessToken) {
      console.error(`[SYNC] No access token for ${account.emailAddress} — re-authenticate`);
      return;
    }

    if (account.tokenExpiry && account.tokenExpiry <= new Date()) {
      console.log(`[SYNC] Access token expired for ${account.emailAddress}, refreshing...`);
      try {
        account = await refreshGoogleToken(account);
        console.log("[SYNC] Token refreshed successfully");
      } catch (err) {
        console.error("[SYNC] Token refresh failed:", err instanceof Error ? err.message : err);
        return;
      }
    }
  }

  let client: ImapFlow | null = null;

  try {
    console.log(`[SYNC] Creating IMAP client for ${account.emailAddress}`);
    client = await getImapClient(account);
    console.log("[SYNC] Connecting to IMAP...");
    await client.connect();
    console.log(`[SYNC] Connected successfully to IMAP for ${account.emailAddress}`);
  } catch (err) {
    console.error(`[SYNC] IMAP connection failed for ${account.emailAddress}:`, err instanceof Error ? err.message : err);
    if (account.provider === EmailProvider.GOOGLE && err instanceof Error) {
      console.error("[IMAP] Google auth hint: Enable IMAP in Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP. For Google Workspace, the admin may need to enable IMAP access.");
    }
    if (err instanceof Error) console.error("[SYNC] Connection error stack:", err.stack);
    return;
  }

  try {
    const inboxResult = await syncMailbox(client, account, "INBOX", false);
    const sentFolders = ["[Gmail]/Sent Mail", "Sent", "Sent Items", "Sent Messages"];
    let sentResult: SyncMailboxResult = { threadCount: 0, messageCount: 0, errorCount: 0 };
    let sentSynced = false;
    for (const folderName of sentFolders) {
      try {
        sentResult = await syncMailbox(client, account, folderName, true);
        console.log(`[SYNC] Opened sent folder: ${folderName}`);
        sentSynced = true;
        break;
      } catch {
        console.log(`[SYNC] Sent folder not found: ${folderName}, trying next...`);
      }
    }
    if (!sentSynced) console.log("[SYNC] No sent folder could be opened");

    console.log(`[SYNC] Sync complete for ${account.emailAddress}: ${inboxResult.threadCount + sentResult.threadCount} new threads, ${inboxResult.messageCount + sentResult.messageCount} new messages, ${inboxResult.errorCount + sentResult.errorCount} errors`);

    console.log("[SYNC] Running smart link for new threads...");
    const newThreads = await prisma.emailThread.findMany({
      where: { accountId, linkedContactId: null },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    for (const thread of newThreads) {
      try {
        await smartLinkThread(thread.id);
      } catch (err) {
        console.error(`[SYNC] Smart link failed for thread ${thread.id}:`, err instanceof Error ? err.message : err);
      }
    }

    await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
    console.log("[SYNC] Account lastSyncedAt updated");
  } catch (err) {
    console.error(`[SYNC] Sync error for ${account.emailAddress}:`, err instanceof Error ? err.message : err);
    if (err instanceof Error) console.error(err.stack);
  } finally {
    try {
      await client.logout();
      console.log("[SYNC] IMAP connection closed cleanly");
    } catch {
      // ignore logout errors
    }
  }
}

export async function smartLinkThread(threadId: string): Promise<void> {
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId } });
  if (!thread) return;
  const contacts = await prisma.contact.findMany({
    where: { email: { in: thread.participants, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
  });
  if (contacts.length === 0) return;
  const contact = contacts[0];
  const opportunity = await prisma.opportunity.findFirst({
    where: { contactId: contact.id, stage: { notIn: ["WON", "LOST"] } },
    orderBy: { updatedAt: "desc" },
  });
  const production = opportunity ? null : await prisma.production.findFirst({
    where: { contactId: contact.id, status: { not: "WRAPPED" } },
    orderBy: { updatedAt: "desc" },
  });
  await prisma.emailThread.update({
    where: { id: thread.id },
    data: {
      linkedContactId: contact.id,
      linkedOpportunityId: contacts.length === 1 ? opportunity?.id ?? null : null,
      linkedProductionId: contacts.length === 1 ? production?.id ?? null : null,
    },
  });
}

export async function startIdleSync(accountId: string): Promise<void> {
  stopIdleSync(accountId);
  const foundAccount = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!foundAccount || !foundAccount.isActive) return;
  const account = foundAccount;
  const state: IdleState = { connected: false };
  idleConnections.set(accountId, state);

  async function connect() {
    try {
      const client = await getImapClient(account);
      await client.connect();
      state.client = client;
      state.connected = true;
      await client.mailboxOpen("INBOX");
      client.on("exists", () => {
        syncAccount(accountId).catch((err) => console.error(`Email sync failed for ${account.emailAddress}:`, err));
      });
      client.on("error", (err) => {
        console.error(`Email IDLE error for ${account.emailAddress}:`, err.message);
        state.connected = false;
      });
      client.on("close", () => {
        state.connected = false;
        if (idleConnections.has(accountId)) {
          state.retry = setTimeout(connect, 5 * 60 * 1000);
        }
      });
      await client.idle();
    } catch (err) {
      state.connected = false;
      console.error(`[IMAP] Email IDLE failed for ${account.emailAddress}:`, err instanceof Error ? err.message : err);
      if (account.provider === EmailProvider.GOOGLE && err instanceof Error) {
        console.error("[IMAP] Google auth hint: Enable IMAP in Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP. For Google Workspace, the admin may need to enable IMAP access.");
      }
      if (idleConnections.has(accountId)) {
        state.retry = setTimeout(connect, 5 * 60 * 1000);
      }
    }
  }

  await connect();
}

export function stopIdleSync(accountId: string): void {
  const state = idleConnections.get(accountId);
  if (!state) return;
  if (state.retry) clearTimeout(state.retry);
  state.client?.logout().catch(() => undefined);
  idleConnections.delete(accountId);
}

export function getIdleStatus() {
  return idleConnections;
}

export async function getEmailAttachment(messageId: string, attachmentIndex: number): Promise<EmailAttachmentContent> {
  const message = await prisma.emailMessage.findUnique({
    where: { id: messageId },
    include: { thread: { include: { account: true } } },
  });
  if (!message) throw new Error("Email message not found");
  if (!message.thread.account) throw new Error("Email account not found for message");
  if (!message.imapMailbox || !message.imapUid) {
    throw new Error("Attachment is not available until this message is resynced");
  }

  const client = await getImapClient(message.thread.account);
  try {
    await client.connect();
    await client.mailboxOpen(message.imapMailbox);
    const fetched = await client.fetchOne(message.imapUid, { source: true }, { uid: true });
    if (!fetched || !fetched.source) throw new Error("Email source not found on IMAP server");
    const parsed = await simpleParser(fetched.source);
    const attachment = parsed.attachments[attachmentIndex];
    if (!attachment) throw new Error("Attachment not found");
    return {
      filename: attachment.filename ?? `attachment-${attachmentIndex + 1}`,
      mimeType: attachment.contentType ?? "application/octet-stream",
      sizeBytes: attachment.size ?? attachment.content.byteLength,
      content: attachment.content,
    };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function saveEmailAttachmentToJob(options: {
  messageId: string;
  attachmentIndex: number;
  productionId?: string;
  notes?: string;
}) {
  const message = await prisma.emailMessage.findUnique({
    where: { id: options.messageId },
    include: { thread: true },
  });
  if (!message) throw new Error("Email message not found");

  const attachmentSummary = parseAttachments(message.attachments)[options.attachmentIndex];
  if (!attachmentSummary) throw new Error("Attachment not found");
  if (attachmentSummary.isInline) throw new Error("Inline email images are not saved as job files");

  const productionId = options.productionId ?? message.thread.linkedProductionId ?? null;

  const existing = await prisma.jobFile.findFirst({
    where: {
      sourceEmailMessageId: options.messageId,
      sourceEmailAttachmentIndex: options.attachmentIndex,
      productionId,
    },
  });
  if (existing) return existing;

  const folder: JobFolder = "Mail Attachments";
  if (!isJobFolder(folder)) throw new Error("Mail Attachments folder is not configured");
  const attachment = await getEmailAttachment(options.messageId, options.attachmentIndex);
  const sourceOptions = {
    notes: options.notes,
    sourceEmailThreadId: message.threadId,
    sourceEmailMessageId: options.messageId,
    sourceEmailAttachmentIndex: options.attachmentIndex,
    sourceEmailFilename: attachment.filename,
  };
  if (!productionId) {
    return autoFileMailAttachment(
      attachment.content,
      attachment.filename,
      attachment.mimeType,
      sourceOptions
    );
  }
  return autoFileDocument(
    productionId,
    folder,
    attachment.content,
    attachment.filename,
    attachment.mimeType,
    sourceOptions
  );
}

export async function sendEmail(options: SendEmailOptions) {
  const account = await prisma.emailAccount.findUnique({ where: { id: options.fromAccountId } });
  if (!account) throw new Error("Email account not found");
  const transporter = await getSmtpTransporter(account);
  const info = await transporter.sendMail({
    from: account.emailAddress,
    to: options.to.join(", "),
    cc: options.cc?.join(", "),
    bcc: options.bcc?.join(", "),
    subject: options.subject,
    html: options.bodyHtml,
    attachments: options.attachments,
    inReplyTo: options.inReplyTo,
  });
  const participants = Array.from(new Set([account.emailAddress.toLowerCase(), ...options.to, ...(options.cc ?? [])].map((email) => email.toLowerCase())));
  const now = new Date();
  const thread = options.threadId
    ? await prisma.emailThread.update({
      where: { id: options.threadId },
      data: { lastMessageAt: now, isRead: true },
    })
    : await prisma.emailThread.create({
      data: {
        accountId: account.id,
        externalThreadId: String(info.messageId ?? `sent-${Date.now()}`),
        subject: options.subject,
        participants,
        lastMessageAt: now,
        isRead: true,
        linkedOpportunityId: options.linkedOpportunityId,
        linkedProductionId: options.linkedProductionId,
      },
    });
  return prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      externalMessageId: String(info.messageId ?? `sent-${Date.now()}`),
      fromAddress: account.emailAddress,
      fromName: account.label,
      toAddresses: options.to,
      ccAddresses: options.cc ?? [],
      bccAddresses: options.bcc ?? [],
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      bodyText: options.bodyHtml.replace(/<[^>]+>/g, " "),
      sentAt: now,
      isFromMe: true,
      hasAttachments: Boolean(options.attachments?.length),
      attachments: (options.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.contentType,
        sizeBytes: attachment.content.length,
      })),
    },
  });
}

export async function getThreads(options: ThreadListOptions) {
  const page = Math.max(1, options.page ?? 1);
  const folder = options.folder ?? "inbox";
  const andFilters: Prisma.EmailThreadWhereInput[] = [];

  if (options.linkedTo) {
    andFilters.push({
      OR: [
        { linkedContactId: options.linkedTo },
        { linkedOpportunityId: options.linkedTo },
        { linkedProductionId: options.linkedTo },
      ],
    });
  }

  if (options.search) {
    const search = options.search;
    andFilters.push({
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { participants: { has: search.toLowerCase() } },
        { messages: { some: { bodyText: { contains: search, mode: "insensitive" } } } },
        { messages: { some: { fromName: { contains: search, mode: "insensitive" } } } },
        { messages: { some: { fromAddress: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  switch (folder) {
    case "sent":
      andFilters.push({ messages: { some: { isFromMe: true } } });
      break;
    case "flagged":
      andFilters.push({ isFlagged: true, isArchived: false });
      break;
    case "archived":
      andFilters.push({ isArchived: true });
      break;
    case "inbox":
    default:
      andFilters.push({ isArchived: false, messages: { some: { isFromMe: false } } });
      break;
  }

  const where: Prisma.EmailThreadWhereInput = {
    accountId: options.accountId,
    isRead: options.isRead,
    isFlagged: options.isFlagged,
    isArchived: options.isArchived,
    linkedContactId: options.linkedContactId,
    linkedOpportunityId: options.linkedOpportunityId,
    linkedProductionId: options.linkedProductionId,
    AND: andFilters.length ? andFilters : undefined,
  };
  const threadInclude = {
    account: true,
    linkedContact: { include: { company: true } },
    linkedOpportunity: true,
    linkedProduction: true,
    messages: {
      orderBy: { sentAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        bodyText: true,
        sentAt: true,
        isFromMe: true,
        hasAttachments: true,
      },
    },
    _count: { select: { messages: true } },
  };

  const sentMessageByThread = new Map<string, { sentAt: Date; bodyText: string; fromAddress: string; fromName: string | null; isFromMe: boolean; hasAttachments: boolean }>();
  let threads: Array<Prisma.EmailThreadGetPayload<{ include: typeof threadInclude }>>;
  let total: number;

  if (folder === "sent") {
    const sentWhere: Prisma.EmailMessageWhereInput = { isFromMe: true, thread: { is: where } };
    const [sentGroups, allSentGroups] = await Promise.all([
      prisma.emailMessage.groupBy({
        by: ["threadId"],
        where: sentWhere,
        _max: { sentAt: true },
        orderBy: { _max: { sentAt: "desc" } },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.emailMessage.groupBy({
        by: ["threadId"],
        where: sentWhere,
      }),
    ]);
    total = allSentGroups.length;
    const orderedIds = sentGroups.map((group) => group.threadId);
    const [foundThreads, latestSentMessages] = await Promise.all([
      prisma.emailThread.findMany({
        where: { id: { in: orderedIds } },
        include: threadInclude,
      }),
      prisma.emailMessage.findMany({
        where: { threadId: { in: orderedIds }, isFromMe: true },
        orderBy: { sentAt: "desc" },
        select: {
          threadId: true,
          fromAddress: true,
          fromName: true,
          bodyText: true,
          sentAt: true,
          isFromMe: true,
          hasAttachments: true,
        },
      }),
    ]);
    for (const message of latestSentMessages) {
      if (!sentMessageByThread.has(message.threadId)) sentMessageByThread.set(message.threadId, message);
    }
    const threadById = new Map(foundThreads.map((thread) => [thread.id, thread]));
    threads = orderedIds.map((id) => threadById.get(id)).filter((thread): thread is Prisma.EmailThreadGetPayload<{ include: typeof threadInclude }> => Boolean(thread));
  } else {
    [threads, total] = await Promise.all([
      prisma.emailThread.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: threadInclude,
      }),
      prisma.emailThread.count({ where }),
    ]);
  }
  const threadIds = threads.map((thread) => thread.id);
  const attachmentRows = threadIds.length
    ? await prisma.emailMessage.findMany({
      where: { threadId: { in: threadIds }, hasAttachments: true },
      select: { threadId: true },
    })
    : [];
  const threadsWithAttachments = new Set(attachmentRows.map((row) => row.threadId));
  const emails = Array.from(new Set(threads.flatMap((thread) => [
    ...thread.participants,
    thread.messages[0]?.fromAddress,
  ].filter((email): email is string => Boolean(email)))));
  const contacts = await prisma.contact.findMany({ where: { email: { in: emails, mode: "insensitive" } }, include: { company: true } });
  const contactByEmail = new Map(contacts.map((contact) => [contact.email?.toLowerCase(), contact]));
  return {
    threads: threads.map((thread) => {
      const latestSent = sentMessageByThread.get(thread.id);
      const latest = latestSent ?? thread.messages[0];
      const latestContact = latest ? contactByEmail.get(latest.fromAddress.toLowerCase()) : null;
      const resolvedSenderName = latest
        ? resolveDisplayName(latest.fromAddress, latest.fromName, contactDisplayName(latestContact))
        : resolveDisplayName(thread.participants[0] ?? "", null, null);
      const avatarColor = latest?.isFromMe ? "#1a1a1f" : getAvatarColor(latest?.fromAddress ?? thread.participants[0] ?? "");
      return {
        ...thread,
        lastMessageAt: latestSent?.sentAt ?? thread.lastMessageAt,
        latestPreview: latest?.bodyText.slice(0, 100) ?? "",
        resolvedSenderName,
        avatarColor,
        messageCount: thread._count.messages,
        hasAttachments: threadsWithAttachments.has(thread.id),
        participantNames: thread.participants.map((email) => {
          const contact = contactByEmail.get(email.toLowerCase());
          return resolveDisplayName(email, null, contactDisplayName(contact));
        }),
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getThread(threadId: string, options?: { before?: Date; limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? THREAD_MESSAGE_LIMIT, 1), 50);
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      account: true,
      linkedContact: { include: { company: true } },
      linkedOpportunity: true,
      linkedProduction: true,
    },
  });
  if (!thread) return null;

  const messageWhere: Prisma.EmailMessageWhereInput = {
    threadId,
    ...(options?.before ? { sentAt: { lt: options.before } } : {}),
  };

  const [totalMessageCount, olderTotalCount, recentMessagesDesc, allAttachmentsMessages] = await Promise.all([
    prisma.emailMessage.count({ where: { threadId } }),
    prisma.emailMessage.count({ where: messageWhere }),
    prisma.emailMessage.findMany({
      where: messageWhere,
      orderBy: { sentAt: "desc" },
      take: limit,
    }),
    prisma.emailMessage.findMany({
      where: { threadId, hasAttachments: true },
      orderBy: { sentAt: "asc" },
      select: { id: true, attachments: true },
    }),
  ]);

  const messages = recentMessagesDesc.reverse();
  const messageIds = Array.from(new Set([
    ...messages.map((message) => message.id),
    ...allAttachmentsMessages.map((message) => message.id),
  ]));
  const sourceFiles = messageIds.length
    ? await prisma.jobFile.findMany({
        where: { sourceEmailMessageId: { in: messageIds } },
      })
    : [];
  const sourceFileByAttachment = new Map(
    sourceFiles.map((file) => [`${file.sourceEmailMessageId}:${file.sourceEmailAttachmentIndex}`, file])
  );
  const emails = Array.from(new Set([
    ...thread.participants,
    ...messages.flatMap((message) => [message.fromAddress, ...message.toAddresses, ...message.ccAddresses]),
  ].filter(Boolean)));
  const contacts = await prisma.contact.findMany({ where: { email: { in: emails, mode: "insensitive" } }, include: { company: true } });
  const contactByEmail = new Map(contacts.map((contact) => [contact.email?.toLowerCase(), contact]));
  const attachments = allAttachmentsMessages.flatMap((message) => parseAttachments(message.attachments)
    .map((attachment, index) => ({
      messageId: message.id,
      attachmentIndex: index,
      filename: attachment.filename ?? "attachment",
      mimeType: attachment.mimeType ?? "application/octet-stream",
      sizeBytes: attachment.sizeBytes ?? 0,
      isInline: attachment.isInline,
      jobFileId: sourceFileByAttachment.get(`${message.id}:${index}`)?.id,
      jobFile: sourceFileByAttachment.get(`${message.id}:${index}`),
    } satisfies ThreadAttachmentSummary))
    .filter((attachment) => !attachment.isInline));
  return {
    ...thread,
    messages: messages.map((message) => {
      const contact = contactByEmail.get(message.fromAddress.toLowerCase());
      const messageAttachments = parseAttachments(message.attachments)
        .map((attachment, index) => ({
          ...attachment,
          jobFileId: sourceFileByAttachment.get(`${message.id}:${index}`)?.id,
          jobFile: sourceFileByAttachment.get(`${message.id}:${index}`),
        }))
        .filter((attachment) => !attachment.isInline);
      return {
        ...message,
        attachments: messageAttachments,
        resolvedFromName: resolveDisplayName(message.fromAddress, message.fromName, contactDisplayName(contact)),
        avatarColor: message.isFromMe ? "#1a1a1f" : getAvatarColor(message.fromAddress),
      };
    }),
    hasMoreOlder: totalMessageCount > (options?.before ? totalMessageCount - olderTotalCount + messages.length : messages.length),
    totalMessageCount,
    participantNames: thread.participants.map((email) => {
      const contact = contactByEmail.get(email.toLowerCase());
      return resolveDisplayName(email, null, contactDisplayName(contact));
    }),
    attachments: attachments.slice(0, 10),
    totalAttachmentCount: attachments.length,
    participantContacts: contacts,
  };
}
