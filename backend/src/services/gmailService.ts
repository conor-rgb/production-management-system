import { EmailAccount } from "@prisma/client";
import prisma from "../prisma";
import { decrypt, encrypt } from "./encryptionService";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GmailHeader = {
  name: string;
  value: string;
};

type GmailPartBody = {
  data?: string;
  attachmentId?: string;
  size?: number;
};

type GmailPayloadPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailPartBody;
  parts?: GmailPayloadPart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: GmailPayloadPart;
  sizeEstimate?: number;
};

type GmailThreadResponse = {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
};

type GmailThreadListResponse = {
  threads?: Array<{ id: string; historyId?: string; snippet?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailHistoryResponse = {
  history?: Array<{
    messagesAdded?: Array<{ message?: { threadId?: string } }>;
    messagesDeleted?: Array<{ message?: { threadId?: string } }>;
    labelsAdded?: Array<{ message?: { threadId?: string } }>;
    labelsRemoved?: Array<{ message?: { threadId?: string } }>;
  }>;
  historyId?: string;
};

export type ParsedGmailMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  labelIds: string[];
  inInbox: boolean;
  inSent: boolean;
  isUnread: boolean;
  isStarred: boolean;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
  snippet: string;
  sentAt: Date;
  isFromMe: boolean;
  hasAttachments: boolean;
  attachments: Array<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
    attachmentId: string;
    contentId?: string | null;
    isInline?: boolean;
  }>;
};

