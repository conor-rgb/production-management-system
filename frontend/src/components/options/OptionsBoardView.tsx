import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChevronDown, Download, ExternalLink, FileText, Globe, Image as ImageIcon, Mail, Phone, Plus, Search, Share2, Trash2, Upload, X } from "lucide-react";
import { api } from "../../lib/api";
import { COUNTRY_OPTIONS, countryName } from "../../lib/countries";
import BlackbookOverlay from "../blackbook/BlackbookOverlay";

type RequirementType = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";
type RequirementState = "ACTIVE" | "PARKED" | "RELEASED";
type CandidateState = "ACTIVE" | "PARKED" | "RELEASED";
type HoldStatus = "REQUESTED" | "FIRST_OPTION" | "SECOND_OPTION" | "CONFIRMED" | "RELEASED" | "UNAVAILABLE" | "NA";
type BlackbookLifecycleStatus = "TARGET" | "IN_TOUCH" | "CLIENT" | "PAST_CLIENT" | "SUPPLIER" | "PREFERRED_SUPPLIER" | "DO_NOT_USE" | "ARCHIVED";
type CandidateSortKey = "manual" | "name" | "notes" | "links" | "rate" | "state" | `date:${string}`;
type SortDirection = "asc" | "desc";
type BlackbookAddressType = "WORK" | "BILLING" | "PERSONAL" | "CUSTOM";
type OptionColumnType =
  | "SINGLE_LINE_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "CURRENCY"
  | "PERCENT"
  | "CHECKBOX"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "URL"
  | "EMAIL"
  | "PHONE"
  | "ATTACHMENT"
  | "BLACKBOOK_LINK";
type DeckBlockType = "field" | "links" | "dateStatus" | "imageGrid" | "notes" | "map" | "footer";
type DeckField = "name" | "subtitle" | "location" | "address" | "clientNotes" | "internalNotes" | "project";
type DeckImageLayout = "grid" | "justify";
type DeckImageFit = "contain" | "cover" | "natural";
type DeckVerticalAlign = "top" | "middle" | "bottom";
type DeckImagePosition = "top" | "center" | "bottom";

