import { EmailAccount } from "@prisma/client";
import prisma from "../prisma";
import { getHistory, getGmailThread, listThreads, parseGmailMessage } from "./gmailService";

function contactDisplayName(contact?: { firstName: string; lastName: string | null } | null): string | null {
  if (!contact) return null;
  return `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
}

export async function fullGmailSync(account: EmailAccount): Promise<void> {
  console.log(`[GMAIL SYNC] Starting full sync for ${account.emailAddress}`);
  const syncDays = Number.parseInt(process.env.EMAIL_SYNC_DAYS ?? "30", 10);
  const syncLimit = Number.parseInt(process.env.EMAIL_SYNC_LIMIT ?? "200", 10);
  const afterDate = Math.floor((Date.now() - syncDays * 86_400_000) / 1000);

  let pageToken: string | undefined;
  let totalSynced = 0;
  let latestHistoryId: string | undefined;

  do {
    const remaining = syncLimit - totalSynced;
    if (remaining <= 0) break;
    const result = await listThreads(account, {
      q: `after:${afterDate}`,
      maxResults: Math.min(50, remaining),
      pageToken,
    });
    if (!result.threads.length) break;

    for (const thread of result.threads) {
      if (totalSynced >= syncLimit) break;
      try {
        const localThreadId = await syncThread(account, thread.id);
        if (localThreadId) await smartLinkThread(localThreadId);
        if (thread.historyId) latestHistoryId = thread.historyId;
        totalSynced += 1;
      } catch (err) {
        console.error(`[GMAIL SYNC] Failed to sync thread ${thread.id}:`, err instanceof Error ? err.message : err);
      }
    }
    pageToken = result.nextPageToken;
  } while (pageToken);

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      lastSyncedAt: new Date(),
      gmailHistoryId: latestHistoryId ?? account.gmailHistoryId,
    },
  });
  console.log(`[GMAIL SYNC] Full sync complete: ${totalSynced} threads for ${account.emailAddress}`);
}

export async function syncThread(account: EmailAccount, gmailThreadId: string): Promise<string | null> {
  const threadData = await getGmailThread(account, gmailThreadId);
  if (!threadData.messages?.length) return null;

  const parsedMessages = threadData.messages.map((message) => parseGmailMessage(message, account.emailAddress));
  const allLabelIds = new Set(parsedMessages.flatMap((message) => message.labelIds));
  const inInbox = allLabelIds.has("INBOX");
  const inSent = parsedMessages.some((message) => message.inSent);
  const isStarred = allLabelIds.has("STARRED");
  const isUnread = allLabelIds.has("UNREAD");
  const isTrashed = allLabelIds.has("TRASH");
  const isArchived = !inInbox && !isTrashed;

  const participants = Array.from(new Set(parsedMessages.flatMap((message) => [
    message.fromAddress,
    ...message.toAddresses,
    ...message.ccAddresses,
  ]))).filter(Boolean);

  const contacts = participants.length
    ? await prisma.contact.findMany({
        where: { email: { in: participants } },
        select: { email: true, firstName: true, lastName: true },
      })
    : [];
  const contactByEmail = new Map(contacts.map((contact) => [contact.email?.toLowerCase(), contact]));
  const participantNames = participants.map((email) => {
    const contact = contactByEmail.get(email.toLowerCase());
    return contactDisplayName(contact) ?? email;
  });

  const sortedByDate = [...parsedMessages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const lastMessageAt = sortedByDate[sortedByDate.length - 1]?.sentAt ?? new Date();
  const inboxMessages = parsedMessages.filter((message) => message.inInbox && !message.isFromMe);
  const sentMessages = parsedMessages.filter((message) => message.inSent || message.isFromMe);
  const lastInboxMessageAt = inboxMessages.length ? new Date(Math.max(...inboxMessages.map((message) => message.sentAt.getTime()))) : null;
  const lastSentMessageAt = sentMessages.length ? new Date(Math.max(...sentMessages.map((message) => message.sentAt.getTime()))) : null;
  const subject = parsedMessages[0]?.subject ?? "(no subject)";
  const snippet = parsedMessages[parsedMessages.length - 1]?.snippet ?? "";

  const thread = await prisma.emailThread.upsert({
    where: {
      accountId_gmailThreadId: {
        accountId: account.id,
        gmailThreadId,
      },
    },
    update: {
      historyId: threadData.historyId,
      subject,
      snippet,
      inInbox,
      inSent,
      isStarred,
      isUnread,
      isRead: !isUnread,
      isFlagged: isStarred,
      isArchived,
      isTrashed,
      participants,
      participantNames,
      lastMessageAt,
      lastInboxMessageAt,
      lastSentMessageAt,
    },
    create: {
      accountId: account.id,
      externalThreadId: gmailThreadId,
      gmailThreadId,
      historyId: threadData.historyId,
      subject,
      snippet,
      inInbox,
      inSent,
      isStarred,
      isUnread,
      isRead: !isUnread,
      isFlagged: isStarred,
      isArchived,
      isTrashed,
      participants,
      participantNames,
      lastMessageAt,
      lastInboxMessageAt,
      lastSentMessageAt,
    },
  });

  for (const parsed of parsedMessages) {
    await prisma.emailMessage.upsert({
      where: { externalMessageId: parsed.gmailMessageId },
      update: {
        threadId: thread.id,
        gmailMessageId: parsed.gmailMessageId,
        gmailThreadId: parsed.gmailThreadId,
        labelIds: parsed.labelIds,
        inInbox: parsed.inInbox,
        inSent: parsed.inSent,
        isUnread: parsed.isUnread,
        isStarred: parsed.isStarred,
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        snippet: parsed.snippet,
        hasAttachments: parsed.hasAttachments,
        attachments: parsed.attachments,
        gmailAttachmentIds: parsed.attachments.map((attachment) => ({
          filename: attachment.filename,
          attachmentId: attachment.attachmentId,
        })),
      },
      create: {
        threadId: thread.id,
        externalMessageId: parsed.gmailMessageId,
        gmailMessageId: parsed.gmailMessageId,
        gmailThreadId: parsed.gmailThreadId,
        labelIds: parsed.labelIds,
        inInbox: parsed.inInbox,
        inSent: parsed.inSent,
        isUnread: parsed.isUnread,
        isStarred: parsed.isStarred,
        fromAddress: parsed.fromAddress,
        fromName: parsed.fromName,
        toAddresses: parsed.toAddresses,
        ccAddresses: parsed.ccAddresses,
        bccAddresses: parsed.bccAddresses,
        subject: parsed.subject,
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        snippet: parsed.snippet,
        sentAt: parsed.sentAt,
        isFromMe: parsed.isFromMe,
        hasAttachments: parsed.hasAttachments,
        attachments: parsed.attachments,
        gmailAttachmentIds: parsed.attachments.map((attachment) => ({
          filename: attachment.filename,
          attachmentId: attachment.attachmentId,
        })),
      },
    });
  }

  return thread.id;
}

export async function incrementalGmailSync(account: EmailAccount): Promise<void> {
  const currentAccount = await prisma.emailAccount.findUnique({ where: { id: account.id } });
  if (!currentAccount?.gmailHistoryId) {
    console.log(`[GMAIL SYNC] No historyId for ${account.emailAddress}; running full sync`);
    await fullGmailSync(account);
    return;
  }

  try {
    const { history, historyId } = await getHistory(account, currentAccount.gmailHistoryId);
    if (!history.length) {
      await prisma.emailAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), gmailHistoryId: historyId } });
      console.log(`[GMAIL SYNC] No changes for ${account.emailAddress}`);
      return;
    }

    const changedThreadIds = new Set<string>();
    for (const item of history) {
      const messageChanges = [
        ...(item.messagesAdded ?? []),
        ...(item.messagesDeleted ?? []),
        ...(item.labelsAdded ?? []),
        ...(item.labelsRemoved ?? []),
      ];
      for (const change of messageChanges) {
        if (change.message?.threadId) changedThreadIds.add(change.message.threadId);
      }
    }

    console.log(`[GMAIL SYNC] ${changedThreadIds.size} threads changed for ${account.emailAddress}`);
    for (const gmailThreadId of changedThreadIds) {
      try {
        const localThreadId = await syncThread(account, gmailThreadId);
        if (localThreadId) await smartLinkThread(localThreadId);
      } catch (err) {
        console.error(`[GMAIL SYNC] Failed to sync changed thread ${gmailThreadId}:`, err instanceof Error ? err.message : err);
      }
    }

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), gmailHistoryId: historyId },
    });
    console.log(`[GMAIL SYNC] Incremental sync complete for ${account.emailAddress}`);
  } catch (err) {
    if (err instanceof Error && err.message === "HISTORY_EXPIRED") {
      console.log(`[GMAIL SYNC] History expired for ${account.emailAddress}; running full sync`);
      await fullGmailSync(account);
      return;
    }
    throw err;
  }
}

export async function smartLinkThread(threadId: string): Promise<void> {
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.linkedContactId) return;
  for (const email of thread.participants) {
    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    });
    if (!contact) continue;
    const opportunity = await prisma.opportunity.findFirst({
      where: { contactId: contact.id, stage: { notIn: ["WON", "LOST"] } },
      orderBy: { updatedAt: "desc" },
    });
    const production = await prisma.production.findFirst({
      where: { contactId: contact.id, status: { not: "WRAPPED" } },
      orderBy: { updatedAt: "desc" },
    });
    await prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        linkedContactId: contact.id,
        linkedOpportunityId: opportunity?.id ?? null,
        linkedProductionId: production?.id ?? null,
      },
    });
    console.log(`[GMAIL SYNC] Auto-linked thread ${thread.id} to contact ${contact.email ?? contact.id}`);
    return;
  }
}
