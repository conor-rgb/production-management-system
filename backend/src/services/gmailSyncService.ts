import { EmailAccount, EmailAutoCategory, EmailCategoryRuleMatchType } from "@prisma/client";
import prisma from "../prisma";
import { getGmailDraft, getHistory, getGmailThread, listGmailDrafts, listThreads, parseGmailMessage, type ParsedGmailMessage } from "./gmailService";

function contactDisplayName(contact?: { firstName: string; lastName: string | null } | null): string | null {
  if (!contact) return null;
  return `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
}

function deriveThreadCategory(messages: ParsedGmailMessage[]): EmailAutoCategory {
  const participantCount = new Set(messages.flatMap((message) => [
    message.fromAddress,
    ...message.toAddresses,
    ...message.ccAddresses,
  ]).filter(Boolean).map((email) => email.toLowerCase())).size;
  const humanReplyCount = messages.filter((message) =>
    !message.autoCategory || message.autoCategory === EmailAutoCategory.PEOPLE || message.isFromMe
  ).length;

  if (participantCount >= 3 && humanReplyCount >= 2) {
    return EmailAutoCategory.PEOPLE;
  }

  const categories = messages.map((message) => message.autoCategory);
  const peopleCount = categories.filter((category) => category === EmailAutoCategory.PEOPLE).length;
  if (peopleCount >= 2 && peopleCount >= categories.length / 2) return EmailAutoCategory.PEOPLE;
  if (categories.includes(EmailAutoCategory.PURCHASES)) return EmailAutoCategory.PURCHASES;
  if (categories.includes(EmailAutoCategory.PROMOTIONS)) return EmailAutoCategory.PROMOTIONS;
  if (categories.includes(EmailAutoCategory.NEWSLETTERS)) return EmailAutoCategory.NEWSLETTERS;
  if (categories.includes(EmailAutoCategory.SOCIAL)) return EmailAutoCategory.SOCIAL;
  if (categories.includes(EmailAutoCategory.FORUMS)) return EmailAutoCategory.FORUMS;
  if (categories.includes(EmailAutoCategory.UPDATES)) return EmailAutoCategory.UPDATES;
  if (categories.includes(EmailAutoCategory.PEOPLE)) return EmailAutoCategory.PEOPLE;
  return EmailAutoCategory.OTHER;
}

function emailDomain(address: string): string | null {
  const domain = address.toLowerCase().split("@")[1]?.trim();
  return domain || null;
}

async function categoryRuleForThread(accountId: string, messages: ParsedGmailMessage[]): Promise<EmailAutoCategory | null> {
  const senders = Array.from(new Set(messages.map((message) => message.fromAddress.toLowerCase()).filter(Boolean)));
  const domains = Array.from(new Set(senders.map(emailDomain).filter((domain): domain is string => Boolean(domain))));
  if (!senders.length && !domains.length) return null;

  const or: Array<{ matchType: EmailCategoryRuleMatchType; value: { in: string[] } }> = [];
  if (senders.length) or.push({ matchType: EmailCategoryRuleMatchType.SENDER, value: { in: senders } });
  if (domains.length) or.push({ matchType: EmailCategoryRuleMatchType.DOMAIN, value: { in: domains } });

  const rules = await prisma.emailCategoryRule.findMany({
    where: {
      accountId,
      OR: or,
    },
  });

  const senderRule = rules.find((rule) => rule.matchType === EmailCategoryRuleMatchType.SENDER);
  if (senderRule) return senderRule.category;
  return rules.find((rule) => rule.matchType === EmailCategoryRuleMatchType.DOMAIN)?.category ?? null;
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
  const draftMessages = parsedMessages.filter((message) => message.isDraft);
  if (draftMessages.length) {
    await prisma.emailMessage.updateMany({
      where: { gmailMessageId: { in: draftMessages.map((message) => message.gmailMessageId) } },
      data: { isDraftArtifact: true },
    });
  }
  const visibleMessages = parsedMessages.filter((message) => !message.isDraft);
  if (!visibleMessages.length) return null;

  const allLabelIds = new Set(visibleMessages.flatMap((message) => message.labelIds));
  const inInbox = allLabelIds.has("INBOX");
  const inSent = visibleMessages.some((message) => message.inSent);
  const isStarred = allLabelIds.has("STARRED");
  const isUnread = allLabelIds.has("UNREAD");
  const isTrashed = allLabelIds.has("TRASH");
  const isArchived = !inInbox && !isTrashed;

  const participants = Array.from(new Set(visibleMessages.flatMap((message) => [
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

  const sortedByDate = [...visibleMessages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const lastMessageAt = sortedByDate[sortedByDate.length - 1]?.sentAt ?? new Date();
  const inboxMessages = visibleMessages.filter((message) => message.inInbox && !message.isFromMe);
  const sentMessages = visibleMessages.filter((message) => message.inSent);
  const lastInboxMessageAt = inboxMessages.length ? new Date(Math.max(...inboxMessages.map((message) => message.sentAt.getTime()))) : null;
  const lastSentMessageAt = sentMessages.length ? new Date(Math.max(...sentMessages.map((message) => message.sentAt.getTime()))) : null;
  const subject = visibleMessages[0]?.subject ?? "(no subject)";
  const snippet = visibleMessages[visibleMessages.length - 1]?.snippet ?? "";
  const autoCategory = await categoryRuleForThread(account.id, visibleMessages) ?? deriveThreadCategory(visibleMessages);
  const gmailCategory = visibleMessages.find((message) => message.gmailCategory)?.gmailCategory ?? null;
  const unsubscribeSource = visibleMessages.find((message) => message.unsubscribeUrl || message.unsubscribeEmail);

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
      autoCategory,
      gmailCategory,
      unsubscribeUrl: unsubscribeSource?.unsubscribeUrl ?? null,
      unsubscribeEmail: unsubscribeSource?.unsubscribeEmail ?? null,
      unsubscribeMethod: unsubscribeSource?.unsubscribeMethod ?? null,
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
      autoCategory,
      gmailCategory,
      unsubscribeUrl: unsubscribeSource?.unsubscribeUrl ?? null,
      unsubscribeEmail: unsubscribeSource?.unsubscribeEmail ?? null,
      unsubscribeMethod: unsubscribeSource?.unsubscribeMethod ?? null,
      participants,
      participantNames,
      lastMessageAt,
      lastInboxMessageAt,
      lastSentMessageAt,
    },
  });

  for (const parsed of visibleMessages) {
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
        isDraftArtifact: false,
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
        isDraftArtifact: false,
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

export async function syncGmailDraftsForAccount(account: EmailAccount): Promise<void> {
  const remoteDraftSummaries = await listGmailDrafts(account);
  const remoteDraftIds = new Set(remoteDraftSummaries.map((draft) => draft.id));
  for (const summary of remoteDraftSummaries) {
    try {
      const draftData = await getGmailDraft(account, summary.id);
      if (!draftData.message) continue;
      const parsed = parseGmailMessage(draftData.message, account.emailAddress);
      const bodyHtml = parsed.bodyHtml || parsed.bodyText;
      await prisma.emailDraft.upsert({
        where: {
          accountId_gmailDraftId: {
            accountId: account.id,
            gmailDraftId: summary.id,
          },
        },
        update: {
          gmailDraftMessageId: parsed.gmailMessageId,
          gmailThreadId: parsed.gmailThreadId,
          to: { set: parsed.toAddresses },
          cc: { set: parsed.ccAddresses },
          bcc: { set: parsed.bccAddresses },
          subject: parsed.subject === "(no subject)" ? "" : parsed.subject,
          bodyHtml,
          lastEditedAt: parsed.sentAt,
          lastSyncedToGmailAt: new Date(),
        },
        create: {
          accountId: account.id,
          gmailDraftId: summary.id,
          gmailDraftMessageId: parsed.gmailMessageId,
          gmailThreadId: parsed.gmailThreadId,
          to: parsed.toAddresses,
          cc: parsed.ccAddresses,
          bcc: parsed.bccAddresses,
          subject: parsed.subject === "(no subject)" ? "" : parsed.subject,
          bodyHtml,
          lastEditedAt: parsed.sentAt,
          lastSyncedToGmailAt: new Date(),
        },
      });
      await prisma.emailMessage.updateMany({
        where: { gmailMessageId: parsed.gmailMessageId },
        data: { isDraftArtifact: true },
      });
    } catch (err) {
      console.error(`[GMAIL SYNC] Failed to sync draft ${summary.id}:`, err instanceof Error ? err.message : err);
    }
  }

  await prisma.emailDraft.deleteMany({
    where: {
      accountId: account.id,
      gmailDraftId: { not: null, notIn: Array.from(remoteDraftIds) },
    },
  });
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
