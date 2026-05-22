import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowLeft, BookOpen, Link2, Plus, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import BlackbookOverlay from "../blackbook/BlackbookOverlay";

type RequirementType = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";
type RequirementState = "ACTIVE" | "PARKED" | "RELEASED";
type CandidateState = "ACTIVE" | "PARKED" | "RELEASED";
type HoldStatus = "REQUESTED" | "FIRST_OPTION" | "SECOND_OPTION" | "CONFIRMED" | "RELEASED" | "UNAVAILABLE" | "NA";
type PipelineState = "NOT_REQUIRED" | "NEEDED" | "REQUESTED" | "SECOND_OPTION" | "FIRST_OPTION" | "CONFIRMED" | "UNAVAILABLE" | "RELEASED";
type ProductionDateType = "PPM" | "RECCE" | "FITTING" | "MEETING" | "SHOOT_DAY" | "POST_DELIVERY" | "OTHER";
type ProductionDateStatus = "PROPOSED" | "OPTIONED" | "CONFIRMED" | "RELEASED" | "CANCELLED";
type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";

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
  name: string;
  subtitle: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  rate: number | null;
  rateUnit: string | null;
  currency: string;
  activeState: CandidateState;
  internalNotes: string | null;
  clientNotes: string | null;
  order: number;
  dateStatuses: CandidateDateStatus[];
  assignments: OptionSlotAssignment[];
  blackbookEntry: BlackbookEntry | null;
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

