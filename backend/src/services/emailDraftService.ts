import fs from "node:fs/promises";
import path from "node:path";
import { EmailProvider } from "@prisma/client";
import prisma from "../prisma";
import { resolveJobFilePath } from "./fileStorage";

const draftAttachmentRoot = path.resolve(process.cwd(), "storage", "email-drafts");

function safeAttachmentFilename(filename: string): string {
  const cleaned = filename.replace(/[^\w.\- ()]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || "attachment";
}

async function getPrimaryEmailAccount() {
  const primary = await prisma.emailAccount.findFirst({ where: { isPrimary: true, isActive: true } });
  if (primary) return primary;
  return prisma.emailAccount.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}

async function draftAttachmentsForGmail(draftId: string) {
  const attachments = await prisma.emailDraftAttachment.findMany({
    where: { draftId },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(attachments.map(async (attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: await fs.readFile(attachment.storedPath),
  })));
}

async function syncDraftToGmail(draftId: string): Promise<void> {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: { account: true },
  });
  if (!draft || draft.account.provider !== EmailProvider.GOOGLE) return;
  const attachments = await draftAttachmentsForGmail(draft.id);
  const { upsertGmailDraft } = await import("./gmailService");
  const result = await upsertGmailDraft(draft.account, {
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    inReplyTo: draft.inReplyToMsgId ?? undefined,
    references: draft.references ?? undefined,
    gmailThreadId: draft.gmailThreadId ?? undefined,
    attachments,
  }, draft.gmailDraftId);
  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: {
      gmailDraftId: result.gmailDraftId,
      gmailDraftMessageId: result.gmailMessageId,
      gmailThreadId: result.gmailThreadId,
      lastSyncedToGmailAt: new Date(),
    },
  });
  await prisma.emailMessage.updateMany({
    where: { gmailMessageId: result.gmailMessageId },
    data: { isDraftArtifact: true },
  });
}

export async function createDraftWithJobFile(options: {
  to: string[];
  subject: string;
  bodyHtml: string;
  linkedProductionId?: string | null;
  jobFileId: string;
}) {
  const account = await getPrimaryEmailAccount();
  if (!account) throw new Error("No email account");

  const existingCount = await prisma.emailDraft.count({ where: { accountId: account.id } });
  if (existingCount >= 3) throw new Error("Close a draft before opening another");

  const jobFile = await prisma.jobFile.findUnique({ where: { id: options.jobFileId } });
  if (!jobFile) throw new Error("Attachment file not found");

  const draft = await prisma.emailDraft.create({
    data: {
      accountId: account.id,
      to: options.to,
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      linkedProductionId: options.linkedProductionId ?? undefined,
      isMinimized: false,
    },
  });

  const sourcePath = await resolveJobFilePath(jobFile);
  const draftDir = path.join(draftAttachmentRoot, draft.id);
  await fs.mkdir(draftDir, { recursive: true });
  const filename = safeAttachmentFilename(jobFile.originalFilename);
  const storedPath = path.join(draftDir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`);
  const buffer = await fs.readFile(sourcePath);
  await fs.writeFile(storedPath, buffer);
  await prisma.emailDraftAttachment.create({
    data: {
      draftId: draft.id,
      filename,
      mimeType: jobFile.mimeType,
      sizeBytes: jobFile.sizeBytes,
      storedPath,
    },
  });

  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: { lastEditedAt: new Date() },
  });
  await syncDraftToGmail(draft.id).catch((err: unknown) => {
    console.error("[EMAIL DRAFT] PO draft Gmail sync failed:", err instanceof Error ? err.message : err);
  });

  return prisma.emailDraft.findUnique({
    where: { id: draft.id },
    include: {
      linkedProduction: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createPlainDraft(options: {
  to: string[];
  subject: string;
  bodyHtml: string;
  linkedProductionId?: string | null;
}) {
  const account = await getPrimaryEmailAccount();
  if (!account) throw new Error("No email account");

  const existingCount = await prisma.emailDraft.count({ where: { accountId: account.id } });
  if (existingCount >= 3) throw new Error("Close a draft before opening another");

  const draft = await prisma.emailDraft.create({
    data: {
      accountId: account.id,
      to: options.to,
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      linkedProductionId: options.linkedProductionId ?? undefined,
      isMinimized: false,
    },
  });
  await syncDraftToGmail(draft.id).catch((err: unknown) => {
    console.error("[EMAIL DRAFT] Gmail draft sync failed:", err instanceof Error ? err.message : err);
  });
  return prisma.emailDraft.findUnique({
    where: { id: draft.id },
    include: {
      linkedProduction: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
}
