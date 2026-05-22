import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Download, ExternalLink, FileText, Globe, Image as ImageIcon, Plus, Share2, Trash2, Upload, X } from "lucide-react";
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

function NoteCell({ value, onSave, placeholder, tone }: { value: string; onSave: (value: string) => Promise<void>; placeholder: string; tone: "deck" | "internal" }) {
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
        className={`block max-h-10 w-full overflow-hidden text-left text-[11px] leading-5 ${tone === "deck" ? "text-gray-600" : "italic text-gray-400"}`}
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
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-700">{tone === "deck" ? "Deck note" : "Internal note"}</div>
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

function BlackbookLinkControl({ group, candidate, onLink, onOpenBlackbook }: {
  group: OptionGroup;
  candidate: OptionCandidate;
  onLink: (payload: { entryId?: string | null; createFromCandidate?: boolean; create?: CreateBlackbookPayload }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
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
        className={`inline-flex h-5 max-w-[150px] items-center gap-1 rounded px-1.5 text-left text-[10px] transition ${entry ? "border border-transparent bg-transparent font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900" : "border border-transparent bg-transparent text-gray-300 hover:bg-gray-100 hover:text-gray-600"}`}
        title={linkedTitle}
      >
        {entry ? <BookOpen size={10} /> : <Plus size={10} />}
        <span className="truncate">{entry ? entry.displayName : "link record"}</span>
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

export default function OptionsBoardView({ productionId, onBack }: { productionId: string; onBack: () => void }) {
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 px-4">
        <button onClick={selectedGroup ? closeGroup : onBack} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={15} /> {selectedGroup ? "Matrix" : `${matrix.production.jobCode ?? "Production"} ${matrix.production.brand ?? matrix.production.clientName ?? ""}`}
        </button>
        <div className="min-w-0 text-center">
          <h2 className="truncate text-base font-semibold text-gray-900">{selectedGroup ? `${selectedGroup.name} options` : "Options Matrix"}</h2>
          <p className="text-[11px] text-gray-400">{selectedGroup ? "Candidate sheet for this role/service" : "Requirements by production date"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!selectedGroup && <button onClick={() => setShowDateForm(true)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Date</button>}
          {!selectedGroup && <button onClick={() => setShowRoleForm(true)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">+ Role / service</button>}
          {selectedGroup && (
            <button
              onClick={() => exportGroupPdf(selectedGroup.id).catch((err: Error) => window.alert(err.message))}
              disabled={exportingGroupId === selectedGroup.id}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
            >
              <Download size={13} /> {exportingGroupId === selectedGroup.id ? "Generating..." : "Export PDF"}
            </button>
          )}
          {selectedGroup && <button onClick={() => addCandidate(selectedGroup.id)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">+ Candidate</button>}
        </div>
      </div>

      {selectedGroup ? (
        <CandidateSheet
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
    </div>
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

function CandidateSheet({ group, dates, onUpdateCandidate, onLinkBlackbook, onOpenBlackbook, onUpdateCandidateDate, onUploadPhoto, onUploadPdf, onReorderCandidates, onUpdatePhoto, onDeletePhoto, onDeleteCandidate, onAddCandidate }: {
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
}) {
  const [photoCandidate, setPhotoCandidate] = useState<OptionCandidate | null>(null);
  const [sortKey, setSortKey] = useState<CandidateSortKey>("manual");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [dragCandidateId, setDragCandidateId] = useState<string | null>(null);
  const [dropCandidateId, setDropCandidateId] = useState<string | null>(null);
  const activePhotoCandidate = photoCandidate ? group.candidates.find((candidate) => candidate.id === photoCandidate.id) ?? photoCandidate : null;
  const gridColumns = `56px 320px ${dates.map(() => "92px").join(" ")} 230px 170px 82px 240px 58px 88px 34px`;
  const candidates = sortedCandidates(group.candidates, sortKey, sortDirection);
  const minimumSheetWidth = 1246 + (dates.length * 92);

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

  function SortHeader({ sort, children, align = "left" }: { sort: CandidateSortKey; children: React.ReactNode; align?: "left" | "center" | "right" }) {
    const active = sortKey === sort;
    return (
      <button
        onClick={() => setSort(sort)}
        className={`truncate ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${active ? "font-semibold text-gray-700" : ""}`}
        title="Sort"
      >
        {children}{active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white p-3">
      <div className="inline-block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" style={{ minWidth: minimumSheetWidth }}>
        <div className="sticky top-0 z-20 grid h-8 items-center gap-x-2 border-b border-gray-200 bg-[#f8f8f6] px-2 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: gridColumns }}>
          <button onClick={() => setSort("manual")} className={`pl-1 text-left ${sortKey === "manual" ? "font-semibold text-gray-700" : ""}`}>Img{sortKey === "manual" ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button>
          <SortHeader sort="name">Option</SortHeader>
          {dates.map((date) => {
            const parts = compactDateLabel(date);
            return (
              <SortHeader key={date.id} sort={`date:${date.id}`} align="center">
                <span className="block truncate text-[10px] font-semibold leading-3 text-gray-600">{parts.top}</span>
                <span className="block truncate text-[9px] leading-3 tracking-normal text-gray-400">{parts.bottom}</span>
              </SortHeader>
            );
          })}
          <SortHeader sort="notes">Deck notes</SortHeader>
          <div>Internal</div>
          <SortHeader sort="links" align="center">Links</SortHeader>
          <div>Address</div>
          <SortHeader sort="rate" align="right">Rate</SortHeader>
          <SortHeader sort="state">State</SortHeader>
          <div />
        </div>
        {candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            group={group}
            dates={dates}
            gridColumns={gridColumns}
            onOpenPhotos={() => setPhotoCandidate(candidate)}
            onUpdateCandidate={onUpdateCandidate}
            onLinkBlackbook={onLinkBlackbook}
            onOpenBlackbook={onOpenBlackbook}
            onUpdateCandidateDate={onUpdateCandidateDate}
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
    </div>
  );
}

function CandidateRow({ candidate, group, dates, gridColumns, onOpenPhotos, onUpdateCandidate, onLinkBlackbook, onOpenBlackbook, onUpdateCandidateDate, onUploadPhoto, onUploadPdf, isReorderDragging, isReorderTarget, onReorderDragStart, onReorderDragOver, onReorderDrop, onReorderDragEnd, onDeleteCandidate }: {
  candidate: OptionCandidate;
  group: OptionGroup;
  dates: MatrixDate[];
  gridColumns: string;
  onOpenPhotos: () => void;
  onUpdateCandidate: (candidateId: string, patch: Partial<OptionCandidate>) => Promise<void>;
  onLinkBlackbook: (candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
  onUpdateCandidateDate: (candidateId: string, dateId: string, status: HoldStatus | null) => Promise<void>;
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
      <PhotoThumb candidate={candidate} onOpen={onOpenPhotos} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <EditableText value={candidate.name} onSave={(name) => onUpdateCandidate(candidate.id, { name })} className="text-[13px] font-semibold text-gray-900" placeholder="Candidate" />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <BlackbookLinkControl group={group} candidate={candidate} onLink={(payload) => onLinkBlackbook(candidate.id, payload)} onOpenBlackbook={onOpenBlackbook} />
          {candidate.subtitle && <span className="truncate text-[11px] text-gray-400">{candidate.subtitle}</span>}
        </div>
      </div>
      {dates.map((date) => {
        const status = statusFor(candidate, date.id)?.status ?? null;
        return (
          <div key={date.id} className="flex justify-center border-l border-gray-100/80 pl-2">
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
      })}
      <NoteCell
        value={candidate.clientNotes ?? ""}
        onSave={(clientNotes) => onUpdateCandidate(candidate.id, { clientNotes })}
        placeholder="Deck note"
        tone="deck"
      />
      <NoteCell
        value={candidate.internalNotes ?? ""}
        onSave={(internalNotes) => onUpdateCandidate(candidate.id, { internalNotes })}
        placeholder="Internal note"
        tone="internal"
      />
      <CandidateLinksCell candidate={candidate} onUpdate={(patch) => onUpdateCandidate(candidate.id, patch)} onUploadPdf={(file) => onUploadPdf(candidate.id, file)} />
      <CandidateAddressCell candidate={candidate} onUpdate={(patch) => onUpdateCandidate(candidate.id, patch)} />
      <EditableText value={candidate.rate && candidate.rate > 0 ? candidate.rate.toString() : ""} onSave={(rate) => onUpdateCandidate(candidate.id, { rate: rate ? Number(rate) : null })} className={`pr-1 text-right tabular-nums ${candidate.rate && candidate.rate > 0 ? "text-gray-700" : "text-gray-300"}`} placeholder="—" />
      <PillDropdown value={candidate.activeState} options={["ACTIVE", "PARKED", "RELEASED"] as const} onChange={(activeState) => activeState ? onUpdateCandidate(candidate.id, { activeState }) : Promise.resolve()} classNameForValue={(state) => state === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "PARKED" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-500"} />
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
