export type ContactType = "CLIENT" | "SUPPLIER";
export type ContactSource = "REFERRAL" | "DIRECT" | "SOCIAL" | "PREVIOUS_JOB" | "OTHER";
export type PmsJobType = "STILLS" | "MOTION" | "EVENTS";
export type OppSource = "EMAIL" | "WHATSAPP" | "DM" | "REFERRAL" | "OTHER";
export type Stage = "ENQUIRY" | "BIDDING" | "QUOTED" | "WON" | "LOST";
export type LostReason = "COMPETITOR_WON" | "BUDGET_PULLED" | "NO_RESPONSE" | "TIMING" | "OTHER";
export type ProductionStatus = "PRE_PRO" | "SHOOT" | "POST" | "WRAPPED" | "PLANNING" | "CONFIRMED" | "IN_PRODUCTION" | "WRAP" | "DELIVERED" | "INVOICED" | "CLOSED";
export type FreeAgentInvoiceStatus = "NOT_RAISED" | "DRAFT" | "SENT" | "VIEWED" | "PAID" | "OVERDUE";
export type ProductionDateType = "PPM" | "RECCE" | "FITTING" | "MEETING" | "SHOOT_DAY" | "POST_DELIVERY" | "OTHER";
export type ProductionDateStatus = "PROPOSED" | "OPTIONED" | "CONFIRMED" | "RELEASED" | "CANCELLED";
export type CrewStatus = "REQUESTED" | "FIRST_OPTION" | "SECOND_OPTION" | "CONFIRMED" | "RELEASED";
export type JobFolder = "Briefs" | "Estimates" | "Budgets" | "Contracts" | "Crew Deals" | "Receipts" | "References" | "Selects" | "Delivery" | "Mail Attachments";
export type BudgetStatus = "DRAFT" | "SENT" | "CONFIRMED" | "IN_PRODUCTION" | "WRAPPED";
export type BudgetRevisionStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type SubCostStatus = "PENDING" | "AGREED" | "INVOICED" | "PAID";
export type SubCostLineType = "PO" | "BILL" | "PENDING_RECEIPT" | "RECEIPT";
export type PurchaseOrderStatus = "DRAFT" | "SENT" | "ACCEPTED" | "PART_BILLED" | "BILLED" | "PAID" | "CANCELLED";
export type AdvanceCalcType = "PERCENT_OF_TOTAL" | "PERCENT_OF_PRODUCTION" | "FIXED_AMOUNT";
export type ReceiptCaptureStatus = "PENDING" | "PARSING" | "PARSED" | "ASSIGNED" | "FAILED";
export type EmailProvider = "GOOGLE" | "IMAP";
export type CalendarEventType = "SHOOT_DAY" | "PPM" | "RECCE" | "FITTING" | "MEETING" | "POST_DELIVERY" | "FOLLOW_UP" | "GOOGLE_SYNC" | "STANDALONE" | "OTHER";
export type ProjectActionType = "TASK" | "DEADLINE" | "EVENT" | "MEETING" | "TRAVEL" | "SHOOT" | "REMINDER";
export type ProjectActionStatus = "TODO" | "IN_PROGRESS" | "WAITING" | "DONE" | "BLOCKED" | "CANCELLED";
export type ProjectActionVisibility = "INTERNAL" | "CLIENT";

export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { contacts: number; opportunities: number };
  contacts?: Contact[];
  opportunities?: OpportunityListItem[];
}

export interface Contact {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyId?: string;
  company?: { id: string; name: string };
  jobTitle?: string;
  type: ContactType;
  source: ContactSource;
  tags: string[];
  lastContactedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { opportunities: number };
}

export interface OpportunityListItem {
  id: string;
  title: string;
  clientName?: string;
  brand?: string;
  jobType?: PmsJobType;
  source: OppSource;
  description?: string;
  value?: string;
  stage: Stage;
  followUpDate?: string;
  lostReason?: LostReason;
  lostNote?: string;
  dateReceived?: string;
  notes?: string;
  contact?: { id: string; firstName: string; lastName?: string };
  company?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  _count?: { activityNotes: number; tasks: number };
  budgetClientGrandTotal?: number | null;
}