async function refreshGoogleToken(account: EmailAccount): Promise<EmailAccount> {
  if (!account.encryptedRefreshToken) throw new Error(`No refresh token for ${account.emailAddress}`);
  const refreshToken = decrypt(account.encryptedRefreshToken);
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
  const data = await response.json() as GoogleTokenResponse;
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? response.statusText}`);
  }
  return prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      encryptedAccessToken: encrypt(data.access_token),
      tokenExpiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
  });
}

async function gmailHeaders(account: EmailAccount): Promise<Record<string, string>> {
  let activeAccount = account;
  if (account.tokenExpiry && account.tokenExpiry < new Date(Date.now() + 60_000)) {
    activeAccount = await refreshGoogleToken(account);
  }
  if (!activeAccount.encryptedAccessToken) throw new Error(`No Gmail access token for ${activeAccount.emailAddress}`);
  return {
    Authorization: `Bearer ${decrypt(activeAccount.encryptedAccessToken)}`,
    "Content-Type": "application/json",
  };
}

async function gmailGet<T>(account: EmailAccount, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GMAIL_API}/users/me/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), { headers: await gmailHeaders(account) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail API ${path} failed: ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

async function gmailPost<T>(account: EmailAccount, path: string, body: object): Promise<T> {
  const response = await fetch(`${GMAIL_API}/users/me/${path}`, {
    method: "POST",
    headers: await gmailHeaders(account),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`Gmail API POST ${path} failed: ${response.status} ${responseBody}`);
  }
  return response.json() as Promise<T>;
}

async function gmailPut<T>(account: EmailAccount, path: string, body: object): Promise<T> {
  const response = await fetch(`${GMAIL_API}/users/me/${path}`, {
    method: "PUT",
    headers: await gmailHeaders(account),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`Gmail API PUT ${path} failed: ${response.status} ${responseBody}`);
  }
  return response.json() as Promise<T>;
}

async function gmailDelete(account: EmailAccount, path: string): Promise<void> {
  const response = await fetch(`${GMAIL_API}/users/me/${path}`, {
    method: "DELETE",
    headers: await gmailHeaders(account),
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`Gmail API DELETE ${path} failed: ${response.status} ${responseBody}`);
  }
}

export async function listThreads(
  account: EmailAccount,
  options: { labelIds?: string[]; q?: string; maxResults?: number; pageToken?: string } = {}
): Promise<{ threads: Array<{ id: string; historyId?: string; snippet?: string }>; nextPageToken?: string; resultSizeEstimate: number }> {
  const params: Record<string, string> = { maxResults: String(options.maxResults ?? 50) };
  if (options.labelIds?.length) params.labelIds = options.labelIds.join(",");
  if (options.q) params.q = options.q;
  if (options.pageToken) params.pageToken = options.pageToken;
  const data = await gmailGet<GmailThreadListResponse>(account, "threads", params);
  return {
    threads: data.threads ?? [],
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate ?? 0,
  };
}

export async function getGmailThread(account: EmailAccount, gmailThreadId: string): Promise<GmailThreadResponse> {
  return gmailGet<GmailThreadResponse>(account, `threads/${gmailThreadId}`, { format: "full" });
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function parseAddressHeader(header: string): Array<{ address: string; name: string }> {
  if (!header) return [];
  return header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((part) => {
    const trimmed = part.trim();
    const match = trimmed.match(/^"?([^"<]*)"?\s*<?([^<>\s,]+@[^<>\s,]+)>?$/);
    const address = (match?.[2] ?? match?.[1] ?? "").trim().toLowerCase();
    const name = (match?.[1] ?? "").replace(/^"|"$/g, "").trim();
    return { address, name };
  }).filter((item) => item.address.includes("@"));
}

function extractBody(payload?: GmailPayloadPart): { html: string; text: string } {
  let html = "";
  let text = "";
  function walk(part?: GmailPayloadPart): void {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body?.data) html = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain" && part.body?.data) text = decodeBase64Url(part.body.data);
    part.parts?.forEach(walk);
  }
  walk(payload);
  return { html, text };
}

function extractAttachments(payload?: GmailPayloadPart): ParsedGmailMessage["attachments"] {
  const attachments: ParsedGmailMessage["attachments"] = [];
  function walk(part?: GmailPayloadPart): void {
    if (!part) return;
    const disposition = getHeader(part.headers, "Content-Disposition").toLowerCase();
    const contentId = getHeader(part.headers, "Content-ID").replace(/[<>]/g, "") || null;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        sizeBytes: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
        contentId,
        isInline: disposition.includes("inline") || Boolean(contentId),
      });
    }
    part.parts?.forEach(walk);
  }
  walk(payload);
  return attachments;
}

export function parseGmailMessage(message: GmailMessage, accountEmail: string): ParsedGmailMessage {
  const headers = message.payload?.headers ?? [];
  const from = parseAddressHeader(getHeader(headers, "From"))[0] ?? { address: accountEmail.toLowerCase(), name: "" };
  const toAddresses = parseAddressHeader(getHeader(headers, "To")).map((item) => item.address);
  const ccAddresses = parseAddressHeader(getHeader(headers, "Cc")).map((item) => item.address);
  const bccAddresses = parseAddressHeader(getHeader(headers, "Bcc")).map((item) => item.address);
  const labelIds = message.labelIds ?? [];
  const body = extractBody(message.payload);
  const attachments = extractAttachments(message.payload);
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    labelIds,
    inInbox: labelIds.includes("INBOX"),
    inSent: labelIds.includes("SENT"),
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    fromAddress: from.address,
    fromName: from.name,
    toAddresses,
    ccAddresses,
    bccAddresses,
    subject: getHeader(headers, "Subject") || "(no subject)",
    bodyHtml: body.html,
    bodyText: body.text || body.html.replace(/<[^>]+>/g, " "),
    snippet: message.snippet ?? "",
    sentAt: new Date(Number(message.internalDate)),
    isFromMe: from.address === accountEmail.toLowerCase() || labelIds.includes("SENT"),
    hasAttachments: attachments.some((attachment) => !attachment.isInline),
    attachments,
  };
}

export async function modifyThreadLabels(account: EmailAccount, gmailThreadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void> {
  await gmailPost(account, `threads/${gmailThreadId}/modify`, { addLabelIds, removeLabelIds });
  console.log(`[GMAIL] Modified thread ${gmailThreadId}: +${addLabelIds.join(",")} -${removeLabelIds.join(",")}`);
}

export async function archiveThread(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, [], ["INBOX"]);
}

export async function unarchiveThread(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, ["INBOX"], []);
}

export async function starThread(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, ["STARRED"], []);
}

export async function unstarThread(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, [], ["STARRED"]);
}

export async function markThreadRead(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, [], ["UNREAD"]);
}

export async function markThreadUnread(account: EmailAccount, gmailThreadId: string): Promise<void> {
  await modifyThreadLabels(account, gmailThreadId, ["UNREAD"], []);
}

export async function getAttachment(account: EmailAccount, gmailMessageId: string, attachmentId: string): Promise<Buffer> {
  const data = await gmailGet<{ data: string }>(account, `messages/${gmailMessageId}/attachments/${attachmentId}`);
  return Buffer.from(data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function sendGmailMessage(account: EmailAccount, options: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references?: string;
  gmailThreadId?: string | null;
}): Promise<{ gmailMessageId: string; gmailThreadId: string }> {
  const headers = [
    `From: ${account.emailAddress}`,
    `To: ${options.to.join(", ")}`,
    options.cc?.length ? `Cc: ${options.cc.join(", ")}` : null,
    options.bcc?.length ? `Bcc: ${options.bcc.join(", ")}` : null,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : null,
    options.references ? `References: ${options.references}` : null,
  ].filter((line): line is string => Boolean(line)).join("\r\n");
  const raw = Buffer.from(`${headers}\r\n\r\n${options.bodyHtml}`)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const body: { raw: string; threadId?: string } = { raw };
  if (options.gmailThreadId) body.threadId = options.gmailThreadId;
  const result = await gmailPost<{ id: string; threadId: string }>(account, "messages/send", body);
  console.log(`[GMAIL] Sent message ${result.id} in thread ${result.threadId}`);
  return { gmailMessageId: result.id, gmailThreadId: result.threadId };
}

export async function getHistory(account: EmailAccount, startHistoryId: string): Promise<{ history: NonNullable<GmailHistoryResponse["history"]>; historyId: string }> {
  try {
    const data = await gmailGet<GmailHistoryResponse>(account, "history", { startHistoryId });
    return { history: data.history ?? [], historyId: data.historyId ?? startHistoryId };
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) throw new Error("HISTORY_EXPIRED");
    throw err;
  }
}

export async function deleteGmailMessage(account: EmailAccount, gmailMessageId: string): Promise<void> {
  await gmailDelete(account, `messages/${gmailMessageId}`);
}

export async function updateDraftGmailMessage(account: EmailAccount, gmailMessageId: string, rawBody: object): Promise<void> {
  await gmailPut(account, `messages/${gmailMessageId}`, rawBody);
}