interface DeckTemplateBlock {
  id: string;
  type: DeckBlockType;
  label: string;
  field?: DeckField;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: DeckVerticalAlign;
  lineHeight?: number;
  letterSpacing?: number;
  textColor?: string;
  textPadding?: number;
  textMaxLines?: number;
  uppercase?: boolean;
  hideIfEmpty?: boolean;
  imageCount?: number;
  imagePadding?: number;
  imageGap?: number;
  imageLayout?: DeckImageLayout;
  imageFit?: DeckImageFit;
  imagePosition?: DeckImagePosition;
  imageBackground?: string;
  imageBorder?: boolean;
  imageRadius?: number;
  imageAllowRows?: boolean;
  imageHideEmptySlots?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

interface DeckTemplate {
  id: string;
  name: string;
  blocks: DeckTemplateBlock[];
}

interface BlackbookAddress {
  id: string;
  entryId: string;
  type: BlackbookAddressType;
  label: string | null;
  isDefaultBilling: boolean;
  source: "MANUAL" | "GOOGLE_PLACES";
  placeId: string | null;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
}

interface BlackbookConfigType {
  id: string;
  name: string;
  slug: string;
}

interface BlackbookConfigCategory {
  id: string;
  name: string;
  broadType: BlackbookCategory;
  color: string;
  types: BlackbookConfigType[];
}

type CreateBlackbookPayload = {
  categoryConfigId?: string | null;
  typeIds?: string[];
  lifecycleStatus?: BlackbookLifecycleStatus;
  category?: BlackbookCategory;
};

interface PlaceSearchResult {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  types: string[];
}

interface NormalizedPlace {
  placeId: string;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  types: string[];
}
type PipelineState = "NOT_REQUIRED" | "NEEDED" | "REQUESTED" | "SECOND_OPTION" | "FIRST_OPTION" | "CONFIRMED" | "UNAVAILABLE" | "RELEASED";
type ProductionDateType = "PPM" | "RECCE" | "FITTING" | "MEETING" | "SHOOT_DAY" | "POST_DELIVERY" | "OTHER";
type ProductionDateStatus = "PROPOSED" | "OPTIONED" | "CONFIRMED" | "RELEASED" | "CANCELLED";
type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";

const IMAGE_DROP_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface MatrixDate {
  id: string;
  dateType: ProductionDateType;
  status: ProductionDateStatus;
  date: string;
  time: string | null;
  label: string | null;
  location: string | null;
  notes: string | null;
}

interface RequirementDateNeed {
  id: string;
  requirementId: string;
  dateId: string;
  isRequired: boolean;
  notes: string | null;
}

interface OptionSlotAssignment {
  id: string;
  requirementId: string;
  candidateId: string;
  dateId: string;
  notes: string | null;
}

interface CandidateDateStatus {
  id: string;
  candidateId: string;
  dateId: string;
  status: HoldStatus;
  notes: string | null;
}

interface OptionCandidatePhoto {
  id: string;
  candidateId: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  order: number;
  caption: string | null;
  exportSelected: boolean;
  createdAt: string;
  url: string;
}

interface OptionColumn {
  id: string;
  groupId: string;
  key: string;
  label: string;
  type: OptionColumnType;
  width: number;
  order: number;
  hidden: boolean;
  locked: boolean;
  config: Record<string, unknown> | null;
}

interface OptionColumnValue {
  id: string;
  candidateId: string;
  columnId: string;
  value: unknown;
}

interface OptionRequirement {
  id: string;
  productionId: string;
  groupId: string;
  name: string;
  displayLabel: string;
  type: RequirementType;
  slotNumber: number;
  activeState: RequirementState;
  notes: string | null;
  order: number;
  dateNeeds: RequirementDateNeed[];
  assignments: OptionSlotAssignment[];
}

interface OptionCandidate {
  id: string;
  productionId: string;
  groupId: string;
  blackbookEntryId: string | null;
  selectedAddressId: string | null;
  name: string;
  subtitle: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bookUrl: string | null;
  socialUrl: string | null;
  modelsComUrl: string | null;
  pdfUrl: string | null;
  pdfFilename: string | null;
  pdfSizeBytes: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  locationType: string | null;
  latitude: number | null;
  longitude: number | null;
  mapImageUrl: string | null;
  mapImageUpdatedAt: string | null;
  rate: number | null;
  rateUnit: string | null;
  currency: string;
  activeState: CandidateState;
  internalNotes: string | null;
  clientNotes: string | null;
  order: number;
  dateStatuses: CandidateDateStatus[];
  assignments: OptionSlotAssignment[];
  photos: OptionCandidatePhoto[];
  columnValues: OptionColumnValue[];
  blackbookEntry: BlackbookEntry | null;
  selectedAddress: BlackbookAddress | null;
}

interface BlackbookEntry {
  id: string;
  entryType: BlackbookEntryType;
  category: BlackbookCategory;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  tags: string[];
  notes: string | null;
  defaultRate: number | null;
  rateUnit: string | null;
  currency: string;
  dietaryNotes: string | null;
  dietaryFlags: string[];
  allergens: string[];
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  locationType: string | null;
  addresses?: BlackbookAddress[];
  daylight: boolean | null;
  blackout: boolean | null;
  areaSqm: number | null;
  shootingAreaSqm: number | null;
  ceilingHeight: string | null;
  accessNotes: string | null;
  parkingNotes: string | null;
  travelNotes: string | null;
  facilities: string | null;
  ukAgency: string | null;
  frAgency: string | null;
  bookUrl: string | null;
  socialUrl: string | null;
  polasUrl: string | null;
  selfTapeUrl: string | null;
  modelsComUrl: string | null;
  height: string | null;
  eyes: string | null;
  hair: string | null;
  bust: string | null;
  waist: string | null;
  hips: string | null;
  shoe: string | null;
}

interface OptionGroup {
  id: string;
  productionId: string;
  name: string;
  type: RequirementType;
  order: number;
  columns: OptionColumn[];
  requirements: OptionRequirement[];
  candidates: OptionCandidate[];
}

interface MatrixResponse {
  production: {
    id: string;
    title: string;
    jobCode: string | null;
    clientName: string | null;
    brand: string | null;
  };
  dates: MatrixDate[];
  groups: OptionGroup[];
}

const REQUIREMENT_TYPES: RequirementType[] = ["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"];
const DATE_TYPES: ProductionDateType[] = ["MEETING", "RECCE", "PPM", "FITTING", "SHOOT_DAY", "POST_DELIVERY", "OTHER"];
const DATE_STATUSES: ProductionDateStatus[] = ["PROPOSED", "OPTIONED", "CONFIRMED", "RELEASED", "CANCELLED"];
const HOLD_STATUSES: HoldStatus[] = ["REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "CONFIRMED", "RELEASED", "UNAVAILABLE", "NA"];
const OPTION_COLUMN_TYPES: Array<{ value: OptionColumnType; label: string }> = [
  { value: "SINGLE_LINE_TEXT", label: "Single line text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "CURRENCY", label: "Currency" },
  { value: "PERCENT", label: "Percent" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "SINGLE_SELECT", label: "Single select" },
  { value: "MULTI_SELECT", label: "Multi select" },
  { value: "DATE", label: "Date" },
  { value: "URL", label: "URL" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "ATTACHMENT", label: "Attachment" },
  { value: "BLACKBOOK_LINK", label: "Blackbook link" },
];
const TYPE_TO_BLACKBOOK_CATEGORY: Record<RequirementType, BlackbookCategory> = {
  CREW: "CREW",
  SERVICE: "SERVICE",
  LOCATION: "LOCATION",
  EQUIPMENT: "EQUIPMENT",
  TALENT: "TALENT",
  TRANSPORT: "TRANSPORT",
  POST: "POST",
  OTHER: "OTHER",
};

const PIPELINE_ORDER: HoldStatus[] = ["CONFIRMED", "FIRST_OPTION", "SECOND_OPTION", "REQUESTED", "UNAVAILABLE", "RELEASED", "NA"];
const HOLD_SORT_WEIGHT: Record<HoldStatus, number> = {
  CONFIRMED: 0,
  FIRST_OPTION: 1,
  SECOND_OPTION: 2,
  REQUESTED: 3,
  UNAVAILABLE: 4,
  RELEASED: 5,
  NA: 6,
};
const CANDIDATE_STATE_WEIGHT: Record<CandidateState, number> = {
  ACTIVE: 0,
  PARKED: 1,
  RELEASED: 2,
};

const DECK_FIELD_OPTIONS: Array<{ value: DeckField; label: string }> = [
  { value: "name", label: "Option name" },
  { value: "subtitle", label: "Subtitle" },
  { value: "location", label: "Location" },
  { value: "address", label: "Address" },
  { value: "clientNotes", label: "Deck notes" },
  { value: "internalNotes", label: "Internal notes" },
  { value: "project", label: "Project" },
];

const DECK_BLOCK_PRESETS: Array<{ label: string; block: Omit<DeckTemplateBlock, "id"> }> = [
  { label: "Large title", block: { type: "field", field: "name", label: "Title", x: 2, y: 4, w: 60, h: 8, fontSize: 52, fontWeight: 900, lineHeight: 1, uppercase: true } },
  { label: "Subtitle", block: { type: "field", field: "subtitle", label: "Subtitle", x: 2, y: 12, w: 38, h: 4, fontSize: 18, fontWeight: 500, lineHeight: 1.2, hideIfEmpty: true } },
  { label: "Project tag", block: { type: "field", field: "project", label: "Project", x: 66, y: 5, w: 32, h: 4, fontSize: 16, align: "right", textColor: "#6f6f69" } },
  { label: "Links row", block: { type: "links", label: "Links", x: 2, y: 14, w: 40, h: 4, fontSize: 18, fontWeight: 800, hideIfEmpty: true } },
  { label: "Date status", block: { type: "dateStatus", label: "Date status", x: 68, y: 12, w: 30, h: 14, fontSize: 12, fontWeight: 800, align: "center" } },
  { label: "Image grid 4", block: { type: "imageGrid", label: "Image grid", x: 2, y: 24, w: 96, h: 31, imageCount: 4, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain", imagePosition: "bottom", imageBackground: "#ffffff" } },
  { label: "Image grid 6", block: { type: "imageGrid", label: "Image grid", x: 2, y: 22, w: 96, h: 48, imageCount: 6, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain", imagePosition: "bottom", imageBackground: "#ffffff" } },
  { label: "Justified image row", block: { type: "imageGrid", label: "Justified images", x: 2, y: 28, w: 96, h: 24, imageCount: 10, imagePadding: 10, imageGap: 10, imageLayout: "justify", imageFit: "natural", imagePosition: "bottom", imageBackground: "#ffffff", imageHideEmptySlots: true } },
  { label: "Full bleed image", block: { type: "imageGrid", label: "Full bleed image", x: 0, y: 0, w: 100, h: 100, imageCount: 1, imagePadding: 0, imageGap: 0, imageLayout: "grid", imageFit: "cover", imagePosition: "center", imageHideEmptySlots: true } },
  { label: "Contained hero", block: { type: "imageGrid", label: "Hero image", x: 2, y: 20, w: 62, h: 58, imageCount: 1, imagePadding: 0, imageGap: 0, imageLayout: "grid", imageFit: "contain", imagePosition: "bottom", imageBackground: "#ffffff", imageHideEmptySlots: true } },
  { label: "Map", block: { type: "map", label: "Map", x: 2, y: 58, w: 46, h: 32 } },
  { label: "Notes", block: { type: "notes", field: "clientNotes", label: "Deck notes", x: 50, y: 60, w: 34, h: 16, fontSize: 15, lineHeight: 1.35, textPadding: 0, hideIfEmpty: true } },
  { label: "Footer", block: { type: "footer", label: "Footer", x: 2, y: 94, w: 96, h: 3, fontSize: 12 } },
];

const DECK_EXPORT_WIDTH = 1920;
const DECK_EXPORT_HEIGHT = 1080;
const DECK_EDITOR_SCALE = 2 / 3;
const DECK_EDITOR_WIDTH = DECK_EXPORT_WIDTH * DECK_EDITOR_SCALE;
const DECK_EDITOR_HEIGHT = DECK_EXPORT_HEIGHT * DECK_EDITOR_SCALE;

function baseTalentTemplate(group: OptionGroup): DeckTemplate {
  return {
    id: "editorial-grid",
    name: group.type === "LOCATION" ? "Location editorial" : "Editorial option page",
    blocks: [
      { id: "name", type: "field", field: "name", label: "Name", x: 2, y: 3, w: 74, h: 9, fontSize: 72, fontWeight: 900, uppercase: true },
      { id: "links", type: "links", label: "Links", x: 2, y: 13, w: 36, h: 4, fontSize: 20, fontWeight: 500 },
      { id: "date-status", type: "dateStatus", label: "Date status", x: 82, y: 7, w: 16, h: 15, fontSize: 13, fontWeight: 700, align: "center" },
      { id: "images", type: "imageGrid", label: "Image grid", x: 2, y: 21, w: 76, h: 55, imageCount: 8, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain" },
      { id: "notes", type: "notes", field: "clientNotes", label: "Deck notes", x: 2, y: 80, w: 74, h: 14, fontSize: 18 },
      { id: "footer", type: "footer", label: "Footer", x: 82, y: 88, w: 15, h: 8, fontSize: 15, align: "right" },
    ],
  };
}

function baseLocationTemplate(): DeckTemplate {
  return {
    id: "location-map",
    name: "Location with map",
    blocks: [
      { id: "name", type: "field", field: "name", label: "Location name", x: 2, y: 4, w: 70, h: 8, fontSize: 46, fontWeight: 900, uppercase: true },
      { id: "location", type: "field", field: "location", label: "City / country", x: 80, y: 5, w: 17, h: 4, fontSize: 14, align: "right" },
      { id: "links", type: "links", label: "Links", x: 2, y: 13, w: 36, h: 4, fontSize: 18, fontWeight: 800 },
      { id: "date-status", type: "dateStatus", label: "Date status", x: 2, y: 17, w: 34, h: 5, fontSize: 16, fontWeight: 800 },
      { id: "images", type: "imageGrid", label: "Images", x: 2, y: 24, w: 96, h: 31, imageCount: 4, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain" },
      { id: "map", type: "map", label: "Map", x: 2, y: 57, w: 46, h: 33 },
      { id: "notes", type: "notes", field: "clientNotes", label: "Notes", x: 50, y: 59, w: 34, h: 18, fontSize: 15 },
      { id: "footer", type: "footer", label: "Footer", x: 2, y: 93, w: 96, h: 4, fontSize: 12 },
    ],
  };
}

function defaultDeckTemplate(group: OptionGroup): DeckTemplate {
  return group.type === "LOCATION" ? baseLocationTemplate() : baseTalentTemplate(group);
}

function label(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

function dateLabel(date: MatrixDate): string {
  const formatted = new Date(date.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date.label || label(date.dateType)} ${formatted}`;
}

function compactDateLabel(date: MatrixDate): { top: string; bottom: string } {
  const parsed = new Date(date.date);
  return {
    top: date.label || label(date.dateType),
    bottom: parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  };
}

function needFor(requirement: OptionRequirement, dateId: string): RequirementDateNeed | undefined {
  return requirement.dateNeeds.find((need) => need.dateId === dateId);
}

function statusFor(candidate: OptionCandidate, dateId: string): CandidateDateStatus | undefined {
  return candidate.dateStatuses.find((status) => status.dateId === dateId);
}

function assignmentFor(requirement: OptionRequirement, dateId: string): OptionSlotAssignment | undefined {
  return requirement.assignments.find((assignment) => assignment.dateId === dateId);
}

function candidateById(group: OptionGroup, candidateId: string | null | undefined): OptionCandidate | undefined {
  if (!candidateId) return undefined;
  return group.candidates.find((candidate) => candidate.id === candidateId);
}

function confirmedCandidatesForDate(group: OptionGroup, dateId: string): OptionCandidate[] {
  return group.candidates
    .filter((candidate) => candidate.activeState === "ACTIVE" && statusFor(candidate, dateId)?.status === "CONFIRMED")
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function requiredRequirementsForDate(group: OptionGroup, dateId: string): OptionRequirement[] {
  return group.requirements
    .filter((requirement) => requirement.activeState === "ACTIVE" && Boolean(needFor(requirement, dateId)?.isRequired))
    .sort((a, b) => a.order - b.order || a.slotNumber - b.slotNumber);
}

function displayedCandidateForRequirement(group: OptionGroup, requirement: OptionRequirement, dateId: string): OptionCandidate | undefined {
  const explicit = candidateById(group, assignmentFor(requirement, dateId)?.candidateId);
  if (explicit) return explicit;
  const requirementIndex = requiredRequirementsForDate(group, dateId).findIndex((item) => item.id === requirement.id);
  if (requirementIndex < 0) return undefined;
  return confirmedCandidatesForDate(group, dateId)[requirementIndex];
}

function pipelineFor(group: OptionGroup, requirement: OptionRequirement, dateId: string): PipelineState {
  const need = needFor(requirement, dateId);
  if (!need?.isRequired) return "NOT_REQUIRED";
  if (displayedCandidateForRequirement(group, requirement, dateId)) return "CONFIRMED";
  const statuses = group.candidates
    .filter((candidate) => candidate.activeState === "ACTIVE")
    .map((candidate) => statusFor(candidate, dateId)?.status)
    .filter((status): status is HoldStatus => Boolean(status));
  if (statuses.length === 0) return "NEEDED";
  for (const status of PIPELINE_ORDER) {
    if (statuses.includes(status)) {
      if (status === "NA") return "NEEDED";
      return status;
    }
  }
  return "NEEDED";
}

function pipelineClass(state: PipelineState): string {
  if (state === "CONFIRMED") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (state === "FIRST_OPTION") return "border-lime-300 bg-lime-100 text-lime-800";
  if (state === "SECOND_OPTION") return "border-sky-300 bg-sky-100 text-sky-800";
  if (state === "REQUESTED") return "border-violet-300 bg-violet-100 text-violet-800";
  if (state === "NEEDED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "UNAVAILABLE") return "border-gray-300 bg-gray-100 text-gray-500";
  if (state === "RELEASED") return "border-gray-200 bg-gray-50 text-gray-400";
  return "border-transparent bg-transparent text-gray-300";
}

function holdClass(status: HoldStatus | null): string {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FIRST_OPTION") return "border-lime-200 bg-lime-50 text-lime-700";
  if (status === "SECOND_OPTION") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "REQUESTED") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "UNAVAILABLE") return "border-gray-200 bg-gray-100 text-gray-500";
  if (status === "RELEASED") return "border-gray-200 bg-gray-50 text-gray-400";
  if (status === "NA") return "border-gray-200 bg-white text-gray-300";
  return "border-gray-100 bg-white text-gray-300";
}

function dateStatusClass(status: ProductionDateStatus | null): string {
  if (status === "CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "OPTIONED") return "border-lime-200 bg-lime-50 text-lime-700";
  if (status === "PROPOSED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "RELEASED") return "border-gray-200 bg-gray-50 text-gray-500";
  if (status === "CANCELLED") return "border-red-200 bg-red-50 text-red-600";
  return "border-gray-200 bg-white text-gray-400";
}

function shortPipeline(state: PipelineState): string {
  if (state === "NOT_REQUIRED") return "";
  if (state === "NEEDED") return "Need";
  if (state === "REQUESTED") return "Req";
  if (state === "SECOND_OPTION") return "2nd";
  if (state === "FIRST_OPTION") return "1st";
  if (state === "CONFIRMED") return "Conf";
  if (state === "UNAVAILABLE") return "No";
  return "Rel";
}

function compactHoldLabel(status: string | null, placeholder: string): string {
  if (!status) return placeholder;
  if (status === "REQUESTED") return "Req";
  if (status === "FIRST_OPTION") return "1st";
  if (status === "SECOND_OPTION") return "2nd";
  if (status === "CONFIRMED") return "Conf";
  if (status === "UNAVAILABLE") return "No";
  if (status === "RELEASED") return "Rel";
  if (status === "NA") return "N/A";
  return label(status);
}

function candidateSummary(group: OptionGroup, dateId: string): string {
  const lines = group.candidates
    .filter((candidate) => candidate.activeState === "ACTIVE")
    .map((candidate) => {
      const status = statusFor(candidate, dateId)?.status;
      return status ? `${candidate.name}: ${label(status)}` : `${candidate.name}: no request`;
    });
  return lines.length ? lines.join("\n") : "No candidates yet";
}

function linkCount(candidate: OptionCandidate): number {
  return [candidate.website, candidate.bookUrl, candidate.socialUrl, candidate.modelsComUrl, candidate.pdfUrl].filter(Boolean).length;
}

type AddressLike = Pick<OptionCandidate, "addressLine1" | "addressLine2" | "city" | "region" | "postcode" | "country">;

function addressSummary(address: AddressLike): string {
  return [address.addressLine1, address.city, address.postcode, countryName(address.country)].filter(Boolean).join(", ");
}

function addressDisplayLines(address: AddressLike): string[] {
  const cityLine = [address.city, address.postcode].filter(Boolean).join(", ");
  const regionLine = [address.region, countryName(address.country)].filter(Boolean).join(", ");
  return [address.addressLine1, address.addressLine2, cityLine, regionLine].filter((line): line is string => Boolean(line));
}

function candidateLocation(candidate: OptionCandidate): string {
  return [candidate.city, countryName(candidate.country)].filter(Boolean).join(", ");
}

function candidateCoordinates(candidate: OptionCandidate): { latitude: number; longitude: number } | null {
  const latitude = candidate.latitude ?? candidate.selectedAddress?.latitude;
  const longitude = candidate.longitude ?? candidate.selectedAddress?.longitude;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null;
}

function candidateMapUrl(candidate: OptionCandidate): string | null {
  if (candidate.mapImageUrl) return candidate.mapImageUrl;
  return candidateCoordinates(candidate) ? `/api/options/matrix/candidates/${candidate.id}/map/serve` : null;
}

function candidateFieldValue(candidate: OptionCandidate, field: DeckField, matrix: MatrixResponse): string {
  if (field === "name") return candidate.name;
  if (field === "subtitle") return candidate.subtitle ?? "";
  if (field === "location") return candidateLocation(candidate);
  if (field === "address") return addressDisplayLines(candidate).join("\n");
  if (field === "clientNotes") return candidate.clientNotes ?? "";
  if (field === "internalNotes") return candidate.internalNotes ?? "";
  return [matrix.production.brand, matrix.production.clientName].filter(Boolean).join(" x ") || matrix.production.title;
}

function candidateLinks(candidate: OptionCandidate): Array<{ label: string; href: string }> {
  return [
    candidate.bookUrl ? { label: "Book", href: candidate.bookUrl } : null,
    candidate.socialUrl ? { label: "social", href: candidate.socialUrl } : null,
    candidate.modelsComUrl ? { label: "models.com", href: candidate.modelsComUrl } : null,
    candidate.website ? { label: "website", href: candidate.website } : null,
    candidate.pdfUrl ? { label: "pdf", href: candidate.pdfUrl } : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));
}

function addressTypeLabel(type: BlackbookAddressType): string {
  if (type === "WORK") return "Work";
  if (type === "BILLING") return "Billing";
  if (type === "PERSONAL") return "Personal";
  return "Custom";
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function sortedCandidates(candidates: OptionCandidate[], sortKey: CandidateSortKey, direction: SortDirection): OptionCandidate[] {
  const sorted = candidates.slice();
  const multiplier = direction === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    let result = 0;
    if (sortKey === "manual") result = a.order - b.order;
    else if (sortKey === "name") result = compareText(a.name, b.name);
    else if (sortKey === "notes") result = compareText(a.clientNotes, b.clientNotes);
    else if (sortKey === "links") result = linkCount(a) - linkCount(b);
    else if (sortKey === "rate") result = (a.rate ?? -1) - (b.rate ?? -1);
    else if (sortKey === "state") result = CANDIDATE_STATE_WEIGHT[a.activeState] - CANDIDATE_STATE_WEIGHT[b.activeState];
    else if (sortKey.startsWith("date:")) {
      const dateId = sortKey.slice(5);
      const aStatus = statusFor(a, dateId)?.status;
      const bStatus = statusFor(b, dateId)?.status;
      result = (aStatus ? HOLD_SORT_WEIGHT[aStatus] : 99) - (bStatus ? HOLD_SORT_WEIGHT[bStatus] : 99);
    }
    return result === 0 ? a.order - b.order : result * multiplier;
  });
  return sorted;
}

function PillDropdown<T extends string>({ value, options, onChange, classNameForValue, placeholder = "blank", compact = false }: {
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => Promise<void>;
  classNameForValue: (value: T | null) => string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-7 items-center justify-center gap-1 rounded-md border text-[10px] font-semibold uppercase leading-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.35)] ${compact ? "w-[76px] px-1 text-[9px] tracking-[0.02em]" : "px-2"} ${classNameForValue(value)}`}
      >
        <span className="truncate">{compact ? compactHoldLabel(value, placeholder) : value ? label(value) : placeholder}</span>
        <span className="text-[8px] opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[142px] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              void onChange(null);
            }}
            className="mb-1 flex w-full items-center rounded border border-transparent px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-gray-400 hover:bg-gray-50"
          >
            blank
          </button>
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                setOpen(false);
                void onChange(option);
              }}
              className={`mb-1 flex w-full items-center rounded border px-2 py-1.5 text-left text-[10px] font-semibold uppercase last:mb-0 ${option === value ? classNameForValue(option) : "border-transparent text-gray-600 hover:bg-gray-50"}`}
            >
              {label(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentDropdown({ group, assignedCandidateId, onChange }: {
  group: OptionGroup;
  assignedCandidateId: string | null;
  onChange: (candidateId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const activeCandidates = group.candidates.filter((candidate) => candidate.activeState === "ACTIVE");

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        title="Assign candidate to this slot"
        className="grid h-7 w-5 place-items-center rounded text-[10px] text-gray-400 hover:bg-white hover:text-gray-900"
      >
        ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[190px] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              void onChange(null);
            }}
            className="mb-1 flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] text-gray-400 hover:bg-gray-50"
          >
            Clear assignment
          </button>
          {activeCandidates.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => {
                setOpen(false);
                void onChange(candidate.id);
              }}
              className={`mb-1 flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] last:mb-0 ${candidate.id === assignedCandidateId ? "bg-emerald-50 font-semibold text-emerald-800" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {candidate.name}
            </button>
          ))}
          {activeCandidates.length === 0 && <div className="px-2 py-2 text-[11px] text-gray-400">No active candidates</div>}
        </div>
      )}
    </div>
  );
}

function EditableText({ value, onSave, className = "", placeholder = "" }: { value: string; onSave: (value: string) => Promise<void>; className?: string; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  async function save() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  if (editing) {
    return <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={keyDown} autoFocus className={`w-full border-0 bg-transparent p-0 outline-none ${className}`} />;
  }

  return <button onClick={() => setEditing(true)} className={`w-full truncate text-left ${className}`}>{value || <span className="text-gray-300">{placeholder}</span>}</button>;
}

function NoteCell({ value, onSave, placeholder, tone }: { value: string; onSave: (value: string) => Promise<void>; placeholder: string; tone: "deck" | "internal" | "custom" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function save() {
    if (draft !== value) await onSave(draft);
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => setOpen(true)}
        className={`block max-h-10 w-full overflow-hidden text-left text-[11px] leading-5 ${tone === "deck" ? "text-gray-600" : tone === "custom" ? "text-gray-500" : "italic text-gray-400"}`}
        title={value || placeholder}
      >
        {value ? (
          <span className="line-clamp-2">{value}</span>
        ) : (
          <span className="text-gray-300">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-lg border border-amber-100 bg-[#fffdf3] p-3 shadow-xl">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-700">{tone === "deck" ? "Deck note" : tone === "custom" ? placeholder : "Internal note"}</div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => { save().catch(console.error); }}
            autoFocus
            placeholder={placeholder}
            className="min-h-28 w-full resize-y border-0 bg-transparent text-sm leading-6 text-gray-800 outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setDraft(value); setOpen(false); }} className="rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-white">Cancel</button>
            <button onClick={() => { save().then(() => setOpen(false)).catch(console.error); }} className="rounded bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlackbookLinkControl({ group, candidate, onLink, onOpenBlackbook, mode = "label" }: {
  group: OptionGroup;
  candidate: OptionCandidate;
  onLink: (payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
  mode?: "label" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(candidate.name);
  const [results, setResults] = useState<BlackbookEntry[]>([]);
  const [categories, setCategories] = useState<BlackbookConfigCategory[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const entry = candidate.blackbookEntry;
  const linkedTitle = entry ? [entry.displayName, entry.companyName, entry.email].filter(Boolean).join(" · ") : "Link or create Blackbook entry";
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.get<BlackbookConfigCategory[]>("/api/settings/blackbook/categories")
      .then((items) => {
        setCategories(items);
        setSelectedCategoryId((current) => {
          if (current && items.some((item) => item.id === current)) return current;
          const matching = items.find((item) => item.broadType === TYPE_TO_BLACKBOOK_CATEGORY[group.type]);
          const supplier = items.find((item) => item.broadType === "SERVICE");
          return matching?.id ?? supplier?.id ?? items[0]?.id ?? "";
        });
      })
      .catch(console.error);
  }, [group.type, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        q: query,
        category: TYPE_TO_BLACKBOOK_CATEGORY[group.type],
        limit: "8",
      });
      api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [group.type, open, query]);

  return (
    <div ref={ref} className="relative min-w-0 shrink-0">
      <button
        onClick={() => {
          setOpen((current) => !current);
          setQuery(candidate.name);
        }}
        className={mode === "icon"
          ? `grid h-5 w-5 place-items-center rounded text-[10px] transition ${entry ? "text-gray-600 hover:bg-gray-100 hover:text-gray-950" : "text-gray-300 hover:bg-gray-100 hover:text-gray-600"}`
          : `inline-flex h-5 max-w-[150px] items-center gap-1 rounded px-1.5 text-left text-[10px] transition ${entry ? "border border-transparent bg-transparent font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900" : "border border-transparent bg-transparent text-gray-300 hover:bg-gray-100 hover:text-gray-600"}`}
        title={linkedTitle}
      >
        {entry ? <BookOpen size={10} /> : <Plus size={10} />}
        {mode === "label" && <span className="truncate">{entry ? entry.displayName : "link record"}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-md border border-gray-200 bg-white p-2 shadow-xl">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="Search blackbook..."
            className="mb-2 h-8 w-full rounded border border-gray-200 px-2 text-xs outline-none focus:border-gray-500"
          />
          <div className="max-h-56 overflow-auto">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setOpen(false);
                  void onLink({ entryId: item.id });
                }}
                className="mb-1 block w-full rounded px-2 py-2 text-left text-xs hover:bg-gray-50"
              >
                <div className="font-semibold text-gray-900">{item.displayName}</div>
                <div className="truncate text-[11px] text-gray-400">{[item.companyName, item.website, item.email, item.city, item.country].filter(Boolean).join(" · ") || label(item.entryType)}</div>
              </button>
            ))}
            {!loading && results.length === 0 && <div className="px-2 py-3 text-[11px] text-gray-400">No matches yet.</div>}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
            {entry ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpenBlackbook(entry.id);
                  }}
                  className="text-[11px] text-gray-500 hover:text-gray-900"
                >
                  Open record
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    void onLink({ entryId: null });
                  }}
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Unlink
                </button>
              </div>
            ) : <span />}
            {!entry && (
              <button onClick={() => setCreateOpen((current) => !current)} className="rounded bg-gray-900 px-2 py-1.5 text-[11px] font-medium text-white">
                Create from row
              </button>
            )}
          </div>
          {createOpen && !entry && (
            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Create Blackbook record</div>
              <label className="mb-2 block text-[11px] text-gray-500">
                Category
                <select
                  value={selectedCategoryId}
                  onChange={(event) => {
                    setSelectedCategoryId(event.target.value);
                    setSelectedTypeIds([]);
                  }}
                  className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-[11px] text-gray-800 outline-none focus:border-gray-500"
                >
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              {selectedCategory && selectedCategory.types.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 text-[11px] text-gray-500">Type</div>
                  <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                    {selectedCategory.types.map((type) => {
                      const selected = selectedTypeIds.includes(type.id);
                      return (
                        <button
                          key={type.id}
                          onClick={() => setSelectedTypeIds((current) => selected ? current.filter((id) => id !== type.id) : [...current, type.id])}
                          className={`rounded border px-2 py-1 text-[10px] font-medium ${selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                        >
                          {type.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="mb-2 text-[10px] leading-4 text-gray-400">Defaults to supplier lifecycle. You can edit the full record after creation.</p>
              <button
                onClick={() => {
                  setOpen(false);
                  void onLink({
                    createFromCandidate: true,
                    create: {
                      categoryConfigId: selectedCategoryId || null,
                      category: selectedCategory?.broadType ?? TYPE_TO_BLACKBOOK_CATEGORY[group.type],
                      typeIds: selectedTypeIds,
                      lifecycleStatus: "SUPPLIER",
                    },
                  });
                }}
                className="w-full rounded bg-gray-900 px-2 py-1.5 text-[11px] font-medium text-white"
              >
                Save to Blackbook
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OptionsBoardView({ productionId, onBack, embedded = false }: { productionId: string; onBack: () => void; embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(searchParams.get("optionGroup"));
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);
  const [openBlackbookEntryId, setOpenBlackbookEntryId] = useState<string | null>(null);
  const [exportingGroupId, setExportingGroupId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setMatrix(await api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [productionId]);

  useEffect(() => {
    if (!matrix) return;
    const groupId = searchParams.get("optionGroup");
    if (groupId && matrix.groups.some((group) => group.id === groupId)) {
      setSelectedGroupId(groupId);
    } else if (!groupId) {
      setSelectedGroupId(null);
    }
  }, [matrix, searchParams]);

  function openGroup(groupId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("production", productionId);
    next.set("tab", "options");
    next.set("optionGroup", groupId);
    next.delete("view");
    setSelectedGroupId(groupId);
    setSearchParams(next);
  }

  function closeGroup() {
    const next = new URLSearchParams(searchParams);
    next.set("production", productionId);
    next.set("tab", "options");
    next.delete("optionGroup");
    setSelectedGroupId(null);
    setSearchParams(next);
  }

  function navigateModule(module: "overview" | "dates" | "crew" | "budget" | "pos" | "comms" | "files") {
    const next = new URLSearchParams(searchParams);
    next.set("production", productionId);
    next.delete("optionGroup");
    next.delete("view");
    if (module === "budget") next.set("view", "budget");
    next.set("tab", module === "pos" ? "POs" : module);
    setSearchParams(next);
  }

  async function patchNeed(requirementId: string, dateId: string, isRequired: boolean) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/requirements/${requirementId}/dates/${dateId}`, { isRequired }));
  }

  async function updateRequirement(requirementId: string, patch: Partial<OptionRequirement>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/requirements/${requirementId}`, patch));
  }

  async function duplicateRequirement(requirementId: string) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/requirements/${requirementId}/duplicate`, {}));
  }

  async function deleteRequirement(requirementId: string) {
    if (!window.confirm("Delete this requirement slot? The candidate sheet will remain.")) return;
    setMatrix(await api.delete(`/api/options/matrix/requirements/${requirementId}`).then(() => api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`)));
  }

  async function updateDate(dateId: string, patch: Partial<MatrixDate>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/dates/${dateId}`, patch));
  }

  async function assignSlot(requirementId: string, dateId: string, candidateId: string | null) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/requirements/${requirementId}/dates/${dateId}/assignment`, { candidateId }));
  }

  async function addCandidate(groupId: string) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/groups/${groupId}/candidates`, { name: "New candidate" }));
  }

  async function updateCandidate(candidateId: string, patch: Partial<OptionCandidate>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}`, patch));
  }

  async function linkBlackbook(candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}/link-blackbook`, payload));
  }

  async function deleteCandidate(candidateId: string) {
    if (!window.confirm("Delete this candidate?")) return;
    setMatrix(await api.delete(`/api/options/matrix/candidates/${candidateId}`).then(() => api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`)));
  }

  async function updateCandidateDate(candidateId: string, dateId: string, status: HoldStatus | null) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}/dates/${dateId}`, { status }));
  }

  async function uploadCandidatePhoto(candidateId: string, file: File) {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await fetch(`/api/options/matrix/candidates/${candidateId}/photos`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Photo upload failed");
    }
    setMatrix(await response.json() as MatrixResponse);
  }

  async function uploadCandidatePdf(candidateId: string, file: File) {
    const formData = new FormData();
    formData.append("pdf", file);
    const response = await fetch(`/api/options/matrix/candidates/${candidateId}/pdf`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "PDF upload failed");
    }
    setMatrix(await response.json() as MatrixResponse);
  }

  async function reorderCandidates(groupId: string, orderedIds: string[]) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/groups/${groupId}/candidates/reorder`, { orderedIds }));
  }

  async function createColumn(groupId: string, payload: { label: string; type: OptionColumnType; width?: number }) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/groups/${groupId}/columns`, payload));
  }

  async function updateColumn(columnId: string, patch: Partial<Pick<OptionColumn, "label" | "type" | "width" | "hidden" | "locked" | "order" | "config">>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/columns/${columnId}`, patch));
  }

  async function deleteColumn(columnId: string) {
    if (!window.confirm("Delete this custom field from this options sheet?")) return;
    setMatrix(await api.delete(`/api/options/matrix/columns/${columnId}`).then(() => api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`)));
  }

  async function reorderColumns(groupId: string, orderedIds: string[]) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/groups/${groupId}/columns/reorder`, { orderedIds }));
  }

  async function updateColumnValue(candidateId: string, columnId: string, value: unknown) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}/columns/${columnId}`, { value }));
  }

  async function updateCandidatePhoto(photoId: string, patch: Partial<OptionCandidatePhoto>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/candidate-photos/${photoId}`, patch));
  }

  async function deleteCandidatePhoto(photoId: string) {
    setMatrix(await api.delete(`/api/options/candidate-photos/${photoId}`).then(() => api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`)));
  }

  async function exportGroupPdf(groupId: string) {
    setExportingGroupId(groupId);
    try {
      const response = await fetch(`/api/options/matrix/groups/${groupId}/export-pdf`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? "PDF export failed");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "Options.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingGroupId(null);
    }
  }

  if (loading || !matrix) return <div className="grid h-full place-items-center text-sm text-gray-400">Loading options matrix...</div>;

  const selectedGroup = matrix.groups.find((group) => group.id === selectedGroupId) ?? null;

  const actions = (
    <>
      {!selectedGroup && <button onClick={() => setShowDateForm(true)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50">+ Date</button>}
      {!selectedGroup && <button onClick={() => setShowRoleForm(true)} className="h-9 rounded-md bg-[#0f172a] px-3 text-[13px] font-semibold text-white shadow-sm">+ Role / service</button>}
      {selectedGroup && (
        <button
          onClick={() => exportGroupPdf(selectedGroup.id).catch((err: Error) => window.alert(err.message))}
          disabled={exportingGroupId === selectedGroup.id}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
        >
          <Download size={14} /> {exportingGroupId === selectedGroup.id ? "Generating..." : "Export PDF"}
        </button>
      )}
      {selectedGroup && <button onClick={() => addCandidate(selectedGroup.id)} className="h-9 rounded-md bg-[#0f172a] px-3 text-[13px] font-semibold text-white shadow-sm">+ Candidate</button>}
    </>
  );

  const content = (
    <>
      <OptionsSheetTabs
        groups={matrix.groups}
        selectedGroupId={selectedGroupId}
        onOpenMatrix={closeGroup}
        onOpenGroup={openGroup}
        onAddRole={() => setShowRoleForm(true)}
      />
      <div className="flex min-h-0 flex-1 bg-white">
        <OptionsViewRail selectedGroup={selectedGroup} onAddCandidate={() => selectedGroup ? addCandidate(selectedGroup.id) : setShowRoleForm(true)} />
        <div className="min-w-0 flex-1 overflow-hidden">
          {selectedGroup ? (
            <CandidateSheet
              matrix={matrix}
              group={selectedGroup}
              dates={matrix.dates}
              onUpdateCandidate={updateCandidate}
              onLinkBlackbook={linkBlackbook}
              onOpenBlackbook={setOpenBlackbookEntryId}
              onUpdateCandidateDate={updateCandidateDate}
              onUploadPhoto={uploadCandidatePhoto}
              onUploadPdf={uploadCandidatePdf}
              onReorderCandidates={(orderedIds) => reorderCandidates(selectedGroup.id, orderedIds)}
              onUpdatePhoto={updateCandidatePhoto}
              onDeletePhoto={deleteCandidatePhoto}
              onDeleteCandidate={deleteCandidate}
              onAddCandidate={() => addCandidate(selectedGroup.id)}
              onCreateColumn={(payload) => createColumn(selectedGroup.id, payload)}
              onUpdateColumn={updateColumn}
              onDeleteColumn={deleteColumn}
              onReorderColumns={(orderedIds) => reorderColumns(selectedGroup.id, orderedIds)}
              onUpdateColumnValue={updateColumnValue}
            />
          ) : (
            <MatrixTable
              matrix={matrix}
              onOpenGroup={openGroup}
              onPatchNeed={patchNeed}
              onUpdateRequirement={updateRequirement}
              onDuplicateRequirement={duplicateRequirement}
              onDeleteRequirement={deleteRequirement}
              onUpdateDate={updateDate}
              onAssignSlot={assignSlot}
            />
          )}
        </div>
      </div>
      {showRoleForm && <RoleForm productionId={productionId} onClose={() => setShowRoleForm(false)} onSaved={(data) => { setMatrix(data); setShowRoleForm(false); }} />}
      {showDateForm && <DateForm productionId={productionId} onClose={() => setShowDateForm(false)} onSaved={(data) => { setMatrix(data); setShowDateForm(false); }} />}
      {openBlackbookEntryId && (
        <BlackbookOverlay
          initialEntryId={openBlackbookEntryId}
          compact
          onClose={() => {
            setOpenBlackbookEntryId(null);
            void load();
          }}
        />
      )}
    </>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col bg-white text-[#1f1f1f]">{content}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#1f1f1f]">
      <ProjectWorkspaceHeader
        matrix={matrix}
        activeModule="options"
        onBack={onBack}
        onNavigateModule={navigateModule}
        rightActions={actions}
      />
      {content}
    </div>
  );
}

function ProjectWorkspaceHeader({ matrix, activeModule, onBack, onNavigateModule, rightActions }: {
  matrix: MatrixResponse;
  activeModule: "overview" | "options" | "budget" | "dates" | "crew" | "pos" | "comms" | "files";
  onBack: () => void;
  onNavigateModule: (module: "overview" | "dates" | "crew" | "budget" | "pos" | "comms" | "files") => void;
  rightActions: ReactNode;
}) {
  const projectName = [matrix.production.brand, matrix.production.clientName].filter(Boolean).join(" x ") || matrix.production.title || matrix.production.jobCode || "Project";
  const modules: Array<{ id: "options" | "budget" | "dates" | "crew" | "pos" | "comms" | "files"; label: string; onClick?: () => void }> = [
    { id: "options", label: "Options" },
    { id: "budget", label: "Budget", onClick: () => onNavigateModule("budget") },
    { id: "dates", label: "Dates", onClick: () => onNavigateModule("dates") },
    { id: "crew", label: "Crew List", onClick: () => onNavigateModule("crew") },
    { id: "pos", label: "POs", onClick: () => onNavigateModule("pos") },
    { id: "comms", label: "Comms", onClick: () => onNavigateModule("comms") },
    { id: "files", label: "Files", onClick: () => onNavigateModule("files") },
  ];
  return (
    <div className="shrink-0 border-b border-[#dcdfe3] bg-white">
      <div className="grid h-[54px] grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] items-center gap-4 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="Back to productions">
            <ArrowLeft size={17} />
          </button>
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[#0f8f7f] text-sm font-bold text-white shadow-sm">◆</div>
          <button className="flex min-w-0 items-center gap-1.5 text-left">
            <span className="truncate text-[19px] font-semibold tracking-[-0.01em] text-[#1f1f1f]">{projectName}</span>
            <ChevronDown size={16} className="shrink-0 text-gray-500" />
          </button>
        </div>
        <div className="flex h-full items-center gap-7 text-[14px] font-medium text-gray-600">
          <button className="relative h-full text-[#111827]">
            Data
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#0f8f7f]" />
          </button>
          <button className="h-full hover:text-gray-900">Automations</button>
          <button className="h-full hover:text-gray-900">Interfaces</button>
          <button className="h-full hover:text-gray-900">Forms</button>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <button className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50">Launch</button>
          <button className="h-9 rounded-md border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 shadow-sm hover:bg-gray-50">Share</button>
          {rightActions}
        </div>
      </div>
      <div className="flex h-[38px] items-center justify-between border-t border-[#e7ecef] bg-[#e6fbf7] px-4">
        <div className="flex h-full min-w-0 items-center gap-1 overflow-x-auto">
          {modules.map((module) => (
            <button
              key={module.id}
              onClick={module.onClick}
              className={`flex h-full shrink-0 items-center border-r border-[#c7ebe4] px-3 text-[14px] ${
                activeModule === module.id ? "bg-white font-semibold text-[#111827]" : "font-medium text-gray-600 hover:bg-white/60 hover:text-gray-900"
              }`}
            >
              {module.label}
            </button>
          ))}
        </div>
        <button className="h-8 rounded px-2 text-[13px] font-medium text-gray-600 hover:bg-white/70">Tools <ChevronDown size={14} className="ml-1 inline" /></button>
      </div>
    </div>
  );
}

function OptionsSheetTabs({ groups, selectedGroupId, onOpenMatrix, onOpenGroup, onAddRole }: {
  groups: OptionGroup[];
  selectedGroupId: string | null;
  onOpenMatrix: () => void;
  onOpenGroup: (groupId: string) => void;
  onAddRole: () => void;
}) {
  return (
    <div className="flex h-[40px] shrink-0 items-center border-b border-[#d7ece8] bg-[#e6fbf7]">
      <button
        onClick={onOpenMatrix}
        className={`flex h-full shrink-0 items-center border-r border-[#c7ebe4] px-4 text-[14px] ${
          selectedGroupId === null ? "bg-white font-semibold text-gray-900 shadow-[inset_0_-2px_0_#111827]" : "font-medium text-gray-600 hover:bg-white/60"
        }`}
      >
        Matrix
      </button>
      <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => onOpenGroup(group.id)}
            className={`flex h-full shrink-0 items-center border-r border-[#c7ebe4] px-4 text-[14px] ${
              selectedGroupId === group.id ? "bg-white font-semibold text-gray-900 shadow-[inset_0_-2px_0_#111827]" : "font-medium text-gray-600 hover:bg-white/60 hover:text-gray-900"
            }`}
          >
            {group.name}
          </button>
        ))}
        <button onClick={onAddRole} className="flex h-full w-11 shrink-0 items-center justify-center text-xl text-gray-500 hover:bg-white/60 hover:text-gray-900">+</button>
      </div>
    </div>
  );
}

function OptionsViewRail({ selectedGroup, onAddCandidate }: { selectedGroup: OptionGroup | null; onAddCandidate: () => void }) {
  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-gray-200 bg-[#fbfbfa] lg:flex lg:flex-col">
      <div className="border-b border-gray-200 p-3">
        <button onClick={onAddCandidate} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-gray-700 hover:bg-gray-100">
          <Plus size={18} /> {selectedGroup ? "Create new candidate" : "Create new role/service"}
        </button>
        <button className="mt-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-gray-500 hover:bg-gray-100">
          <Search size={16} /> Find a view
        </button>
      </div>
      <div className="space-y-1 p-3">
        <button className="flex h-9 w-full items-center gap-2 rounded-md bg-[#eeeeec] px-2 text-left text-[14px] font-semibold text-gray-800">
          <span className="grid h-4 w-4 place-items-center rounded border border-blue-400 text-[10px] text-blue-600">▦</span>
          Grid view
        </button>
        <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-gray-600 hover:bg-gray-100">
          <span className="grid h-4 w-4 place-items-center rounded border border-violet-300 text-[10px] text-violet-500">▧</span>
          Gallery
        </button>
      </div>
      <div className="mt-auto border-t border-gray-200 p-4 text-[12px] leading-5 text-gray-500">
        {selectedGroup ? (
          <>
            <div className="mb-2 font-semibold uppercase tracking-[0.05em] text-gray-400">Sheet settings</div>
            <p>Use this space for view settings, page notes, date requirements, and linked budget lines for {selectedGroup.name}.</p>
          </>
        ) : (
          <>
            <div className="mb-2 font-semibold uppercase tracking-[0.05em] text-gray-400">Matrix settings</div>
            <p>The matrix is the master role/date plan. Each role opens its own options sheet.</p>
          </>
        )}
      </div>
    </aside>
  );
}

function MatrixTable({ matrix, onOpenGroup, onPatchNeed, onUpdateRequirement, onDuplicateRequirement, onDeleteRequirement, onUpdateDate, onAssignSlot }: {
  matrix: MatrixResponse;
  onOpenGroup: (groupId: string) => void;
  onPatchNeed: (requirementId: string, dateId: string, isRequired: boolean) => Promise<void>;
  onUpdateRequirement: (requirementId: string, patch: Partial<OptionRequirement>) => Promise<void>;
  onDuplicateRequirement: (requirementId: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string) => Promise<void>;
  onUpdateDate: (dateId: string, patch: Partial<MatrixDate>) => Promise<void>;
  onAssignSlot: (requirementId: string, dateId: string, candidateId: string | null) => Promise<void>;
}) {
  const gridColumns = `260px 132px 76px ${matrix.dates.map(() => "128px").join(" ")}`;

  if (matrix.groups.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Build the end-goal production matrix</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">Add role or service slots like Photographer, Photo Assistant 1, Location, Catering, Transport, or Florist. Dates become columns automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-max">
        <div className="sticky top-0 z-20 grid min-h-9 items-center gap-x-2 border-b border-gray-200 bg-[#f8f8f6] px-3 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: gridColumns }}>
          <div>Requirement</div>
          <div>Type / state</div>
          <div />
          {matrix.dates.map((date) => (
            <div key={date.id} className="flex flex-col items-center gap-1 py-1">
              <span className="text-center">{dateLabel(date)}</span>
              <PillDropdown
                value={date.status}
                options={DATE_STATUSES}
                onChange={(status) => status ? onUpdateDate(date.id, { status }) : Promise.resolve()}
                classNameForValue={dateStatusClass}
              />
            </div>
          ))}
        </div>
        {matrix.groups.flatMap((group) => group.requirements.map((requirement) => (
          <div key={requirement.id} className={`group grid min-h-12 items-center gap-x-2 border-b border-gray-100 px-3 text-xs hover:bg-[#f8f8f6] ${requirement.activeState === "RELEASED" ? "opacity-45" : ""}`} style={{ gridTemplateColumns: gridColumns }}>
            <div className="min-w-0">
              <EditableText value={requirement.displayLabel} onSave={(displayLabel) => onUpdateRequirement(requirement.id, { displayLabel })} className="font-semibold text-gray-900" />
              <button onClick={() => onOpenGroup(group.id)} className="mt-0.5 truncate text-[11px] text-gray-400 hover:text-gray-900">Open {group.name} options {"->"} {group.candidates.length} candidates</button>
            </div>
            <div className="flex items-center gap-1">
              <PillDropdown
                value={requirement.type}
                options={REQUIREMENT_TYPES}
                onChange={(type) => type ? onUpdateRequirement(requirement.id, { type }) : Promise.resolve()}
                classNameForValue={() => "border-gray-200 bg-gray-50 text-gray-600"}
              />
            </div>
            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button onClick={() => onUpdateRequirement(requirement.id, { order: requirement.order - 1 })} title="Move up" className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-white hover:text-gray-900">↑</button>
              <button onClick={() => onUpdateRequirement(requirement.id, { order: requirement.order + 1 })} title="Move down" className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-white hover:text-gray-900">↓</button>
              <button onClick={() => onDuplicateRequirement(requirement.id)} title="Duplicate" className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-white hover:text-gray-900">⧉</button>
              <button onClick={() => onDeleteRequirement(requirement.id)} title="Delete" className="grid h-7 w-7 place-items-center rounded text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
            </div>
            {matrix.dates.map((date) => {
              const need = needFor(requirement, date.id);
              const isRequired = Boolean(need?.isRequired);
              const pipeline = pipelineFor(group, requirement, date.id);
              const assignment = assignmentFor(requirement, date.id);
              const shownCandidate = displayedCandidateForRequirement(group, requirement, date.id);
              return (
                <div
                  key={date.id}
                  className="relative mx-auto flex min-h-8 min-w-[96px] items-center justify-center gap-1"
                >
                  <button
                    title={candidateSummary(group, date.id)}
                    onClick={() => onPatchNeed(requirement.id, date.id, !isRequired)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      onOpenGroup(group.id);
                    }}
                    className={`inline-flex min-h-8 min-w-[82px] items-center justify-center rounded border px-2 text-[11px] font-semibold ${pipelineClass(pipeline)}`}
                  >
                    {isRequired ? shownCandidate?.name ?? shortPipeline(pipeline) : ""}
                  </button>
                  {isRequired && (
                    <AssignmentDropdown
                      group={group}
                      assignedCandidateId={assignment?.candidateId ?? null}
                      onChange={(candidateId) => onAssignSlot(requirement.id, date.id, candidateId)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )))}
      </div>
    </div>
  );
}

function CandidateSheet({ matrix, group, dates, onUpdateCandidate, onLinkBlackbook, onOpenBlackbook, onUpdateCandidateDate, onUploadPhoto, onUploadPdf, onReorderCandidates, onUpdatePhoto, onDeletePhoto, onDeleteCandidate, onAddCandidate, onCreateColumn, onUpdateColumn, onDeleteColumn, onReorderColumns, onUpdateColumnValue }: {
  matrix: MatrixResponse;
  group: OptionGroup;
  dates: MatrixDate[];
  onUpdateCandidate: (candidateId: string, patch: Partial<OptionCandidate>) => Promise<void>;
  onLinkBlackbook: (candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
  onUpdateCandidateDate: (candidateId: string, dateId: string, status: HoldStatus | null) => Promise<void>;
  onUploadPhoto: (candidateId: string, file: File) => Promise<void>;
  onUploadPdf: (candidateId: string, file: File) => Promise<void>;
  onReorderCandidates: (orderedIds: string[]) => Promise<void>;
  onUpdatePhoto: (photoId: string, patch: Partial<OptionCandidatePhoto>) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onDeleteCandidate: (candidateId: string) => Promise<void>;
  onAddCandidate: () => Promise<void>;
  onCreateColumn: (payload: { label: string; type: OptionColumnType; width?: number }) => Promise<void>;
  onUpdateColumn: (columnId: string, patch: Partial<Pick<OptionColumn, "label" | "type" | "width" | "hidden" | "locked" | "order" | "config">>) => Promise<void>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onReorderColumns: (orderedIds: string[]) => Promise<void>;
  onUpdateColumnValue: (candidateId: string, columnId: string, value: unknown) => Promise<void>;
}) {
  const [photoCandidate, setPhotoCandidate] = useState<OptionCandidate | null>(null);
  const [sortKey, setSortKey] = useState<CandidateSortKey>("manual");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [dragCandidateId, setDragCandidateId] = useState<string | null>(null);
  const [dropCandidateId, setDropCandidateId] = useState<string | null>(null);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<OptionColumnType>("SINGLE_LINE_TEXT");
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [fieldManagerOpen, setFieldManagerOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const activePhotoCandidate = photoCandidate ? group.candidates.find((candidate) => candidate.id === photoCandidate.id) ?? photoCandidate : null;
  const visibleColumns = group.columns.filter((column) => !column.hidden).sort((a, b) => a.order - b.order);
  const gridColumns = `${visibleColumns.flatMap((column) => column.key === "date_statuses" ? dates.map(() => `${column.width}px`) : [`${column.width}px`]).join(" ")} 34px`;
  const candidates = sortedCandidates(group.candidates, sortKey, sortDirection);
  const minimumSheetWidth = 34 + visibleColumns.reduce((sum, column) => sum + (column.key === "date_statuses" ? Math.max(1, dates.length) * column.width : column.width), 0);

  function setSort(nextKey: CandidateSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  }

  async function dropCandidate(targetCandidateId: string) {
    if (!dragCandidateId || dragCandidateId === targetCandidateId) return;
    const source = candidates.findIndex((candidate) => candidate.id === dragCandidateId);
    const target = candidates.findIndex((candidate) => candidate.id === targetCandidateId);
    if (source < 0 || target < 0) return;
    const next = candidates.slice();
    const [candidate] = next.splice(source, 1);
    next.splice(target, 0, candidate);
    await onReorderCandidates(next.map((item) => item.id));
    setSortKey("manual");
    setSortDirection("asc");
    setDragCandidateId(null);
    setDropCandidateId(null);
  }

  async function createField() {
    const label = fieldLabel.trim();
    if (!label) return;
    await onCreateColumn({ label, type: fieldType, width: fieldType === "LONG_TEXT" ? 220 : 150 });
    setFieldLabel("");
    setFieldType("SINGLE_LINE_TEXT");
    setFieldFormOpen(false);
  }

  async function dropColumn(targetColumnId: string) {
    if (!dragColumnId || dragColumnId === targetColumnId) return;
    const source = visibleColumns.findIndex((column) => column.id === dragColumnId);
    const target = visibleColumns.findIndex((column) => column.id === targetColumnId);
    if (source < 0 || target < 0) return;
    const next = visibleColumns.slice();
    const [column] = next.splice(source, 1);
    next.splice(target, 0, column);
    await onReorderColumns(next.map((item) => item.id));
    setDragColumnId(null);
    setDropColumnId(null);
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-800">Grid view</span>
          <span className="text-gray-300">·</span>
          <span>Core Blackbook fields stay synced. Custom fields live on this sheet.</span>
        </div>
        <div className="relative flex items-center gap-2">
          <button onClick={() => setFieldManagerOpen((open) => !open)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Hide fields
          </button>
          <button onClick={() => setFieldFormOpen((open) => !open)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
            + Field
          </button>
          <button onClick={() => setDesignerOpen(true)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Design PDF
          </button>
          {fieldFormOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-[330px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">New custom field</div>
              <input
                value={fieldLabel}
                onChange={(event) => setFieldLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createField().catch((err: Error) => window.alert(err.message));
                  if (event.key === "Escape") setFieldFormOpen(false);
                }}
                autoFocus
                placeholder="Field name"
                className="mb-2 w-full rounded-md border border-gray-200 px-2 py-2 text-sm outline-none focus:border-gray-400"
              />
              <select
                value={fieldType}
                onChange={(event) => setFieldType(event.target.value as OptionColumnType)}
                className="mb-3 w-full rounded-md border border-gray-200 px-2 py-2 text-xs outline-none focus:border-gray-400"
              >
                {OPTION_COLUMN_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <button onClick={() => setFieldFormOpen(false)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
                <button onClick={() => { void createField().catch((err: Error) => window.alert(err.message)); }} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white">Add field</button>
              </div>
            </div>
          )}
          {fieldManagerOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-[340px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Fields</div>
                <div className="text-[10px] text-gray-400">Core + custom</div>
              </div>
              <div className="max-h-[360px] overflow-auto pr-1">
                {group.columns.slice().sort((a, b) => a.order - b.order).map((column) => (
                  <label key={column.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={!column.hidden}
                      onChange={(event) => { void onUpdateColumn(column.id, { hidden: !event.target.checked }); }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                    />
                    <span className="min-w-0 flex-1 truncate">{column.label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${column.locked ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-blue-600"}`}>
                      {column.locked ? "Blackbook/core" : "Custom"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="inline-block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" style={{ minWidth: minimumSheetWidth }}>
        <div className="sticky top-0 z-20 grid h-8 items-center gap-x-2 border-b border-gray-200 bg-[#f8f8f6] px-2 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: gridColumns }}>
          {visibleColumns.flatMap((column) => {
            const shared = {
              isDropTarget: dropColumnId === column.id && dragColumnId !== column.id,
              onUpdate: onUpdateColumn,
              onDelete: onDeleteColumn,
              onDragStart: () => {
                setDragColumnId(column.id);
                setDropColumnId(null);
              },
              onDragOver: () => {
                if (dragColumnId && dragColumnId !== column.id) setDropColumnId(column.id);
              },
              onDrop: () => { void dropColumn(column.id).catch((err: Error) => window.alert(err.message)); },
              onDragEnd: () => {
                setDragColumnId(null);
                setDropColumnId(null);
              },
            };
            if (column.key === "date_statuses") {
              return dates.map((date, index) => (
                <DateStatusColumnHeader
                  key={`${column.id}:${date.id}`}
                  column={column}
                  date={date}
                  showControls={index === 0}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={() => setSort(`date:${date.id}`)}
                  {...shared}
                />
              ));
            }
            return (
              <CustomColumnHeader
                key={column.id}
                column={column}
                sortKey={column.key === "image" ? "manual" : column.key === "option" ? "name" : column.key === "clientNotes" ? "notes" : column.key === "links" ? "links" : column.key === "rate" ? "rate" : column.key === "activeState" ? "state" : undefined}
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={setSort}
                {...shared}
              />
            );
          })}
          <div />
        </div>
        {candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            group={group}
            dates={dates}
            customColumns={visibleColumns}
            gridColumns={gridColumns}
            onOpenPhotos={() => setPhotoCandidate(candidate)}
            onUpdateCandidate={onUpdateCandidate}
            onLinkBlackbook={onLinkBlackbook}
            onOpenBlackbook={onOpenBlackbook}
            onUpdateCandidateDate={onUpdateCandidateDate}
            onUpdateColumnValue={onUpdateColumnValue}
            onUploadPhoto={onUploadPhoto}
            onUploadPdf={onUploadPdf}
            isReorderDragging={dragCandidateId === candidate.id}
            isReorderTarget={dropCandidateId === candidate.id && dragCandidateId !== candidate.id}
            onReorderDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", candidate.id);
              setDragCandidateId(candidate.id);
              setDropCandidateId(null);
            }}
            onReorderDragOver={() => {
              if (dragCandidateId && dragCandidateId !== candidate.id) setDropCandidateId(candidate.id);
            }}
            onReorderDrop={() => dropCandidate(candidate.id).catch((err: Error) => window.alert(err.message))}
            onReorderDragEnd={() => {
              setDragCandidateId(null);
              setDropCandidateId(null);
            }}
            onDeleteCandidate={onDeleteCandidate}
          />
        ))}
        {group.candidates.length === 0 && (
          <div className="grid h-28 place-items-center text-center text-sm text-gray-500">
            <div>No candidates on option for {group.name} yet.<br /><button onClick={onAddCandidate} className="mt-2 text-gray-900 underline">+ Add candidate</button></div>
          </div>
        )}
        <button onClick={onAddCandidate} className="m-3 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-900">
          <Plus size={14} className="mr-1 inline" /> Add candidate
        </button>
      </div>
      {activePhotoCandidate && (
        <PhotoManager
          candidate={activePhotoCandidate}
          onClose={() => setPhotoCandidate(null)}
          onUpload={onUploadPhoto}
          onUpdate={onUpdatePhoto}
          onDelete={onDeletePhoto}
        />
      )}
      {designerOpen && (
        <DeckDesigner
          matrix={matrix}
          group={group}
          dates={dates}
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </div>
  );
}

function DeckDesigner({ matrix, group, dates, onClose }: {
  matrix: MatrixResponse;
  group: OptionGroup;
  dates: MatrixDate[];
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<DeckTemplate>(() => defaultDeckTemplate(group));
  const [previewCandidateId, setPreviewCandidateId] = useState(group.candidates[0]?.id ?? "");
  const [selectedBlockId, setSelectedBlockId] = useState(template.blocks[0]?.id ?? "");
  const [drag, setDrag] = useState<DeckDragState | null>(null);
  const [viewMode, setViewMode] = useState<"edit" | "final">("edit");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [finalPreviewKey, setFinalPreviewKey] = useState(0);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const previewCandidate = group.candidates.find((candidate) => candidate.id === previewCandidateId) ?? group.candidates[0] ?? null;
  const selectedBlock = template.blocks.find((block) => block.id === selectedBlockId) ?? null;

  useEffect(() => {
    let active = true;
    setLoadingTemplate(true);
    api.get<{ id: string; name: string; blocks: DeckTemplateBlock[] } | null>(`/api/options/matrix/groups/${group.id}/deck-template`)
      .then((saved) => {
        if (!active || !saved?.blocks?.length) return;
        setTemplate({ id: saved.id, name: saved.name, blocks: saved.blocks });
        setSelectedBlockId(saved.blocks[0]?.id ?? "");
        setSavedAt("Loaded saved template");
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoadingTemplate(false);
      });
    return () => { active = false; };
  }, [group.id]);

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;
    function move(event: MouseEvent) {
      const dx = ((event.clientX - activeDrag.startX) / DECK_EDITOR_WIDTH) * 100;
      const dy = ((event.clientY - activeDrag.startY) / DECK_EDITOR_HEIGHT) * 100;
      const snap = snapEnabled && !event.altKey;
      if (activeDrag.kind === "move") {
        updateBlock(activeDrag.blockId, {
          x: constrainDeckValue(activeDrag.origin.x + dx, 0, 100 - activeDrag.origin.w, snap),
          y: constrainDeckValue(activeDrag.origin.y + dy, 0, 100 - activeDrag.origin.h, snap),
        });
        return;
      }
      const next = resizeDeckRect(activeDrag, dx, dy, snap);
      updateBlock(activeDrag.blockId, next);
    }
    function up() {
      setDrag(null);
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [drag]);

  useEffect(() => {
    function keyDown(event: globalThis.KeyboardEvent) {
      if (viewMode !== "edit" || !selectedBlock) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      if (selectedBlock.locked) return;
      const step = event.shiftKey ? 2.5 : snapEnabled && !event.altKey ? DECK_SNAP_PERCENT : 0.25;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      updateBlock(selectedBlock.id, {
        x: constrainDeckValue(selectedBlock.x + dx, 0, 100 - selectedBlock.w, snapEnabled && !event.altKey),
        y: constrainDeckValue(selectedBlock.y + dy, 0, 100 - selectedBlock.h, snapEnabled && !event.altKey),
      });
    }
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [selectedBlock, snapEnabled, viewMode]);

  function updateBlock(blockId: string, patch: Partial<DeckTemplateBlock>) {
    setTemplate((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
  }

  function addPreset(preset: Omit<DeckTemplateBlock, "id">) {
    const id = `${preset.type}-${Date.now()}`;
    const block: DeckTemplateBlock = { id, ...preset };
    setTemplate((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setSelectedBlockId(id);
  }

  function duplicateBlock(block: DeckTemplateBlock) {
    const id = `${block.type}-${Date.now()}`;
    const duplicate: DeckTemplateBlock = {
      ...block,
      id,
      label: `${block.label} copy`,
      x: constrainDeckValue(block.x + 2, 0, 100 - block.w, false),
      y: constrainDeckValue(block.y + 2, 0, 100 - block.h, false),
      hidden: false,
      locked: false,
    };
    setTemplate((current) => ({ ...current, blocks: [...current.blocks, duplicate] }));
    setSelectedBlockId(id);
  }

  function moveBlockLayer(blockId: string, direction: "back" | "forward") {
    setTemplate((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);
      if (index < 0) return current;
      const nextIndex = direction === "forward" ? Math.min(current.blocks.length - 1, index + 1) : Math.max(0, index - 1);
      if (nextIndex === index) return current;
      const blocks = current.blocks.slice();
      const [block] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, block);
      return { ...current, blocks };
    });
  }

  function resetTemplate(next: "editorial" | "location") {
    const value = next === "location" ? baseLocationTemplate() : baseTalentTemplate(group);
    setTemplate(value);
    setSelectedBlockId(value.blocks[0]?.id ?? "");
    setSavedAt(null);
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    try {
      const saved = await api.patch<{ id: string; name: string; blocks: DeckTemplateBlock[] }>(`/api/options/matrix/groups/${group.id}/deck-template`, {
        name: template.name,
        blocks: template.blocks,
      });
      setTemplate({ id: saved.id, name: saved.name, blocks: saved.blocks });
      setSavedAt("Saved for PDF export");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function showFinalPreview() {
    await saveTemplate();
    setFinalPreviewKey((current) => current + 1);
    setViewMode("final");
  }

  async function previewExport() {
    const previewWindow = window.open("about:blank", "_blank");
    try {
      await saveTemplate();
      if (previewWindow) {
        previewWindow.location.href = `/api/options/matrix/groups/${group.id}/export-preview-html`;
      } else {
        window.open(`/api/options/matrix/groups/${group.id}/export-preview-html`, "_blank");
      }
    } catch (error) {
      previewWindow?.close();
      throw error;
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[#ececea]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 items-center justify-between border-b border-gray-300 bg-white px-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">PDF layout designer</h3>
            <p className="text-[11px] text-gray-400">{group.name} · {loadingTemplate ? "loading saved template..." : savedAt ?? "unsaved changes stay in preview until saved"}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-1 flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
              <button onClick={() => setViewMode("edit")} className={`rounded px-2 py-1 text-xs ${viewMode === "edit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>Edit</button>
              <button onClick={() => showFinalPreview().catch((err: Error) => window.alert(err.message))} disabled={savingTemplate} className={`rounded px-2 py-1 text-xs ${viewMode === "final" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"} disabled:opacity-50`}>Final</button>
            </div>
            <select value={previewCandidate?.id ?? ""} onChange={(event) => setPreviewCandidateId(event.target.value)} className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs">
              {group.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <label className="flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-500">
              <input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} className="h-3 w-3" />
              Snap
            </label>
            <button onClick={() => resetTemplate("editorial")} className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Editorial base</button>
            <button onClick={() => resetTemplate("location")} className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Location base</button>
            <button onClick={() => previewExport().catch((err: Error) => window.alert(err.message))} disabled={savingTemplate} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Preview export</button>
            <button onClick={() => saveTemplate().catch((err: Error) => window.alert(err.message))} disabled={savingTemplate} className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{savingTemplate ? "Saving..." : "Save for export"}</button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><X size={15} /></button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr_260px]">
          <aside className="border-r border-gray-300 bg-white p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">Blocks</div>
            <div className="grid gap-1">
              {DECK_BLOCK_PRESETS.map((preset) => (
                <button key={preset.label} onClick={() => addPreset(preset.block)} className="rounded-md border border-gray-200 px-2 py-2 text-left text-xs text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                  + {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">Layer stack</div>
            <div className="mt-2 max-h-[50vh] overflow-auto">
              {template.blocks.map((block) => (
                <button key={block.id} onClick={() => setSelectedBlockId(block.id)} className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-[11px] ${selectedBlockId === block.id ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  <span className={block.hidden ? "opacity-40" : ""}>{block.locked ? "🔒 " : ""}{block.hidden ? "Hidden · " : ""}{block.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 overflow-auto p-6">
            <div
              className="mx-auto overflow-hidden bg-white shadow-2xl"
              style={{ width: DECK_EDITOR_WIDTH, height: DECK_EDITOR_HEIGHT }}
            >
              {viewMode === "final" ? (
                <DeckFinalPreview groupId={group.id} previewKey={finalPreviewKey} />
              ) : previewCandidate ? (
                <DeckPagePreview
                  matrix={matrix}
                  group={group}
                  dates={dates}
                  candidate={previewCandidate}
                  template={template}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  onDragStart={(block, event) => {
                    setSelectedBlockId(block.id);
                    if (block.locked) return;
                    setDrag({
                      kind: "move",
                      blockId: block.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: deckRectFromBlock(block),
                    });
                  }}
                  onResizeStart={(block, handle, event) => {
                    setSelectedBlockId(block.id);
                    if (block.locked) return;
                    setDrag({
                      kind: "resize",
                      blockId: block.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      origin: deckRectFromBlock(block),
                    });
                  }}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-gray-400">Add a candidate to preview this template.</div>
              )}
            </div>
          </main>

          <aside className="overflow-auto border-l border-gray-300 bg-white p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">Selected block</div>
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                onChange={(patch) => updateBlock(selectedBlock.id, patch)}
                onDuplicate={() => duplicateBlock(selectedBlock)}
                onLayer={(direction) => moveBlockLayer(selectedBlock.id, direction)}
                onToggleLock={() => updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })}
                onToggleHidden={() => updateBlock(selectedBlock.id, { hidden: !selectedBlock.hidden })}
                onDelete={() => {
                  setTemplate((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== selectedBlock.id) }));
                  setSelectedBlockId(template.blocks.find((block) => block.id !== selectedBlock.id)?.id ?? "");
                }}
              />
            ) : <div className="text-xs text-gray-400">Select a red placement box.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}

type DeckResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type DeckRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type DeckDragState =
  | { kind: "move"; blockId: string; startX: number; startY: number; origin: DeckRect }
  | { kind: "resize"; blockId: string; handle: DeckResizeHandle; startX: number; startY: number; origin: DeckRect };

const DECK_SNAP_PERCENT = 1.25;

function snapDeckValue(value: number): number {
  return Math.round(value / DECK_SNAP_PERCENT) * DECK_SNAP_PERCENT;
}

function constrainDeckValue(value: number, min: number, max: number, snap: boolean): number {
  const next = snap ? snapDeckValue(value) : value;
  return Math.max(min, Math.min(max, Math.round(next * 10) / 10));
}

function deckRectFromBlock(block: DeckTemplateBlock): DeckRect {
  return { x: block.x, y: block.y, w: block.w, h: block.h };
}

function resizeDeckRect(drag: Extract<DeckDragState, { kind: "resize" }>, dx: number, dy: number, snap: boolean): Partial<DeckTemplateBlock> {
  const minW = 2;
  const minH = 2;
  let { x, y, w, h } = drag.origin;
  if (drag.handle.includes("e")) w = drag.origin.w + dx;
  if (drag.handle.includes("s")) h = drag.origin.h + dy;
  if (drag.handle.includes("w")) {
    x = drag.origin.x + dx;
    w = drag.origin.w - dx;
  }
  if (drag.handle.includes("n")) {
    y = drag.origin.y + dy;
    h = drag.origin.h - dy;
  }

  x = constrainDeckValue(x, 0, 100 - minW, snap);
  y = constrainDeckValue(y, 0, 100 - minH, snap);
  w = constrainDeckValue(w, minW, 100 - x, snap);
  h = constrainDeckValue(h, minH, 100 - y, snap);
  return { x, y, w, h };
}

function BlockInspector({ block, onChange, onDuplicate, onLayer, onToggleLock, onToggleHidden, onDelete }: {
  block: DeckTemplateBlock;
  onChange: (patch: Partial<DeckTemplateBlock>) => void;
  onDuplicate: () => void;
  onLayer: (direction: "back" | "forward") => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-1">
        <button onClick={onDuplicate} className="rounded-md border border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50">Duplicate</button>
        <button onClick={onToggleLock} className="rounded-md border border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50">{block.locked ? "Unlock" : "Lock"}</button>
        <button onClick={() => onLayer("back")} className="rounded-md border border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50">Send back</button>
        <button onClick={() => onLayer("forward")} className="rounded-md border border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50">Bring front</button>
        <button onClick={onToggleHidden} className="col-span-2 rounded-md border border-gray-200 px-2 py-1.5 text-gray-600 hover:bg-gray-50">{block.hidden ? "Show in export" : "Hide from export"}</button>
      </div>
      <label className="block text-gray-500">Label<input value={block.label} onChange={(event) => onChange({ label: event.target.value })} className="mt-1 h-8 w-full rounded border border-gray-200 px-2 text-gray-900" /></label>
      {(block.type === "field" || block.type === "notes") && (
        <label className="block text-gray-500">Field
          <select value={block.field ?? "clientNotes"} onChange={(event) => onChange({ field: event.target.value as DeckField })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
            {DECK_FIELD_OPTIONS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberSetting label="X" value={block.x} onChange={(x) => onChange({ x })} />
        <NumberSetting label="Y" value={block.y} onChange={(y) => onChange({ y })} />
        <NumberSetting label="W" value={block.w} onChange={(w) => onChange({ w })} />
        <NumberSetting label="H" value={block.h} onChange={(h) => onChange({ h })} />
      </div>
      {block.type !== "imageGrid" && block.type !== "map" && (
        <div className="space-y-2 rounded-md border border-gray-100 bg-gray-50 p-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberSetting label="Font" value={block.fontSize ?? 14} onChange={(fontSize) => onChange({ fontSize })} />
            <NumberSetting label="Weight" value={block.fontWeight ?? 400} onChange={(fontWeight) => onChange({ fontWeight })} />
            <NumberSetting label="Line height" value={block.lineHeight ?? 1.2} step={0.05} onChange={(lineHeight) => onChange({ lineHeight })} />
            <NumberSetting label="Letter space" value={block.letterSpacing ?? 0} step={0.1} onChange={(letterSpacing) => onChange({ letterSpacing })} />
            <NumberSetting label="Padding" value={block.textPadding ?? 0} onChange={(textPadding) => onChange({ textPadding })} />
            <NumberSetting label="Max lines" value={block.textMaxLines ?? 0} onChange={(textMaxLines) => onChange({ textMaxLines: textMaxLines > 0 ? textMaxLines : undefined })} />
          </div>
          <label className="block text-gray-500">Text colour
            <input type="color" value={block.textColor ?? "#1a1a1f"} onChange={(event) => onChange({ textColor: event.target.value })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-1" />
          </label>
          <label className="block text-gray-500">Vertical align
            <select value={block.verticalAlign ?? "top"} onChange={(event) => onChange({ verticalAlign: event.target.value as DeckVerticalAlign })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
        </div>
      )}
      {block.type === "imageGrid" && (
        <div className="space-y-2 rounded-md border border-gray-100 bg-gray-50 p-2">
          <NumberSetting label="Image count" value={block.imageCount ?? 4} onChange={(imageCount) => onChange({ imageCount })} />
          <NumberSetting label="Outer padding" value={block.imagePadding ?? 8} onChange={(imagePadding) => onChange({ imagePadding })} />
          <NumberSetting label="Gap" value={block.imageGap ?? block.imagePadding ?? 8} onChange={(imageGap) => onChange({ imageGap })} />
          <label className="block text-gray-500">Layout
            <select value={block.imageLayout ?? "grid"} onChange={(event) => onChange({ imageLayout: event.target.value as DeckImageLayout })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
              <option value="grid">Tiled boxes</option>
              <option value="justify">Justified row</option>
            </select>
          </label>
          <label className="block text-gray-500">Fit
            <select value={block.imageFit ?? (block.imageLayout === "justify" ? "natural" : "contain")} onChange={(event) => onChange({ imageFit: event.target.value as DeckImageFit })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="natural">Natural height</option>
            </select>
          </label>
          <label className="block text-gray-500">Position
            <select value={block.imagePosition ?? "bottom"} onChange={(event) => onChange({ imagePosition: event.target.value as DeckImagePosition })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberSetting label="Radius" value={block.imageRadius ?? 0} onChange={(imageRadius) => onChange({ imageRadius })} />
            <label className="block text-gray-500">Background
              <input type="color" value={block.imageBackground ?? "#ffffff"} onChange={(event) => onChange({ imageBackground: event.target.value })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-1" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-gray-500"><input type="checkbox" checked={Boolean(block.imageBorder)} onChange={(event) => onChange({ imageBorder: event.target.checked })} /> Image cell border</label>
          <label className="flex items-center gap-2 text-gray-500"><input type="checkbox" checked={Boolean(block.imageAllowRows)} onChange={(event) => onChange({ imageAllowRows: event.target.checked })} /> Allow multiple rows</label>
          <label className="flex items-center gap-2 text-gray-500"><input type="checkbox" checked={Boolean(block.imageHideEmptySlots)} onChange={(event) => onChange({ imageHideEmptySlots: event.target.checked })} /> Hide empty slots</label>
        </div>
      )}
      <label className="flex items-center gap-2 text-gray-500"><input type="checkbox" checked={Boolean(block.uppercase)} onChange={(event) => onChange({ uppercase: event.target.checked })} /> Uppercase</label>
      <label className="flex items-center gap-2 text-gray-500"><input type="checkbox" checked={Boolean(block.hideIfEmpty)} onChange={(event) => onChange({ hideIfEmpty: event.target.checked })} /> Hide if empty</label>
      <label className="block text-gray-500">Align
        <select value={block.align ?? "left"} onChange={(event) => onChange({ align: event.target.value as DeckTemplateBlock["align"] })} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-gray-900">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <button onClick={onDelete} className="w-full rounded-md border border-red-100 px-2 py-2 text-red-600 hover:bg-red-50">Delete block</button>
    </div>
  );
}

function NumberSetting({ label: labelText, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="block text-gray-500">{labelText}
      <input type="number" step={step} value={Math.round(value * 100) / 100} onChange={(event) => onChange(Number(event.target.value) || 0)} className="mt-1 h-8 w-full rounded border border-gray-200 px-2 text-gray-900" />
    </label>
  );
}

function DeckPagePreview({ matrix, group, dates, candidate, template, selectedBlockId, onSelectBlock, onDragStart, onResizeStart }: {
  matrix: MatrixResponse;
  group: OptionGroup;
  dates: MatrixDate[];
  candidate: OptionCandidate;
  template: DeckTemplate;
  selectedBlockId: string;
  onSelectBlock: (id: string) => void;
  onDragStart: (block: DeckTemplateBlock, event: React.MouseEvent<HTMLDivElement>) => void;
  onResizeStart: (block: DeckTemplateBlock, handle: DeckResizeHandle, event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{
        width: DECK_EXPORT_WIDTH,
        height: DECK_EXPORT_HEIGHT,
        transform: `scale(${DECK_EDITOR_SCALE})`,
        transformOrigin: "top left",
        backgroundImage: "linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {template.blocks.map((block) => (
        <div
          key={block.id}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).dataset.resizeHandle) return;
            if (block.locked) return;
            onDragStart(block, event);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectBlock(block.id);
          }}
          className={`absolute overflow-hidden border-2 border-dotted ${block.locked ? "cursor-default border-gray-400" : "cursor-move border-red-500"} ${block.hidden ? "opacity-30" : ""} ${selectedBlockId === block.id ? "bg-red-50/20 ring-2 ring-red-500/30" : ""}`}
          style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.w}%`, height: `${block.h}%` }}
        >
          <DeckBlockContent matrix={matrix} group={group} dates={dates} candidate={candidate} block={block} />
          {block.hidden && <div className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-500">Hidden</div>}
          {selectedBlockId === block.id && !block.locked && (
            <DeckResizeHandles block={block} onResizeStart={onResizeStart} />
          )}
        </div>
      ))}
    </div>
  );
}

function DeckResizeHandles({ block, onResizeStart }: { block: DeckTemplateBlock; onResizeStart: (block: DeckTemplateBlock, handle: DeckResizeHandle, event: React.MouseEvent<HTMLDivElement>) => void }) {
  const handles: Array<{ id: DeckResizeHandle; className: string; cursor: string }> = [
    { id: "nw", className: "left-0 top-0", cursor: "nwse-resize" },
    { id: "n", className: "left-1/2 top-0 -translate-x-1/2", cursor: "ns-resize" },
    { id: "ne", className: "right-0 top-0", cursor: "nesw-resize" },
    { id: "e", className: "right-0 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
    { id: "se", className: "bottom-0 right-0", cursor: "nwse-resize" },
    { id: "s", className: "bottom-0 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
    { id: "sw", className: "bottom-0 left-0", cursor: "nesw-resize" },
    { id: "w", className: "left-0 top-1/2 -translate-y-1/2", cursor: "ew-resize" },
  ];
  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle.id}
          data-resize-handle={handle.id}
          onMouseDown={(event) => {
            event.stopPropagation();
            onResizeStart(block, handle.id, event);
          }}
          className={`absolute z-10 h-3 w-3 rounded-full border border-red-500 bg-white shadow ${handle.className}`}
          style={{ cursor: handle.cursor }}
        />
      ))}
    </>
  );
}

function DeckFinalPreview({ groupId, previewKey }: { groupId: string; previewKey: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <iframe
        key={previewKey}
        title="Final PDF preview"
        src={`/api/options/matrix/groups/${groupId}/export-preview-html?preview=${previewKey}`}
        className="origin-top-left border-0"
        style={{ width: DECK_EXPORT_WIDTH, height: DECK_EXPORT_HEIGHT, transform: `scale(${DECK_EDITOR_SCALE})` }}
      />
      <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-white/90 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.06em] text-gray-500 shadow-sm">
        Final export HTML
      </div>
    </div>
  );
}

function DeckBlockContent({ matrix, group, dates, candidate, block }: {
  matrix: MatrixResponse;
  group: OptionGroup;
  dates: MatrixDate[];
  candidate: OptionCandidate;
  block: DeckTemplateBlock;
}) {
  const verticalAlign = block.verticalAlign === "bottom" ? "flex-end" : block.verticalAlign === "middle" ? "center" : "flex-start";
  const textStyle = {
    fontSize: block.fontSize,
    fontWeight: block.fontWeight,
    textAlign: block.align,
    color: block.textColor ?? "#1a1a1f",
    lineHeight: block.lineHeight ?? 1.2,
    letterSpacing: block.letterSpacing,
    padding: block.textPadding ?? 0,
    textTransform: block.uppercase ? "uppercase" : "none",
    display: "flex",
    alignItems: verticalAlign,
  } as React.CSSProperties;
  const textInnerStyle = block.textMaxLines && block.textMaxLines > 0 ? {
    display: "-webkit-box",
    WebkitLineClamp: block.textMaxLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as React.CSSProperties : undefined;

  if (block.type === "field" || block.type === "notes") {
    const value = candidateFieldValue(candidate, block.field ?? "name", matrix);
    if (block.hideIfEmpty && !value.trim()) return null;
    return <div className="h-full whitespace-pre-line text-black" style={textStyle}><span style={textInnerStyle}>{value || block.label}</span></div>;
  }
  if (block.type === "links") {
    const links = candidateLinks(candidate);
    if (block.hideIfEmpty && links.length === 0) return null;
    return <div className="flex h-full gap-3 text-black" style={textStyle}>{links.length ? links.map((link) => <span key={link.label} className="underline">{link.label}</span>) : "Book  social  website  pdf"}</div>;
  }
  if (block.type === "dateStatus") {
    const statuses = dates.map((date) => ({ date, status: statusFor(candidate, date.id)?.status })).filter((item) => item.status && item.status !== "NA");
    return (
      <div className="flex h-full flex-col overflow-hidden border border-black text-center text-black" style={textStyle}>
        {statuses.length ? statuses.map(({ date, status }) => (
          <div key={date.id} className={`flex flex-1 items-center justify-center border-b border-black px-1 last:border-b-0 ${status === "FIRST_OPTION" || status === "CONFIRMED" ? "bg-green-200" : status === "SECOND_OPTION" || status === "REQUESTED" ? "bg-cyan-100" : "bg-orange-100"}`}>
            {new Date(date.date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} — {label(status ?? "").toUpperCase()}
          </div>
        )) : <div className="grid h-full place-items-center text-gray-400">Date status</div>}
      </div>
    );
  }
  if (block.type === "imageGrid") {
    const allPhotos = candidate.photos.filter((photo) => photo.exportSelected).concat(candidate.photos.filter((photo) => !photo.exportSelected));
    const count = block.imageCount ?? 4;
    const padding = Math.max(0, Math.min(80, block.imagePadding ?? 8));
    const gap = Math.max(0, Math.min(80, block.imageGap ?? block.imagePadding ?? 8));
    const slots = block.imageHideEmptySlots ? allPhotos.slice(0, count) : Array.from({ length: count }).map((_, index) => allPhotos[index] ?? null);
    const fit = block.imageFit ?? (block.imageLayout === "justify" ? "natural" : "contain");
    const imagePosition = block.imagePosition ?? "bottom";
    const objectPosition = `center ${imagePosition === "center" ? "center" : imagePosition}`;
    const imageClass = fit === "cover"
      ? "h-full w-full object-cover object-bottom"
      : fit === "natural"
        ? "h-full w-auto max-w-none object-contain object-bottom"
        : "max-h-full max-w-full object-contain object-bottom";
    const cells = slots.map((photo, index) => {
      return (
        <div
          key={photo?.id ?? index}
          className="flex h-full min-h-0 min-w-0 items-end justify-center overflow-hidden bg-white"
          style={{
            alignItems: imagePosition === "top" ? "flex-start" : imagePosition === "center" ? "center" : "flex-end",
            background: block.imageBackground ?? "#ffffff",
            border: block.imageBorder ? "1px solid #e1e1dc" : undefined,
            borderRadius: block.imageRadius ?? 0,
          }}
        >
          {photo ? <img src={photo.url} className={imageClass} style={{ objectPosition }} /> : <div className="grid h-full w-full place-items-center border border-gray-200 text-gray-300"><ImageIcon size={22} /></div>}
        </div>
      );
    });
    if (block.imageLayout === "justify") {
      return (
        <div
          className={`flex h-full w-full items-end content-end overflow-hidden ${block.imageAllowRows ? "flex-wrap" : "flex-nowrap"}`}
          style={{ gap, padding }}
        >
          {cells.map((cell, index) => {
            const photo = slots[index];
            const ratio = photo?.width && photo.height ? Math.max(0.2, Math.min(8, photo.width / photo.height)) : 1.4;
            return (
              <div
                key={photo?.id ?? index}
                className={block.imageAllowRows ? "min-w-0 shrink-0" : "h-full min-w-0 shrink-0"}
                style={block.imageAllowRows ? { height: `calc((100% - ${gap}px) / 2)`, aspectRatio: ratio } : { height: "100%", aspectRatio: ratio }}
              >
                {cell}
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="grid h-full w-full" style={{ gap, padding, gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))))}, minmax(0, 1fr))` }}>
        {cells}
      </div>
    );
  }
  if (block.type === "map") {
    const mapUrl = candidateMapUrl(candidate);
    return (
      <div className="h-full w-full overflow-hidden border border-gray-300 bg-[#eef3ee]">
        {mapUrl ? (
          <img src={mapUrl} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center p-3 text-center text-xs text-gray-500">
            <div>
              <Globe size={22} className="mx-auto mb-2" />
              Map block<br />
              {addressSummary(candidate) || "Address / coordinates"}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full items-end justify-between p-1 text-black" style={textStyle}>
      <span>unlimited.bond</span>
      <span>{[matrix.production.brand, matrix.production.clientName].filter(Boolean).join(" x ") || group.name}</span>
      <span>1</span>
    </div>
  );
}

function optionColumnTypeLabel(type: OptionColumnType): string {
  return OPTION_COLUMN_TYPES.find((item) => item.value === type)?.label ?? type;
}

function customColumnValue(candidate: OptionCandidate, columnId: string): unknown {
  return candidate.columnValues.find((item) => item.columnId === columnId)?.value ?? null;
}

function customColumnDisplay(value: unknown, type: OptionColumnType): string {
  if (value === null || value === undefined) return "";
  if (type === "CHECKBOX") return value === true ? "Yes" : "";
  if (typeof value === "number") return type === "PERCENT" ? `${value}%` : value.toString();
  if (typeof value === "boolean") return value ? "Yes" : "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

function normalizeColumnValue(value: string, type: OptionColumnType): unknown {
  if (type === "NUMBER" || type === "CURRENCY" || type === "PERCENT") {
    const parsed = Number(value);
    return value.trim() === "" || !Number.isFinite(parsed) ? null : parsed;
  }
  return value.trim() || null;
}

function CustomColumnHeader({ column, isDropTarget, sortKey, activeSortKey, sortDirection, onSort, onUpdate, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  column: OptionColumn;
  isDropTarget: boolean;
  sortKey?: CandidateSortKey;
  activeSortKey?: CandidateSortKey;
  sortDirection?: SortDirection;
  onSort?: (key: CandidateSortKey) => void;
  onUpdate: (columnId: string, patch: Partial<Pick<OptionColumn, "label" | "type" | "width" | "hidden" | "locked" | "order" | "config">>) => Promise<void>;
  onDelete: (columnId: string) => Promise<void>;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(column.label);
  const startX = useRef(0);
  const startWidth = useRef(column.width);
  const active = sortKey !== undefined && activeSortKey === sortKey;

  useEffect(() => setLabel(column.label), [column.label]);

  function beginResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    startX.current = event.clientX;
    startWidth.current = column.width;
    let latestWidth = column.width;
    const move = (moveEvent: MouseEvent) => {
      latestWidth = Math.max(80, Math.min(420, Math.round(startWidth.current + moveEvent.clientX - startX.current)));
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      void onUpdate(column.id, { width: latestWidth }).catch((err: Error) => window.alert(err.message));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column.id);
        onDragStart();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`relative flex h-full min-w-0 items-center gap-1 border-l border-gray-100 pl-2 pr-3 ${isDropTarget ? "bg-blue-50" : ""}`}
      title={`${column.label} · ${optionColumnTypeLabel(column.type)}`}
    >
      {editing && !column.locked ? (
        <input
          value={label}
          autoFocus
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            setEditing(false);
            if (label.trim() && label.trim() !== column.label) void onUpdate(column.id, { label: label.trim() });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setLabel(column.label);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-700 outline-none"
        />
      ) : (
        <button
          onClick={() => { if (sortKey && onSort) onSort(sortKey); }}
          onDoubleClick={() => { if (!column.locked) setEditing(true); }}
          className={`min-w-0 flex-1 truncate text-left ${active ? "font-semibold text-gray-700" : ""}`}
        >
          {column.label}{active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
        </button>
      )}
      <button onClick={() => setMenuOpen((open) => !open)} className="text-gray-300 hover:text-gray-700">▾</button>
      <div onMouseDown={beginResize} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-gray-300" />
      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-2 text-[11px] normal-case tracking-normal shadow-xl">
          {!column.locked && (
            <label className="mb-2 block text-gray-500">
              Type
              <select
                value={column.type}
                onChange={(event) => {
                  void onUpdate(column.id, { type: event.target.value as OptionColumnType });
                  setMenuOpen(false);
                }}
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1.5 text-gray-800 outline-none"
              >
                {OPTION_COLUMN_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          )}
          {!column.locked && <button onClick={() => { setEditing(true); setMenuOpen(false); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-50">Rename</button>}
          <button onClick={() => { void onUpdate(column.id, { hidden: true }); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-50">Hide field</button>
          {!column.locked && <button onClick={() => { void onDelete(column.id); }} className="block w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50">Delete field</button>}
        </div>
      )}
    </div>
  );
}

function DateStatusColumnHeader({ column, date, showControls, isDropTarget, sortKey, sortDirection, onSort, onUpdate, onDelete, onDragStart, onDragOver, onDrop, onDragEnd }: {
  column: OptionColumn;
  date: MatrixDate;
  showControls: boolean;
  isDropTarget: boolean;
  sortKey: CandidateSortKey;
  sortDirection: SortDirection;
  onSort: () => void;
  onUpdate: (columnId: string, patch: Partial<Pick<OptionColumn, "label" | "type" | "width" | "hidden" | "locked" | "order" | "config">>) => Promise<void>;
  onDelete: (columnId: string) => Promise<void>;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const parts = compactDateLabel(date);
  const active = sortKey === `date:${date.id}`;
  return (
    <div className={`relative flex h-full min-w-0 items-center justify-center border-l border-gray-100 px-1 ${isDropTarget ? "bg-blue-50" : ""}`}>
      {showControls && (
        <div className="absolute left-0 top-0 h-full w-full opacity-0 transition hover:opacity-100">
          <CustomColumnHeader
            column={column}
            isDropTarget={isDropTarget}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        </div>
      )}
      <button onClick={onSort} className={`min-w-0 text-center ${active ? "font-semibold text-gray-700" : ""}`} title="Sort by this date">
        <span className="block truncate text-[10px] font-semibold leading-3 text-gray-600">{parts.top}{active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</span>
        <span className="block truncate text-[9px] leading-3 tracking-normal text-gray-400">{parts.bottom}</span>
      </button>
    </div>
  );
}

function CustomColumnCell({ column, candidate, onSave }: {
  column: OptionColumn;
  candidate: OptionCandidate;
  onSave: (value: unknown) => Promise<void>;
}) {
  const value = customColumnValue(candidate, column.id);
  const display = customColumnDisplay(value, column.type);
  if (column.type === "CHECKBOX") {
    return (
      <label className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => { void onSave(event.target.checked); }}
          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
        />
      </label>
    );
  }
  if (column.type === "LONG_TEXT") {
    return (
      <NoteCell
        value={display}
        onSave={(next) => onSave(next.trim() || null)}
        placeholder={column.label}
        tone="custom"
      />
    );
  }
  if (column.type === "URL" && display) {
    return (
      <div className="min-w-0 truncate text-[11px]">
        <a href={display} target="_blank" rel="noreferrer" className="text-gray-600 underline underline-offset-2 hover:text-gray-900">{display}</a>
      </div>
    );
  }
  const alignRight = column.type === "NUMBER" || column.type === "CURRENCY" || column.type === "PERCENT";
  return (
    <EditableText
      value={display}
      onSave={(next) => onSave(normalizeColumnValue(next, column.type))}
      className={`truncate text-[12px] ${alignRight ? "pr-1 text-right tabular-nums" : "text-gray-600"}`}
      placeholder={column.type === "CURRENCY" ? "—" : column.label}
    />
  );
}

function CandidateRow({ candidate, group, dates, customColumns, gridColumns, onOpenPhotos, onUpdateCandidate, onLinkBlackbook, onOpenBlackbook, onUpdateCandidateDate, onUpdateColumnValue, onUploadPhoto, onUploadPdf, isReorderDragging, isReorderTarget, onReorderDragStart, onReorderDragOver, onReorderDrop, onReorderDragEnd, onDeleteCandidate }: {
  candidate: OptionCandidate;
  group: OptionGroup;
  dates: MatrixDate[];
  customColumns: OptionColumn[];
  gridColumns: string;
  onOpenPhotos: () => void;
  onUpdateCandidate: (candidateId: string, patch: Partial<OptionCandidate>) => Promise<void>;
  onLinkBlackbook: (candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
  onUpdateCandidateDate: (candidateId: string, dateId: string, status: HoldStatus | null) => Promise<void>;
  onUpdateColumnValue: (candidateId: string, columnId: string, value: unknown) => Promise<void>;
  onUploadPhoto: (candidateId: string, file: File) => Promise<void>;
  onUploadPdf: (candidateId: string, file: File) => Promise<void>;
  isReorderDragging: boolean;
  isReorderTarget: boolean;
  onReorderDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onReorderDragOver: () => void;
  onReorderDrop: () => void;
  onReorderDragEnd: () => void;
  onDeleteCandidate: (candidateId: string) => Promise<void>;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);

  function imageFiles(items: FileList): File[] {
    return Array.from(items).filter((file) => IMAGE_DROP_TYPES.has(file.type));
  }

  async function uploadDropped(files: File[]) {
    if (files.length === 0) return;
    setDropUploading(true);
    try {
      for (const file of files) {
        await onUploadPhoto(candidate.id, file);
      }
    } finally {
      setDropUploading(false);
      setDragActive(false);
    }
  }

  return (
    <div
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragActive(true);
        } else if (event.dataTransfer.types.includes("text/plain")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onReorderDragOver();
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) {
          void uploadDropped(imageFiles(event.dataTransfer.files)).catch((err: Error) => window.alert(err.message));
        } else {
          onReorderDrop();
        }
      }}
      className={`relative grid min-h-[62px] items-center gap-x-2 border-b px-2 py-2 text-xs transition ${
        dragActive ? "border-gray-400 bg-blue-50 ring-1 ring-inset ring-blue-300" : isReorderTarget ? "border-gray-300 bg-gray-100 ring-1 ring-inset ring-gray-300" : "border-gray-100 hover:bg-[#fafafa]"
      } ${candidate.activeState === "RELEASED" ? "opacity-45" : ""} ${isReorderDragging ? "opacity-45" : ""}`}
      style={{ gridTemplateColumns: gridColumns }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-1 z-10 grid place-items-center rounded-md border border-dashed border-blue-300 bg-blue-50/80 text-[11px] font-medium text-blue-700">
          Drop image{dropUploading ? " - uploading..." : "s here to add to this option"}
        </div>
      )}
      {customColumns.flatMap((column) => {
        if (column.key === "image") return [<PhotoThumb key={column.id} candidate={candidate} onOpen={onOpenPhotos} />];
        if (column.key === "option") {
          return [(
            <div key={column.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <EditableText value={candidate.name} onSave={(name) => onUpdateCandidate(candidate.id, { name })} className="text-[13px] font-semibold text-gray-900" placeholder="Candidate" />
              </div>
              {candidate.subtitle && <div className="mt-1 truncate text-[11px] text-gray-400">{candidate.subtitle}</div>}
            </div>
          )];
        }
        if (column.key === "date_statuses") {
          return dates.map((date) => {
            const status = statusFor(candidate, date.id)?.status ?? null;
            return (
              <div key={`${column.id}:${date.id}`} className="flex justify-center border-l border-gray-100/80 pl-2">
                <PillDropdown
                  value={status}
                  options={HOLD_STATUSES}
                  onChange={(nextStatus) => onUpdateCandidateDate(candidate.id, date.id, nextStatus)}
                  classNameForValue={holdClass}
                  placeholder="blank"
                  compact
                />
              </div>
            );
          });
        }
        if (column.key === "contact") {
          return [(
            <CandidateContactCell
              key={column.id}
              group={group}
              candidate={candidate}
              onUpdate={(patch) => onUpdateCandidate(candidate.id, patch)}
              onLink={(payload) => onLinkBlackbook(candidate.id, payload)}
              onOpenBlackbook={onOpenBlackbook}
            />
          )];
        }
        if (column.key === "clientNotes") {
          return [<NoteCell key={column.id} value={candidate.clientNotes ?? ""} onSave={(clientNotes) => onUpdateCandidate(candidate.id, { clientNotes })} placeholder="Deck note" tone="deck" />];
        }
        if (column.key === "internalNotes") {
          return [<NoteCell key={column.id} value={candidate.internalNotes ?? ""} onSave={(internalNotes) => onUpdateCandidate(candidate.id, { internalNotes })} placeholder="Internal note" tone="internal" />];
        }
        if (column.key === "links") {
          return [<CandidateLinksCell key={column.id} candidate={candidate} onUpdate={(patch) => onUpdateCandidate(candidate.id, patch)} onUploadPdf={(file) => onUploadPdf(candidate.id, file)} />];
        }
        if (column.key === "address") {
          return [<CandidateAddressCell key={column.id} candidate={candidate} onUpdate={(patch) => onUpdateCandidate(candidate.id, patch)} />];
        }
        if (column.key === "rate") {
          return [<EditableText key={column.id} value={candidate.rate && candidate.rate > 0 ? candidate.rate.toString() : ""} onSave={(rate) => onUpdateCandidate(candidate.id, { rate: rate ? Number(rate) : null })} className={`pr-1 text-right tabular-nums ${candidate.rate && candidate.rate > 0 ? "text-gray-700" : "text-gray-300"}`} placeholder="—" />];
        }
        if (column.key === "activeState") {
          return [<PillDropdown key={column.id} value={candidate.activeState} options={["ACTIVE", "PARKED", "RELEASED"] as const} onChange={(activeState) => activeState ? onUpdateCandidate(candidate.id, { activeState }) : Promise.resolve()} classNameForValue={(state) => state === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "PARKED" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-500"} />];
        }
        return [<CustomColumnCell key={column.id} column={column} candidate={candidate} onSave={(value) => onUpdateColumnValue(candidate.id, column.id, value)} />];
      })}
      <div className="flex items-center justify-center gap-0.5 opacity-45 transition hover:opacity-100">
        <button
          draggable
          onDragStart={onReorderDragStart}
          onDragEnd={onReorderDragEnd}
          title="Drag to reorder"
          className="grid h-7 w-5 cursor-grab place-items-center rounded text-[13px] leading-none text-gray-400 active:cursor-grabbing hover:bg-white hover:text-gray-900"
        >
          ⋮⋮
        </button>
        <button onClick={() => onDeleteCandidate(candidate.id)} title="Delete" className="grid h-7 w-4 place-items-center rounded text-red-500 hover:bg-red-50"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function CandidateContactCell({ group, candidate, onUpdate, onLink, onOpenBlackbook }: {
  group: OptionGroup;
  candidate: OptionCandidate;
  onUpdate: (patch: Partial<OptionCandidate>) => Promise<void>;
  onLink: (payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(candidate.contactEmail ?? candidate.blackbookEntry?.email ?? "");
  const [phoneDraft, setPhoneDraft] = useState(candidate.contactPhone ?? candidate.blackbookEntry?.phone ?? "");
  const ref = useRef<HTMLDivElement | null>(null);
  const email = candidate.contactEmail ?? candidate.blackbookEntry?.email ?? "";
  const phone = candidate.contactPhone ?? candidate.blackbookEntry?.phone ?? "";
  const hasContact = Boolean(email || phone);

  useEffect(() => {
    setEmailDraft(candidate.contactEmail ?? candidate.blackbookEntry?.email ?? "");
    setPhoneDraft(candidate.contactPhone ?? candidate.blackbookEntry?.phone ?? "");
  }, [candidate.contactEmail, candidate.contactPhone, candidate.blackbookEntry?.email, candidate.blackbookEntry?.phone]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function save() {
    const nextEmail = emailDraft.trim();
    const nextPhone = phoneDraft.trim();
    if (nextEmail === email && nextPhone === phone) {
      setOpen(false);
      return;
    }
    await onUpdate({
      contactEmail: nextEmail || null,
      contactPhone: nextPhone || null,
    });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative flex min-w-0 items-start gap-1.5">
      <BlackbookLinkControl
        group={group}
        candidate={candidate}
        onLink={onLink}
        onOpenBlackbook={onOpenBlackbook}
        mode="icon"
      />
      <button
        onClick={() => setOpen(true)}
        className={`block min-w-0 flex-1 text-left text-[10.5px] leading-4 ${hasContact ? "text-gray-500" : "text-gray-300"} hover:text-gray-900`}
        title={hasContact ? "Edit contact details" : "Add contact details"}
      >
        {email ? (
          <span className="flex min-w-0 items-center gap-1">
            <Mail size={11} className="shrink-0" />
            <span className="truncate">{email}</span>
          </span>
        ) : null}
        {phone ? (
          <span className="flex min-w-0 items-center gap-1">
            <Phone size={11} className="shrink-0" />
            <span className="truncate">{phone}</span>
          </span>
        ) : null}
        {!hasContact && <span>+ contact</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Contact details</div>
            {candidate.blackbookEntryId && <div className="text-[10px] text-gray-400">syncs to Blackbook</div>}
          </div>
          <label className="mb-2 block text-[11px] text-gray-500">
            Email
            <input
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              placeholder="email@example.com"
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-gray-400"
            />
          </label>
          <label className="mb-3 block text-[11px] text-gray-500">
            Phone
            <input
              value={phoneDraft}
              onChange={(event) => setPhoneDraft(event.target.value)}
              placeholder="+44..."
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-gray-400"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 gap-2">
              {email && <a href={`mailto:${email}`} className="text-[11px] text-gray-500 underline underline-offset-2">email</a>}
              {phone && <a href={`tel:${phone}`} className="text-[11px] text-gray-500 underline underline-offset-2">call</a>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={() => { save().catch(console.error); }} className="rounded bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateLinksCell({ candidate, onUpdate, onUploadPdf }: {
  candidate: OptionCandidate;
  onUpdate: (patch: Partial<OptionCandidate>) => Promise<void>;
  onUploadPdf: (file: File) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  type CandidateLink = { key: string; label: string; href: string; icon: ReactNode };
  const maybeLinks: Array<CandidateLink | null> = [
    candidate.website ? { key: "website", label: "Website", href: candidate.website, icon: <Globe size={13} /> } : null,
    candidate.bookUrl ? { key: "book", label: "Book", href: candidate.bookUrl, icon: <BookOpen size={13} /> } : null,
    candidate.socialUrl ? { key: "social", label: "Social", href: candidate.socialUrl, icon: <Share2 size={13} /> } : null,
    candidate.modelsComUrl ? { key: "models", label: "models.com", href: candidate.modelsComUrl, icon: <ExternalLink size={13} /> } : null,
    candidate.pdfUrl ? { key: "pdf", label: "PDF", href: candidate.pdfUrl, icon: <FileText size={13} /> } : null,
  ];
  const links = maybeLinks.filter((item): item is CandidateLink => item !== null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf") {
      window.alert("Drop a PDF file here");
      return;
    }
    setUploading(true);
    try {
      await onUploadPdf(file);
    } finally {
      setUploading(false);
      setDragActive(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <div
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        title={links.length ? "Click an icon to open. Right-click to edit links." : "Right-click to add links."}
        className="flex min-h-7 items-center justify-center gap-1 rounded-md px-1 text-gray-400 hover:bg-gray-50"
      >
        {links.length ? links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.label}
            title={link.label}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="grid h-6 w-6 place-items-center rounded text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm"
          >
            {link.icon}
          </a>
        )) : (
          <span className="text-[10px] uppercase tracking-[0.04em] text-gray-300">none</span>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[320px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Deck links</div>
          <LinkInput label="Website" value={candidate.website ?? ""} onSave={(website) => onUpdate({ website })} />
          <LinkInput label="Book" value={candidate.bookUrl ?? ""} onSave={(bookUrl) => onUpdate({ bookUrl })} />
          <LinkInput label="Social" value={candidate.socialUrl ?? ""} onSave={(socialUrl) => onUpdate({ socialUrl })} />
          <LinkInput label="models.com" value={candidate.modelsComUrl ?? ""} onSave={(modelsComUrl) => onUpdate({ modelsComUrl })} />
          <LinkInput label="PDF URL" value={candidate.pdfUrl ?? ""} onSave={(pdfUrl) => onUpdate({ pdfUrl })} />
          <div
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDragActive(true);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDragActive(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const file = Array.from(event.dataTransfer.files).find((item) => item.type === "application/pdf");
              if (file) void uploadPdf(file).catch((err: Error) => window.alert(err.message));
            }}
            className={`mt-3 rounded-md border border-dashed p-3 text-center text-[11px] ${
              dragActive ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-300 bg-gray-50 text-gray-500"
            }`}
          >
            {uploading ? "Uploading PDF..." : candidate.pdfFilename ? `PDF uploaded: ${candidate.pdfFilename}` : "Drop PDF here to create a public deck link"}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkInput({ label: inputLabel, value, onSave }: { label: string; value: string; onSave: (value: string) => Promise<void> }) {
  return (
    <label className="mb-2 grid grid-cols-[72px_1fr] items-center gap-2 text-[11px] text-gray-500">
      <span>{inputLabel}</span>
      <EditableText value={value} onSave={onSave} className="rounded border border-gray-200 px-2 py-1 text-gray-800" placeholder="https://..." />
    </label>
  );
}

function CandidateAddressCell({ candidate, onUpdate }: {
  candidate: OptionCandidate;
  onUpdate: (patch: Partial<OptionCandidate>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addressType, setAddressType] = useState<BlackbookAddressType>("WORK");
  const [defaultBilling, setDefaultBilling] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    addressLine1: candidate.addressLine1 ?? "",
    addressLine2: candidate.addressLine2 ?? "",
    city: candidate.city ?? "",
    region: candidate.region ?? "",
    postcode: candidate.postcode ?? "",
    country: candidate.country ?? "",
  });
  const ref = useRef<HTMLDivElement | null>(null);
  const sessionToken = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const savedAddresses = candidate.blackbookEntry?.addresses ?? [];
  const displayAddress = candidate.selectedAddress ?? candidate;
  const summary = addressSummary(displayAddress);
  const lines = addressDisplayLines(displayAddress);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.get<{ results: PlaceSearchResult[] }>(`/api/options/places/search?q=${encodeURIComponent(query)}&sessionToken=${encodeURIComponent(sessionToken.current)}`)
        .then((data) => setResults(data.results))
        .catch(console.error)
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    if (open) {
      setManualDraft({
        addressLine1: candidate.addressLine1 ?? "",
        addressLine2: candidate.addressLine2 ?? "",
        city: candidate.city ?? "",
        region: candidate.region ?? "",
        postcode: candidate.postcode ?? "",
        country: candidate.country ?? "",
      });
    }
  }, [candidate.addressLine1, candidate.addressLine2, candidate.city, candidate.country, candidate.postcode, candidate.region, open]);

  async function selectSavedAddress(addressId: string) {
    await onUpdate({ selectedAddressId: addressId });
    setOpen(false);
  }

  async function createAddressFromPlace(result: PlaceSearchResult) {
    if (!candidate.blackbookEntryId) return;
    const place = await api.post<NormalizedPlace>("/api/options/places/details", {
      placeId: result.placeId,
      sessionToken: sessionToken.current,
    });
    const address = await api.post<BlackbookAddress>(`/api/options/blackbook/${candidate.blackbookEntryId}/addresses`, {
      type: addressType,
      isDefaultBilling: defaultBilling,
      source: "GOOGLE_PLACES",
      placeId: place.placeId,
      placeName: place.placeName,
      formattedAddress: place.formattedAddress,
      addressLine1: place.addressLine1,
      addressLine2: place.addressLine2,
      city: place.city,
      region: place.region,
      postcode: place.postcode,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      website: place.website,
      phone: place.phone,
    });
    await onUpdate({ selectedAddressId: address.id });
    sessionToken.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  async function saveManualAddress() {
    if (candidate.blackbookEntryId) {
      const address = await api.post<BlackbookAddress>(`/api/options/blackbook/${candidate.blackbookEntryId}/addresses`, {
        ...manualDraft,
        type: addressType,
        isDefaultBilling: defaultBilling,
        source: "MANUAL",
      });
      await onUpdate({ selectedAddressId: address.id });
    } else {
      await onUpdate(manualDraft);
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        title={summary || "Add address"}
        className={`block w-full min-w-0 text-left text-[10px] leading-[1.2] ${
          summary ? "text-gray-600 hover:text-gray-900" : "h-7 rounded-md border border-gray-200 bg-white px-2 font-semibold uppercase text-gray-400"
        }`}
      >
        {lines.length ? (
          <span className="block max-h-[38px] overflow-hidden">
            {lines.map((line) => (
              <span key={line} className="block truncate">{line}</span>
            ))}
          </span>
        ) : (
          <span className="flex h-full items-center">address <span className="ml-1 text-[9px] opacity-60">▾</span></span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[380px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Address for deck</div>
            <select value={addressType} onChange={(event) => setAddressType(event.target.value as BlackbookAddressType)} className="h-7 rounded border border-gray-200 bg-white px-2 text-[11px] text-gray-700">
              {(["WORK", "BILLING", "PERSONAL", "CUSTOM"] as BlackbookAddressType[]).map((type) => <option key={type} value={type}>{addressTypeLabel(type)}</option>)}
            </select>
          </div>
          <label className="mb-3 flex items-center gap-2 text-[11px] text-gray-500">
            <input type="checkbox" checked={defaultBilling} onChange={(event) => setDefaultBilling(event.target.checked)} className="h-3 w-3" />
            Set as default billing address
          </label>

          {savedAddresses.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Saved addresses</div>
              <div className="space-y-1">
                {savedAddresses.map((address) => (
                  <button
                    key={address.id}
                    onClick={() => { void selectSavedAddress(address.id).catch(console.error); }}
                    className={`w-full rounded px-2 py-1.5 text-left text-[11px] ${candidate.selectedAddressId === address.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                  >
                    <span className="mb-0.5 block font-semibold">{address.label || address.placeName || addressTypeLabel(address.type)}{address.isDefaultBilling ? " · default billing" : ""}</span>
                    {addressDisplayLines(address).map((line) => <span key={line} className="block truncate opacity-75">{line}</span>)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-400">Search place or address</div>
          {!candidate.blackbookEntryId && <div className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">Link or create a Blackbook entry first to save Places results.</div>}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!candidate.blackbookEntryId}
            placeholder="Claridge's, Big Sky Studios London..."
            className="mb-2 h-8 w-full rounded border border-gray-200 px-2 text-[11px] text-gray-800 outline-none focus:border-gray-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          {searching && <div className="mb-2 text-[11px] text-gray-400">Searching...</div>}
          {results.length > 0 && (
            <div className="mb-3 max-h-44 overflow-auto rounded border border-gray-100">
              {results.map((result) => (
                <button key={result.placeId} onClick={() => { void createAddressFromPlace(result).catch(console.error); }} className="block w-full border-b border-gray-100 px-2 py-2 text-left text-[11px] last:border-b-0 hover:bg-gray-50">
                  <span className="block font-semibold text-gray-800">{result.mainText}</span>
                  <span className="block truncate text-gray-500">{result.secondaryText}</span>
                </button>
              ))}
            </div>
          )}

          <button onClick={() => setManualOpen((current) => !current)} className="text-[11px] font-medium text-gray-600 underline decoration-gray-300 underline-offset-2">
            {manualOpen ? "Hide manual entry" : "Enter manually"}
          </button>
          {manualOpen && (
            <div className="mt-3 rounded border border-gray-100 bg-gray-50 p-2">
              <AddressInput label="Address 1" value={manualDraft.addressLine1} onSave={async (addressLine1) => setManualDraft((draft) => ({ ...draft, addressLine1 }))} />
              <AddressInput label="Address 2" value={manualDraft.addressLine2} onSave={async (addressLine2) => setManualDraft((draft) => ({ ...draft, addressLine2 }))} />
              <div className="grid grid-cols-2 gap-2">
                <AddressInput label="City" value={manualDraft.city} onSave={async (city) => setManualDraft((draft) => ({ ...draft, city }))} />
                <AddressInput label="Region" value={manualDraft.region} onSave={async (region) => setManualDraft((draft) => ({ ...draft, region }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AddressInput label="Postcode" value={manualDraft.postcode} onSave={async (postcode) => setManualDraft((draft) => ({ ...draft, postcode }))} />
                <label className="mb-2 block text-[11px] text-gray-500">
                  <span className="mb-1 block">Country</span>
                  <select value={manualDraft.country} onChange={(event) => setManualDraft((draft) => ({ ...draft, country: event.target.value }))} className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-[11px] text-gray-800 outline-none focus:border-gray-500">
                    <option value="">Select country...</option>
                    {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                  </select>
                </label>
              </div>
              <button onClick={() => { void saveManualAddress().catch(console.error); }} className="mt-1 rounded bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white">Save address</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddressInput({ label: inputLabel, value, onSave }: { label: string; value: string; onSave: (value: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  async function save() {
    if (draft !== value) await onSave(draft);
  }

  return (
    <label className="mb-2 block text-[11px] text-gray-500">
      <span className="mb-1 block">{inputLabel}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { save().catch(console.error); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
        className="h-8 w-full rounded border border-gray-200 bg-white px-2 text-[11px] text-gray-800 outline-none focus:border-gray-500"
      />
    </label>
  );
}

function PhotoThumb({ candidate, onOpen }: { candidate: OptionCandidate; onOpen: () => void }) {
  const cover = candidate.photos[0];
  return (
    <button onClick={onOpen} className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 text-gray-300 hover:border-gray-400">
      {cover ? <img src={cover.url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={17} />}
      {candidate.photos.length > 0 && <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[9px] text-white">{candidate.photos.length}</span>}
    </button>
  );
}

function PhotoManager({ candidate, onClose, onUpload, onUpdate, onDelete }: {
  candidate: OptionCandidate;
  onClose: () => void;
  onUpload: (candidateId: string, file: File) => Promise<void>;
  onUpdate: (photoId: string, patch: Partial<OptionCandidatePhoto>) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const selectedCount = candidate.photos.filter((photo) => photo.exportSelected).length;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUpload(candidate.id, file);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-[940] grid place-items-center bg-black/25 p-4">
      <div className="w-full max-w-[720px] rounded-xl bg-white shadow-2xl">
        <div className="flex min-h-14 items-center gap-3 border-b border-gray-100 px-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">Images — {candidate.name}</h3>
            <p className="text-[11px] text-gray-400">{selectedCount} selected for future PDF export · uploads are converted for clear digital decks</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3">
            {candidate.photos.map((photo, index) => (
              <div key={photo.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="relative aspect-[4/3] bg-gray-100">
                  <img src={photo.url} alt={photo.caption ?? photo.filename} className="h-full w-full object-cover" />
                  {index === 0 && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">Cover</span>}
                </div>
                <div className="space-y-2 p-2">
                  <label className="flex min-h-7 items-center gap-2 text-[11px] text-gray-600">
                    <input type="checkbox" checked={photo.exportSelected} onChange={(event) => onUpdate(photo.id, { exportSelected: event.target.checked }).catch(console.error)} />
                    Export to PDF
                  </label>
                  <input
                    key={`${photo.id}-${photo.caption ?? ""}`}
                    defaultValue={photo.caption ?? ""}
                    onBlur={(event) => onUpdate(photo.id, { caption: event.target.value }).catch(console.error)}
                    placeholder="Caption..."
                    className="h-8 w-full rounded border border-gray-200 px-2 text-[11px] outline-none focus:border-gray-500"
                  />
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{photo.width && photo.height ? `${photo.width}×${photo.height}` : "Optimised JPG"}</span>
                    <button onClick={() => onDelete(photo.id).catch(console.error)} className="text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {candidate.photos.length < 10 && (
              <button onClick={() => inputRef.current?.click()} disabled={uploading} className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-500 hover:border-gray-500 hover:text-gray-900 disabled:opacity-50">
                <span><Upload size={20} className="mx-auto mb-2" />{uploading ? "Uploading..." : "Upload images"}</span>
              </button>
            )}
          </div>
          {candidate.photos.length === 0 && <p className="mt-4 text-center text-xs text-gray-400">Add images here now; the selected ones will be available when we build the PDF exporter.</p>}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => handleFiles(event.target.files).catch(console.error)} />
        </div>
      </div>
    </div>
  );
}

function RoleForm({ productionId, onClose, onSaved }: { productionId: string; onClose: () => void; onSaved: (data: MatrixResponse) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<RequirementType>("CREW");
  const [quantity, setQuantity] = useState("1");

  async function save() {
    if (!name.trim()) return;
    onSaved(await api.post<MatrixResponse>(`/api/options/production/${productionId}/matrix/groups`, { name, type, quantity: Number(quantity) || 1 }));
  }

  return (
    <div className="fixed inset-0 z-[850] grid place-items-center bg-black/20 p-4">
      <div className="w-full max-w-[420px] rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Add role / service requirement</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-500">Role / service name<input value={name} onChange={(event) => setName(event.target.value)} autoFocus className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500" placeholder="Photo Assistant" /></label>
          <label className="block text-xs font-medium text-gray-500">Type<select value={type} onChange={(event) => setType(event.target.value as RequirementType)} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500">{REQUIREMENT_TYPES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label className="block text-xs font-medium text-gray-500">Quantity / slots<input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min={1} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={save} className="rounded bg-gray-900 px-3 py-2 text-xs font-medium text-white">Add</button>
        </div>
      </div>
    </div>
  );
}

function DateForm({ productionId, onClose, onSaved }: { productionId: string; onClose: () => void; onSaved: (data: MatrixResponse) => void }) {
  const [labelValue, setLabelValue] = useState("");
  const [dateType, setDateType] = useState<ProductionDateType>("MEETING");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  async function save() {
    if (!date) return;
    onSaved(await api.post<MatrixResponse>(`/api/options/production/${productionId}/matrix/dates`, { label: labelValue, dateType, date, time }));
  }

  return (
    <div className="fixed inset-0 z-[850] grid place-items-center bg-black/20 p-4">
      <div className="w-full max-w-[420px] rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Add project date</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-gray-500">Label<input value={labelValue} onChange={(event) => setLabelValue(event.target.value)} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500" placeholder="Shoot A" /></label>
          <label className="block text-xs font-medium text-gray-500">Type<select value={dateType} onChange={(event) => setDateType(event.target.value as ProductionDateType)} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500">{DATE_TYPES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-500">Date<input value={date} onChange={(event) => setDate(event.target.value)} type="date" className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500" /></label>
            <label className="block text-xs font-medium text-gray-500">Time<input value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 h-10 w-full rounded border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-gray-500" placeholder="09:00" /></label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={save} className="rounded bg-gray-900 px-3 py-2 text-xs font-medium text-white">Add</button>
        </div>
      </div>
    </div>
  );
}