export interface OpportunityNote {
  id: string;
  opportunityId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityTask {
  id: string;
  opportunityId: string;
  body: string;
  completed: boolean;
  completedAt?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity extends OpportunityListItem {
  activityNotes: OpportunityNote[];
  tasks: OpportunityTask[];
  productions: { id: string; title: string; jobCode?: string; status: string }[];
  emailThreads: EmailThread[];
}

export const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: "Enquiry",
  BIDDING: "Bidding",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
};

export const STAGE_ORDER: Stage[] = ["ENQUIRY", "BIDDING", "QUOTED", "WON", "LOST"];
export const ACTIVE_STAGES: Stage[] = ["ENQUIRY", "BIDDING", "QUOTED"];

export const STAGE_COLOURS: Record<Stage, string> = {
  ENQUIRY: "bg-blue-100 text-blue-800",
  BIDDING: "bg-yellow-100 text-yellow-800",
  QUOTED: "bg-purple-100 text-purple-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-gray-100 text-gray-500",
};

export const TAG_COLOURS: Record<string, string> = {
  "Returning client": "bg-green-100 text-green-800",
  "Warm lead": "bg-orange-100 text-orange-800",
  "Key account": "bg-blue-100 text-blue-800",
  "Key crew": "bg-purple-100 text-purple-800",
  VIP: "bg-pink-100 text-pink-800",
  Other: "bg-gray-100 text-gray-700",
};

export function tagColour(tag: string): string {
  return TAG_COLOURS[tag] ?? "bg-gray-100 text-gray-700";
}

export function daysOverdue(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

export interface CrewRole {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionDatePerson {
  id: string;
  contactId: string;
  contact: Contact;
}

export interface ProductionDate {
  id: string;
  productionId: string;
  dateType: ProductionDateType;
  status: ProductionDateStatus;
  date: string;
  time?: string;
  location?: string;
  zoomLink?: string;
  notes?: string;
  label?: string;
  people: ProductionDatePerson[];
  production?: Pick<Production, "id" | "title" | "jobCode" | "clientName" | "brand" | "status">;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  location?: string | null;
  zoomLink?: string | null;
  notes?: string | null;
  color?: string | null;
  eventType: CalendarEventType;
  productionId?: string | null;
  productionDateId?: string | null;
  opportunityId?: string | null;
  contactIds: string[];
  googleCalendarEventId?: string | null;
  googleCalendarId?: string | null;
  syncedFromGoogle: boolean;
  lastSyncedAt?: string | null;
  icon: string;
  formattedType: string;
  productionColor?: string | null;
  production?: Pick<Production, "id" | "title" | "jobCode" | "clientName" | "brand" | "status"> | null;
  opportunity?: Pick<OpportunityListItem, "id" | "title" | "clientName" | "brand" | "stage" | "value"> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrewMember {
  id: string;
  productionId: string;
  contactId?: string;
  contact?: Contact;
  roleId?: string;
  role?: CrewRole;
  name: string;
  email?: string;
  phone?: string;
  status: CrewStatus;
  dayRate?: string;
  numberOfDays: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityNote {
  id: string;
  entityType: "PRODUCTION" | "OPPORTUNITY";
  entityId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTask {
  id: string;
  entityType: "PRODUCTION" | "OPPORTUNITY";
  entityId: string;
  body: string;
  completed: boolean;
  completedAt?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  externalMessageId: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  labelIds?: string[];
  fromAddress: string;
  from?: string;
  fromName?: string;
  toAddresses: string[];
  to?: string;
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string;
  bodyHtml: string;
  htmlBody?: string;
  bodyText: string;
  body?: string;
  sentAt: string;
  isFromMe: boolean;
  hasAttachments: boolean;
  attachments: Array<{ filename: string; mimeType: string; sizeBytes: number; contentId?: string; isInline?: boolean; jobFileId?: string; jobFile?: JobFile }>;
  resolvedFromName?: string;
  avatarColor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAttachmentSummary {
  messageId: string;
  attachmentIndex: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isInline?: boolean;
  jobFileId?: string;
  jobFile?: JobFile;
}

export interface EmailThread {
  id: string;
  accountId?: string;
  account?: EmailAccount;
  externalThreadId: string;
  gmailThreadId?: string;
  snippet?: string;
  subject: string;
  participants: string[];
  lastMessageAt: string;
  isRead: boolean;
  isFlagged: boolean;
  isArchived: boolean;
  linkedContactId?: string;
  linkedOpportunityId?: string;
  linkedProductionId?: string;
  linkedContact?: Contact;
  linkedOpportunity?: OpportunityListItem;
  linkedProduction?: Pick<Production, "id" | "title" | "jobCode" | "clientName" | "brand">;
  messages: EmailMessage[];
  hasMoreOlder?: boolean;
  totalMessageCount?: number;
  latestPreview?: string;
  participantNames?: string[];
  resolvedSenderName?: string;
  avatarColor?: string;
  messageCount?: number;
  hasAttachments?: boolean;
  attachments?: EmailAttachmentSummary[];
  totalAttachmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccount {
  id: string;
  label: string;
  emailAddress: string;
  provider: EmailProvider;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
  isActive: boolean;
  isPrimary: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  defaultCc?: string;
  defaultBcc?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailThreadsResponse {
  threads: EmailThread[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Production {
  id: string;
  title: string;
  clientName?: string;
  brand?: string;
  jobType?: PmsJobType;
  jobCode?: string;
  description?: string;
  status: ProductionStatus;
  value?: string;
  freeAgentInvoiceStatus: FreeAgentInvoiceStatus;
  notes?: string;
  storagePath?: string;
  quotedValue: number;
  actualSpend: number;
  variance: number;
  variancePercent: number;
  overBudget: boolean;
  nextDate?: ProductionDate | null;
  dates: ProductionDate[];
  crewMembers: CrewMember[];
  emailThreads: EmailThread[];
  activityNotes?: ActivityNote[];
  activityTasks?: ActivityTask[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWorkstream {
  id: string;
  productionId: string;
  optionGroupId?: string | null;
  name: string;
  color?: string | null;
  order: number;
  visibleOnClientTimeline: boolean;
  optionGroup?: {
    id: string;
    name: string;
    requirements?: Array<{
      id: string;
      name: string;
      displayLabel: string;
      activeState: string;
      assignments?: Array<{
        id: string;
        dateId: string;
        candidateId: string;
        candidate?: { id: string; name: string; blackbookEntry?: { id: string; displayName: string } | null };
      }>;
    }>;
    candidates?: Array<{
      id: string;
      name: string;
      activeState: string;
      blackbookEntry?: { id: string; displayName: string; email?: string | null; phone?: string | null } | null;
      dateStatuses?: Array<{ id: string; dateId: string; status: string }>;
    }>;
  } | null;
}

export interface ProjectAction {
  id: string;
  productionId: string;
  workstreamId?: string | null;
  title: string;
  description?: string | null;
  actionType: ProjectActionType;
  visibility: ProjectActionVisibility;
  status: ProjectActionStatus;
  startAt?: string | null;
  endAt?: string | null;
  isAllDay: boolean;
  location?: string | null;
  zoomLink?: string | null;
  reminderMinutes?: number | null;
  roleRequirementId?: string | null;
  optionCandidateId?: string | null;
  blackbookEntryId?: string | null;
  emailThreadId?: string | null;
  emailMessageId?: string | null;
  calendarEventId?: string | null;
  workstream?: ProjectWorkstream | null;
  emailThread?: { id: string; subject: string; gmailThreadId?: string | null } | null;
  emailMessage?: { id: string; subject: string; fromAddress: string; fromName?: string | null; sentAt: string; snippet?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobFile {
  id: string;
  productionId?: string | null;
  folder: JobFolder;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  linkedBudgetLineId?: string;
  isReceipt: boolean;
  receiptVendor?: string;
  receiptAmount?: number;
  receiptDate?: string;
  notes?: string;
  sourceEmailThreadId?: string;
  sourceEmailMessageId?: string;
  sourceEmailAttachmentIndex?: number;
  sourceEmailFilename?: string;
  production?: {
    id: string;
    jobCode?: string;
    clientName?: string;
    brand?: string;
    title: string;
  };
}

export interface ReceiptCapture {
  id: string;
  status: ReceiptCaptureStatus;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  storedPath: string;
  parsedVendor?: string | null;
  parsedAmount?: number | null;
  parsedAmountGross?: number | null;
  parsedAmountNet?: number | null;
  parsedVatAmount?: number | null;
  parsedVatRate?: number | null;
  parsedDate?: string | null;
  parsedCurrency: string;
  parsedDescription?: string | null;
  parsedAicpSection?: string | null;
  parsedAicpSectionName?: string | null;
  parseConfidence?: "high" | "medium" | "low" | string | null;
  parseRawText?: string | null;
  parsedAt?: string | null;
  productionId?: string | null;
  production?: Pick<Production, "id" | "title" | "jobCode" | "clientName" | "brand"> | null;
  lineItemId?: string | null;
  lineItem?: (Pick<BudgetLineItem, "id" | "lineCode" | "description"> & { section?: { code: string; name: string } }) | null;
  jobFileId?: string | null;
  jobFile?: JobFile | null;
  assignedAt?: string | null;
  capturedOffline: boolean;
  syncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileTreeFolder {
  name: JobFolder;
  files: JobFile[];
}

export interface FileTree {
  productionId: string;
  folders: FileTreeFolder[];
}

export interface FileListResponse {
  files: JobFile[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface StorageInfo {
  totalBytes: number;
  fileCount: number;
  basePath: string;
}

export interface BudgetTotals {
  subtotal: number;
  productionFee: number;
  insurance: number;
  grandTotal: number;
  totalActuals: number;
  totalVariance: number;
  totalRemaining: number;
  currencyConverted: number | null;
  advances: { id: string; calculatedAmount: number }[];
  sectionTotals: {
    sectionId: string;
    code: string;
    name: string;
    estimatedTotal: number;
    actualTotal: number;
    variance: number;
    remainingBudget: number;
    agreedCount: number;
    invoicedCount: number;
    paidCount: number;
    closedCount: number;
  }[];
}

export interface SubCost {
  id: string;
  lineItemId: string;
  purchaseOrderGroupId?: string | null;
  lineType: SubCostLineType;
  poNumber?: string | null;
  description: string;
  supplierName?: string | null;
  amount: number;
  amountGross?: number | null;
  vatAmount?: number | null;
  vatRate?: number | null;
  currency: string;
  status: SubCostStatus;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  datePaid?: string | null;
  invoiceFileId?: string | null;
  proofOfPayment?: string | null;
  isAgreed: boolean;
  isInvoiced: boolean;
  isPaid: boolean;
  freeAgentTransactionId?: string | null;
  receiptCaptureId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderGroup {
  id: string;
  productionId: string;
  budgetId?: string | null;
  poNumber: string;
  supplierName: string;
  supplierEmail?: string | null;
  supplierPhone?: string | null;
  blackbookEntryId?: string | null;
  optionCandidateId?: string | null;
  status: PurchaseOrderStatus;
  notes?: string | null;
  total: number;
  createdAt: string;
  updatedAt: string;
  blackbookEntry?: { id: string; displayName: string; email?: string | null; phone?: string | null; category?: string; entryType?: string } | null;
  optionCandidate?: { id: string; name: string; group?: { id: string; name: string; type: string } | null } | null;
  allocations: Array<SubCost & {
    invoiceFile?: { id: string; originalFilename: string; mimeType: string; sizeBytes: number; uploadedAt: string } | null;
    lineItem: Pick<BudgetLineItem, "id" | "lineCode" | "description" | "estimatedTotal" | "actualTotal" | "variance"> & {
      section: { id: string; code: string; name: string };
    };
  }>;
}

export interface PurchaseOrderContext {
  budgetId: string | null;
  lines: Array<Pick<BudgetLineItem, "id" | "lineCode" | "description" | "estimatedTotal" | "actualTotal" | "variance"> & {
    section: { id: string; code: string; name: string };
  }>;
  optionCandidates: Array<{
    id: string;
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    blackbookEntryId?: string | null;
    blackbookEntry?: { id: string; displayName: string; email?: string | null; phone?: string | null } | null;
    group: { id: string; name: string; type: string };
  }>;
}

export interface BudgetLineItem {
  id: string;
  sectionId: string;
  lineCode: string;
  description: string;
  clientNotes?: string | null;
  internalNotes?: string | null;
  qty: number;
  days: number;
  rate: number;
  unit: string;
  agencyFeePercent?: number | null;
  estimatedTotal: number;
  actualTotal: number;
  variance: number;
  isAgreed: boolean;
  isClosed: boolean;
  subCosts: SubCost[];
  order: number;
  isSubItem: boolean;
  parentId?: string | null;
  children?: BudgetLineItem[];
  reconNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSection {
  id: string;
  revisionId: string;
  code: string;
  name: string;
  order: number;
  isVisible: boolean;
  lineItems: BudgetLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetRevision {
  id: string;
  budgetId: string;
  revisionNumber: number;
  majorVersion: number;
  minorVersion: number;
  label: string;
  status: BudgetRevisionStatus;
  productionFeePercent: number;
  insurancePercent: number;
  notes?: string;
  estimateDescription?: string | null;
  includedNotes?: string | null;
  notIncludedNotes?: string | null;
  assumptions?: string | null;
  paymentTerms?: string | null;
  validUntil?: string | null;
  representative?: string | null;
  sourceRevisionId?: string | null;
  isLocked: boolean;
  lockedAt?: string | null;
  changeSummary?: string | null;
  sections: BudgetSection[];
  transfers?: BudgetLineTransfer[];
  createdAt: string;
  updatedAt: string;
  totals: BudgetTotals;
}

export interface BudgetLineTransfer {
  id: string;
  revisionId: string;
  fromLineItemId: string;
  toLineItemId: string;
  amount: number;
  reason?: string | null;
  createdAt: string;
  fromLineItem?: Pick<BudgetLineItem, "id" | "lineCode" | "description" | "estimatedTotal" | "actualTotal" | "variance">;
  toLineItem?: Pick<BudgetLineItem, "id" | "lineCode" | "description" | "estimatedTotal" | "actualTotal" | "variance">;
}

export interface Budget {
  id: string;
  productionId?: string;
  opportunityId?: string;
  jobName?: string | null;
  jobLocation?: string | null;
  shotCount?: string | null;
  prepTravelDate?: string | null;
  shootDates?: string | null;
  photographerDirector?: string | null;
  accountingContact?: string | null;
  comments?: string | null;
  caveats?: string | null;
  usages?: string | null;
  productionFeePercent: number;
  insurancePercent: number;
  currencyBase: string;
  currencySecondary?: string | null;
  currencyRate?: number | null;
  status: BudgetStatus;
  version: number;
  currentRevisionId?: string;
  currentRevision?: BudgetRevision;
  advanceInvoices: AdvanceInvoice[];
  totals?: BudgetTotals;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceInvoice {
  id: string;
  budgetId: string;
  label: string;
  percent?: number | null;
  amount?: number | null;
  calculationType: AdvanceCalcType;
  calculatedAmount?: number | null;
  isPaid: boolean;
  datePaid?: string | null;
  freeAgentInvoiceId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SectionTemplateSection {
  code: string;
  name: string;
  order: number;
  defaultLineItems: string[];
}

export interface SectionTemplate {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  sections: SectionTemplateSection[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  section: string;
  description: string;
  defaultInternalUnitCost: number;
  defaultClientUnitCost: number;
  defaultUnitLabel: string;
  defaultQuantity: number;
  defaultDaysUnits: number;
  defaultAgencyMarkup: number;
  notes?: string;
  isActive: boolean;
  order: number;
}

export interface CatalogSection {
  code: string;
  name: string;
  items: CatalogItem[];
}

export interface BudgetRevisionSummary {
  id: string;
  budgetId: string;
  revisionNumber: number;
  majorVersion: number;
  minorVersion: number;
  label: string;
  status: BudgetRevisionStatus;
  sourceRevisionId?: string | null;
  isLocked: boolean;
  lockedAt?: string | null;
  changeSummary?: string | null;
  estimateDescription?: string | null;
  createdAt: string;
  updatedAt: string;
  grandTotal: number;
}

export const JOB_FOLDERS: JobFolder[] = ["Briefs", "Estimates", "Budgets", "Contracts", "Crew Deals", "Receipts", "References", "Selects", "Delivery", "Mail Attachments"];

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PRE_PRO: "Pre-pro",
  SHOOT: "Shoot",
  POST: "Post",
  WRAPPED: "Wrapped",
  PLANNING: "Pre-pro",
  CONFIRMED: "Pre-pro",
  IN_PRODUCTION: "Shoot",
  WRAP: "Wrapped",
  DELIVERED: "Post",
  INVOICED: "Wrapped",
  CLOSED: "Wrapped",
};

export const ACTIVE_PRODUCTION_STATUSES: ProductionStatus[] = ["PRE_PRO", "SHOOT", "POST", "WRAPPED"];

export const DATE_TYPE_LABELS: Record<ProductionDateType, string> = {
  PPM: "PPM",
  RECCE: "Recce",
  FITTING: "Fitting",
  MEETING: "Meeting",
  SHOOT_DAY: "Shoot Day",
  POST_DELIVERY: "Post Delivery",
  OTHER: "Other",
};

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  REQUESTED: "Requested",
  FIRST_OPTION: "1st Option",
  SECOND_OPTION: "2nd Option",
  CONFIRMED: "Confirmed",
  RELEASED: "Released",
};

export function formatCurrency(value: number | string | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `£${Number(n ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatBytes(bytes: number | undefined): string {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
