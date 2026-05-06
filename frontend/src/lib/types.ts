export type ContactType = "CLIENT" | "SUPPLIER";
export type ContactSource = "REFERRAL" | "DIRECT" | "SOCIAL" | "PREVIOUS_JOB" | "OTHER";
export type PmsJobType = "STILLS" | "MOTION" | "EVENTS";
export type OppSource = "EMAIL" | "WHATSAPP" | "DM" | "REFERRAL" | "OTHER";
export type Stage = "ENQUIRY" | "BIDDING" | "QUOTED" | "WON" | "LOST";
export type LostReason = "COMPETITOR_WON" | "BUDGET_PULLED" | "NO_RESPONSE" | "TIMING" | "OTHER";

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