function label(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

function dateLabel(date: MatrixDate): string {
  const formatted = new Date(date.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date.label || label(date.dateType)} ${formatted}`;
}

function formatMoney(value: number | null, currency = "GBP"): string {
  if (value === null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function blackbookMeta(entry: BlackbookEntry | null): string[] {
  if (!entry) return [];
  return [entry.companyName, entry.jobTitle, entry.email, entry.phone, entry.city].filter((item): item is string => Boolean(item));
}

function blackbookFlags(entry: BlackbookEntry | null): string[] {
  if (!entry) return [];
  const dietary = [...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter((item): item is string => Boolean(item));
  const rate = entry.defaultRate !== null ? formatMoney(entry.defaultRate, entry.currency) : "";
  return [rate && entry.rateUnit ? `${rate} ${entry.rateUnit}` : rate, ...dietary].filter(Boolean);
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
  if (status === "CONFIRMED") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (status === "FIRST_OPTION") return "border-lime-300 bg-lime-100 text-lime-800";
  if (status === "SECOND_OPTION") return "border-sky-300 bg-sky-100 text-sky-800";
  if (status === "REQUESTED") return "border-violet-300 bg-violet-100 text-violet-800";
  if (status === "UNAVAILABLE") return "border-gray-300 bg-gray-100 text-gray-600";
  if (status === "RELEASED") return "border-gray-200 bg-gray-50 text-gray-400";
  if (status === "NA") return "border-gray-200 bg-white text-gray-300";
  return "border-gray-200 bg-white text-gray-300";
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

function candidateSummary(group: OptionGroup, dateId: string): string {
  const lines = group.candidates
    .filter((candidate) => candidate.activeState === "ACTIVE")
    .map((candidate) => {
      const status = statusFor(candidate, dateId)?.status;
      return status ? `${candidate.name}: ${label(status)}` : `${candidate.name}: no request`;
    });
  return lines.length ? lines.join("\n") : "No candidates yet";
}

function PillDropdown<T extends string>({ value, options, onChange, classNameForValue, placeholder = "blank" }: {
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => Promise<void>;
  classNameForValue: (value: T | null) => string;
  placeholder?: string;
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
      <button onClick={() => setOpen((current) => !current)} className={`inline-flex min-h-7 items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold uppercase ${classNameForValue(value)}`}>
        {value ? label(value) : placeholder}
        <span className="text-[9px] opacity-60">▾</span>
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

function BlackbookLinkControl({ group, candidate, onLink, onOpenBlackbook }: {
  group: OptionGroup;
  candidate: OptionCandidate;
  onLink: (payload: { entryId?: string | null; createFromCandidate?: boolean }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(candidate.name);
  const [results, setResults] = useState<BlackbookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const entry = candidate.blackbookEntry;
  const dietary = entry ? [...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ") : "";

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

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
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={() => {
          setOpen((current) => !current);
          setQuery(candidate.name);
        }}
        className={`flex w-full min-w-0 items-center gap-2 rounded border px-2 py-1.5 text-left text-[11px] ${entry ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-400 hover:text-gray-700"}`}
        title={dietary || entry?.notes || "Link to blackbook"}
      >
        {entry ? <BookOpen size={12} /> : <Link2 size={12} />}
        <span className="min-w-0 flex-1 truncate">{entry ? "Blackbook linked" : "Link blackbook"}</span>
      </button>
      {dietary && <div className="mt-0.5 truncate text-[10px] text-amber-700">{dietary}</div>}
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
                <div className="truncate text-[11px] text-gray-400">{[item.companyName, item.email, item.city, item.country].filter(Boolean).join(" · ") || label(item.entryType)}</div>
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
            <button
              onClick={() => {
                setOpen(false);
                void onLink({ createFromCandidate: true });
              }}
              className="rounded bg-gray-900 px-2 py-1.5 text-[11px] font-medium text-white"
            >
              Create from row
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OptionsBoardView({ productionId, onBack }: { productionId: string; onBack: () => void }) {
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);
  const [openBlackbookEntryId, setOpenBlackbookEntryId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setMatrix(await api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [productionId]);

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

  async function linkBlackbook(candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean }) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}/link-blackbook`, payload));
  }

  async function deleteCandidate(candidateId: string) {
    if (!window.confirm("Delete this candidate?")) return;
    setMatrix(await api.delete(`/api/options/matrix/candidates/${candidateId}`).then(() => api.get<MatrixResponse>(`/api/options/production/${productionId}/matrix`)));
  }

  async function updateCandidateDate(candidateId: string, dateId: string, status: HoldStatus | null) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}/dates/${dateId}`, { status }));
  }

  if (loading || !matrix) return <div className="grid h-full place-items-center text-sm text-gray-400">Loading options matrix...</div>;

  const selectedGroup = matrix.groups.find((group) => group.id === selectedGroupId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 px-4">
        <button onClick={selectedGroup ? () => setSelectedGroupId(null) : onBack} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={15} /> {selectedGroup ? "Matrix" : `${matrix.production.jobCode ?? "Production"} ${matrix.production.brand ?? matrix.production.clientName ?? ""}`}
        </button>
        <div className="min-w-0 text-center">
          <h2 className="truncate text-base font-semibold text-gray-900">{selectedGroup ? `${selectedGroup.name} options` : "Options Matrix"}</h2>
          <p className="text-[11px] text-gray-400">{selectedGroup ? "Candidate sheet for this role/service" : "Requirements by production date"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!selectedGroup && <button onClick={() => setShowDateForm(true)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Date</button>}
          {!selectedGroup && <button onClick={() => setShowRoleForm(true)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white">+ Role / service</button>}
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
          onDeleteCandidate={deleteCandidate}
          onAddCandidate={() => addCandidate(selectedGroup.id)}
        />
      ) : (
        <MatrixTable
          matrix={matrix}
          onOpenGroup={setSelectedGroupId}
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

function CandidateSheet({ group, dates, onUpdateCandidate, onLinkBlackbook, onOpenBlackbook, onUpdateCandidateDate, onDeleteCandidate, onAddCandidate }: {
  group: OptionGroup;
  dates: MatrixDate[];
  onUpdateCandidate: (candidateId: string, patch: Partial<OptionCandidate>) => Promise<void>;
  onLinkBlackbook: (candidateId: string, payload: { entryId?: string | null; createFromCandidate?: boolean }) => Promise<void>;
  onOpenBlackbook: (entryId: string) => void;
  onUpdateCandidateDate: (candidateId: string, dateId: string, status: HoldStatus | null) => Promise<void>;
  onDeleteCandidate: (candidateId: string) => Promise<void>;
  onAddCandidate: () => Promise<void>;
}) {
  const gridColumns = `300px 180px 180px 95px 120px ${dates.map(() => "126px").join(" ")} 44px`;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-max">
        <div className="sticky top-0 z-20 grid min-h-9 items-center gap-x-3 border-b border-gray-200 bg-[#f8f8f6] px-3 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: gridColumns }}>
          <div>Blackbook source</div><div>Project option</div><div>Project note</div><div className="text-right">Project rate</div><div>State</div>
          {dates.map((date) => <div key={date.id} className="text-center">{dateLabel(date)}</div>)}
          <div />
        </div>
        {group.candidates.map((candidate) => (
          <div key={candidate.id} className={`grid min-h-[64px] items-center gap-x-3 border-b border-gray-100 px-3 py-2 text-xs hover:bg-[#f8f8f6] ${candidate.activeState === "RELEASED" ? "opacity-45" : ""}`} style={{ gridTemplateColumns: gridColumns }}>
            <div className="min-w-0">
              {candidate.blackbookEntry ? (
                <button onClick={() => onOpenBlackbook(candidate.blackbookEntry!.id)} className="block w-full min-w-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-left hover:border-emerald-300">
                  <div className="flex items-center gap-2">
                    <BookOpen size={12} className="shrink-0 text-emerald-700" />
                    <span className="truncate text-xs font-semibold text-emerald-900">{candidate.blackbookEntry.displayName}</span>
                    <span className="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-emerald-700">Source</span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-emerald-700">{blackbookMeta(candidate.blackbookEntry).join(" · ") || "Master Blackbook record"}</div>
                  {blackbookFlags(candidate.blackbookEntry).length > 0 && <div className="mt-1 truncate text-[10px] text-amber-700">{blackbookFlags(candidate.blackbookEntry).join(" · ")}</div>}
                </button>
              ) : (
                <div className="rounded border border-dashed border-gray-200 bg-white px-2 py-1.5">
                  <div className="text-[11px] text-gray-400">No Blackbook source linked</div>
                  <div className="mt-1">
                    <BlackbookLinkControl group={group} candidate={candidate} onLink={(payload) => onLinkBlackbook(candidate.id, payload)} onOpenBlackbook={onOpenBlackbook} />
                  </div>
                </div>
              )}
              {candidate.blackbookEntry && (
                <div className="mt-1">
                  <BlackbookLinkControl group={group} candidate={candidate} onLink={(payload) => onLinkBlackbook(candidate.id, payload)} onOpenBlackbook={onOpenBlackbook} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <EditableText value={candidate.name} onSave={(name) => onUpdateCandidate(candidate.id, { name })} className="font-semibold text-gray-900" placeholder="Project alias" />
              {candidate.blackbookEntry && candidate.name !== candidate.blackbookEntry.displayName && <div className="mt-1 truncate text-[10px] text-gray-400">Alias for this option</div>}
            </div>
            <EditableText value={candidate.subtitle ?? ""} onSave={(subtitle) => onUpdateCandidate(candidate.id, { subtitle })} className="text-gray-500" placeholder="Subtitle" />
            <EditableText value={candidate.rate?.toString() ?? ""} onSave={(rate) => onUpdateCandidate(candidate.id, { rate: rate ? Number(rate) : null })} className="text-right tabular-nums text-gray-700" placeholder="0" />
            <PillDropdown value={candidate.activeState} options={["ACTIVE", "PARKED", "RELEASED"] as const} onChange={(activeState) => activeState ? onUpdateCandidate(candidate.id, { activeState }) : Promise.resolve()} classNameForValue={(state) => state === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "PARKED" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-500"} />
            {dates.map((date) => {
              const status = statusFor(candidate, date.id)?.status ?? null;
              return (
                <PillDropdown
                  key={date.id}
                  value={status}
                  options={HOLD_STATUSES}
                  onChange={(nextStatus) => onUpdateCandidateDate(candidate.id, date.id, nextStatus)}
                  classNameForValue={holdClass}
                  placeholder="blank"
                />
              );
            })}
            <button onClick={() => onDeleteCandidate(candidate.id)} className="grid h-8 w-8 place-items-center rounded text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
          </div>
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
