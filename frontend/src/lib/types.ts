export type ContactType = "CLIENT" | "SUPPLIER";
export type ContactSource = "REFERRAL" | "DIRECT" | "SOCIAL" | "PREVIOUS_JOB" | "OTHER";
export type PmsJobType = "STILLS" | "MOTION" | "EVENTS";
export type OppSource = "EMAIL" | "WHATSAPP" | "DM" | "REFERRAL" | "OTHER";
export type Stage = "ENQUIRY" | "BIDDING" | "QUOTED" | "WON" | "LOST";
export type LostReason = "COMPETITOR_WON" | "BUDGET_PULLED" | "NO_RESPONSE" | "TIMING" | "OTHER";
export type ProductionStatus = "PRE_PRO" | "SHOOT" | "POST" | "WRAPPED" | "PLANNING" | "CONFIRMED" | "IN_PRODUCTION" | "WRAP" | "DELIVERED" | "INVOICED" | "CLOSED";
export type FreeAgentInvoiceStatus = "NOT_RAISED" | "DRAFT" | "SENT" | "VIEWED" | "PAID" | "OVERDUE";
export type ProductionDateType = "PPM" | "RECCE" | "FITTING" | "MEETING" | "SHOOT_DAY" | "POST_DELIVERY" | "OTHER";
export type CrewStatus = "REQUESTED" | "FIRST_OPTION" | "SECOND_OPTION" | "CONFIRMED" | "RELEASED";
export type JobFolder = "Briefs" | "Estimates" | "Budgets" | "Contracts" | "Crew Deals" | "Receipts" | "References" | "Selects" | "Delivery";
export type BudgetRevisionStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "SUPERSEDED";
export type InvoiceStatus = "PENDING" | "PAID";
export type PurchaseOrderStatus = "OPEN" | "INVOICED" | "PAID";
export type EmailProvider = "GOOGLE" | "IMAP";

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
  attachments: { filename: string; mimeType: string; sizeBytes: number; contentId?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailThread {
  id: string;
  accountId?: string;
  account?: EmailAccount;
  externalThreadId: string;
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
  latestPreview?: string;
  participantNames?: string[];
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

export interface JobFile {
  id: string;
  productionId: string;
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
  production?: {
    id: string;
    jobCode?: string;
    clientName?: string;
    brand?: string;
    title: string;
  };
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
  mode: "bidding" | "production";
  internalTotal: number;
  clientTotal: number;
  productionFeeAmount: number;
  clientGrandTotal: number;
  totalMarginAmount: number;
  totalMarginPercent: number;
  totalAccrual?: number;
  totalPOs?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  totalCommitted?: number;
  totalRemaining?: number;
  projectedMargin?: number;
  projectedMarginPercent?: number;
  isOverAccrual?: boolean;
  isOverBudget?: boolean;
  actualTotal?: number;
  variance?: number;
  overBudget: boolean;
  sectionTotals: {
    sectionId: string;
    code: string;
    name: string;
    internalTotal: number;
    clientTotal: number;
    marginAmount: number;
    marginPercent: number;
    accrual: number;
    totalPOs: number;
    totalInvoiced: number;
    totalPaid: number;
    totalCommitted: number;
    remaining: number;
    releasedToMargin: number;
  }[];
}

export interface BudgetLineInvoice {
  id: string;
  lineItemId: string;
  supplierName: string;
  invoiceNumber?: string;
  amount: number;
  dateReceived?: string;
  status: InvoiceStatus;
  jobFileId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLineItem {
  id: string;
  sectionId: string;
  lineCode: string;
  description: string;
  privateMemo?: string;
  publicMemo?: string;
  internalUnitCost: number;
  clientUnitCost: number;
  quantity: number;
  daysUnits: number;
  unitLabel: string;
  agencyMarkup: number;
  internalSubtotal: number;
  clientSubtotal: number;
  marginAmount: number;
  marginPercent: number;
  actualCost: number;
  variance: number;
  isClosed: boolean;
  isTaxable: boolean;
  hasPW: boolean;
  hasHealthSafety: boolean;
  baseHours?: number;
  overtime15x?: number;
  overtime2x?: number;
  catalogItemId?: string;
  order: number;
  invoices: BudgetLineInvoice[];
  purchaseOrders: PurchaseOrder[];
  totalPOs?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  totalCommitted?: number;
  remainingAccrual?: number;
  isOverAccrual?: boolean;
  isOverBudget?: boolean;
  accrualUsedPercent?: number;
  releasedToMargin?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  lineItemId: string;
  productionId: string;
  poNumber: string;
  supplierName: string;
  description?: string;
  agreedAmount: number;
  status: PurchaseOrderStatus;
  dateRaised: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceFileId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSection {
  id: string;
  revisionId: string;
  code: string;
  name: string;
  order: number;
  lineItems: BudgetLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BudgetRevision {
  id: string;
  budgetId: string;
  revisionNumber: number;
  label: string;
  status: BudgetRevisionStatus;
  version: number;
  productionFeePercent: number;
  notes?: string;
  sections: BudgetSection[];
  createdAt: string;
  updatedAt: string;
  totals: BudgetTotals;
}

export interface Budget {
  id: string;
  productionId?: string;
  opportunityId?: string;
  currentRevisionId?: string;
  currentRevision?: BudgetRevision;
  totals?: BudgetTotals;
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
  label: string;
  status: BudgetRevisionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  clientGrandTotal: number;
}

export const JOB_FOLDERS: JobFolder[] = ["Briefs", "Estimates", "Budgets", "Contracts", "Crew Deals", "Receipts", "References", "Selects", "Delivery"];

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
