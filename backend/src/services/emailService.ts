import { EmailAccount, EmailProvider, Prisma } from "@prisma/client";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import prisma from "../prisma";
import { decrypt, encrypt } from "./encryptionService";

const PAGE_SIZE = 50;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
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

async function ensureAccessToken(account: EmailAccount): Promise<string> {
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
  return mail.attachments.map((attachment) => ({
    filename: attachment.filename ?? "attachment",
    mimeType: attachment.contentType,
    sizeBytes: attachment.size,
    contentId: attachment.contentId,
  }));
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
    const mailbox = await client.mailboxOpen("INBOX");
    console.log(`[SYNC] Opened INBOX — total messages: ${mailbox.exists}`);

    const syncDays = parseInt(process.env.EMAIL_SYNC_DAYS ?? "7", 10);
    const syncLimit = parseInt(process.env.EMAIL_SYNC_LIMIT ?? "200", 10);
    const since = new Date();
    since.setDate(since.getDate() - syncDays);

    console.log(`[SYNC] Searching for messages since ${since.toDateString()} (${syncDays} days)`);

    const searchResult = await client.search({ since }, { uid: true });
    const allUids = searchResult || [];
    const recentUids = allUids.slice(-syncLimit);

    console.log(`[SYNC] Found ${allUids.length} messages since ${syncDays} days ago, fetching most recent ${recentUids.length}`);

    if (recentUids.length === 0) {
      console.log("[SYNC] No new messages to sync");
      await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
      return;
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
          where: { accountId, externalThreadId },
        });

        let thread: { id: string };
        if (!existingThread) {
          thread = await prisma.emailThread.create({
            data: {
              accountId,
              externalThreadId,
              subject: parsed.subject ?? "(no subject)",
              participants,
              lastMessageAt: sentAt,
              isRead: flags.has("\\Seen"),
              isFlagged: flags.has("\\Flagged"),
              isArchived: false,
            },
          });
          threadCount++;
        } else {
          thread = existingThread;
          if (sentAt > existingThread.lastMessageAt) {
            await prisma.emailThread.update({
              where: { id: existingThread.id },
              data: { lastMessageAt: sentAt },
            });
          }
        }

        const externalMessageId = parsed.messageId ?? message.envelope?.messageId ?? `${account.id}-${message.uid}`;
        const existingMessage = await prisma.emailMessage.findFirst({
          where: { externalMessageId },
        });

        if (!existingMessage) {
          const accountEmail = account.emailAddress.toLowerCase();
          const fromAddress = from.address.toLowerCase();
          const attachments = parsed.attachments.map((attachment) => ({
            filename: attachment.filename ?? "attachment",
            mimeType: attachment.contentType ?? "application/octet-stream",
            sizeBytes: attachment.size ?? 0,
            contentId: attachment.contentId ?? null,
          }));

          await prisma.emailMessage.create({
            data: {
              threadId: thread.id,
              externalMessageId,
              fromAddress: from.address,
              fromName: from.name ?? "",
              toAddresses,
              ccAddresses,
              bccAddresses,
              subject: parsed.subject ?? "(no subject)",
              bodyHtml: parsed.html || parsed.textAsHtml || "",
              bodyText: parsed.text ?? "",
              sentAt,
              isFromMe: fromAddress === accountEmail,
              hasAttachments: attachments.length > 0,
              attachments,
            },
          });
          messageCount++;
        }
      } catch (msgErr) {
        errorCount++;
        console.error("[SYNC] Error processing message:", msgErr instanceof Error ? msgErr.message : msgErr);
      }
    }

    console.log(`[SYNC] Sync complete for ${account.emailAddress}: ${threadCount} new threads, ${messageCount} new messages, ${errorCount} errors`);

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
  const where: Prisma.EmailThreadWhereInput = {
    accountId: options.accountId,
    isRead: options.isRead,
    isFlagged: options.isFlagged,
    isArchived: options.isArchived,
    linkedContactId: options.linkedContactId,
    linkedOpportunityId: options.linkedOpportunityId,
    linkedProductionId: options.linkedProductionId,
  };
  if (options.linkedTo) {
    where.OR = [
      { linkedContactId: options.linkedTo },
      { linkedOpportunityId: options.linkedTo },
      { linkedProductionId: options.linkedTo },
    ];
  }
  if (options.search) {
    const search = options.search;
    where.OR = [
      ...(where.OR ?? []),
      { subject: { contains: search, mode: "insensitive" } },
      { participants: { has: search.toLowerCase() } },
      { messages: { some: { bodyText: { contains: search, mode: "insensitive" } } } },
    ];
  }
  const [threads, total] = await Promise.all([
    prisma.emailThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        account: true,
        linkedContact: { include: { company: true } },
        linkedOpportunity: true,
        linkedProduction: true,
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    }),
    prisma.emailThread.count({ where }),
  ]);
  const emails = Array.from(new Set(threads.flatMap((thread) => thread.participants)));
  const contacts = await prisma.contact.findMany({ where: { email: { in: emails, mode: "insensitive" } }, include: { company: true } });
  const contactByEmail = new Map(contacts.map((contact) => [contact.email?.toLowerCase(), contact]));
  return {
    threads: threads.map((thread) => {
      const latest = thread.messages[0];
      return {
        ...thread,
        latestPreview: latest?.bodyText.slice(0, 100) ?? "",
        participantNames: thread.participants.map((email) => {
          const contact = contactByEmail.get(email.toLowerCase());
          return contact ? `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}` : email;
        }),
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export async function getThread(threadId: string) {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    include: {
      account: true,
      linkedContact: { include: { company: true } },
      linkedOpportunity: true,
      linkedProduction: true,
      messages: { orderBy: { sentAt: "asc" } },
    },
  });
  if (!thread) return null;
  const emails = Array.from(new Set(thread.participants));
  const contacts = await prisma.contact.findMany({ where: { email: { in: emails, mode: "insensitive" } }, include: { company: true } });
  return { ...thread, participantContacts: contacts };
}
