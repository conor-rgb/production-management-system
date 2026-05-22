import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";

type RequirementType = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";
type RequirementState = "ACTIVE" | "PARKED" | "RELEASED";
type CandidateState = "ACTIVE" | "PARKED" | "RELEASED";
type HoldStatus = "REQUESTED" | "FIRST_OPTION" | "SECOND_OPTION" | "CONFIRMED" | "RELEASED" | "UNAVAILABLE" | "NA";
type PipelineState = "NOT_REQUIRED" | "NEEDED" | "REQUESTED" | "SECOND_OPTION" | "FIRST_OPTION" | "CONFIRMED" | "UNAVAILABLE" | "RELEASED";
type ProductionDateType = "PPM" | "RECCE" | "FITTING" | "MEETING" | "SHOOT_DAY" | "POST_DELIVERY" | "OTHER";
type ProductionDateStatus = "PROPOSED" | "OPTIONED" | "CONFIRMED" | "RELEASED" | "CANCELLED";

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
}

interface OptionCandidate {
  id: string;
  productionId: string;
  groupId: string;
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

const PIPELINE_ORDER: HoldStatus[] = ["CONFIRMED", "FIRST_OPTION", "SECOND_OPTION", "REQUESTED", "UNAVAILABLE", "RELEASED", "NA"];

function label(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

function dateLabel(date: MatrixDate): string {
  const formatted = new Date(date.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${date.label || label(date.dateType)} ${formatted}`;
}

function needFor(requirement: OptionRequirement, dateId: string): RequirementDateNeed | undefined {
  return requirement.dateNeeds.find((need) => need.dateId === dateId);
}

function statusFor(candidate: OptionCandidate, dateId: string): CandidateDateStatus | undefined {
  return candidate.dateStatuses.find((status) => status.dateId === dateId);
}

function pipelineFor(group: OptionGroup, requirement: OptionRequirement, dateId: string): PipelineState {
  const need = needFor(requirement, dateId);
  if (!need?.isRequired) return "NOT_REQUIRED";
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

export default function OptionsBoardView({ productionId, onBack }: { productionId: string; onBack: () => void }) {
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);

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

  async function addCandidate(groupId: string) {
    setMatrix(await api.post<MatrixResponse>(`/api/options/matrix/groups/${groupId}/candidates`, { name: "New candidate" }));
  }

  async function updateCandidate(candidateId: string, patch: Partial<OptionCandidate>) {
    setMatrix(await api.patch<MatrixResponse>(`/api/options/matrix/candidates/${candidateId}`, patch));
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
        />
      )}

      {showRoleForm && <RoleForm productionId={productionId} onClose={() => setShowRoleForm(false)} onSaved={(data) => { setMatrix(data); setShowRoleForm(false); }} />}
      {showDateForm && <DateForm productionId={productionId} onClose={() => setShowDateForm(false)} onSaved={(data) => { setMatrix(data); setShowDateForm(false); }} />}
    </div>
  );
}

function MatrixTable({ matrix, onOpenGroup, onPatchNeed, onUpdateRequirement, onDuplicateRequirement, onDeleteRequirement, onUpdateDate }: {
  matrix: MatrixResponse;
  onOpenGroup: (groupId: string) => void;
  onPatchNeed: (requirementId: string, dateId: string, isRequired: boolean) => Promise<void>;
  onUpdateRequirement: (requirementId: string, patch: Partial<OptionRequirement>) => Promise<void>;
  onDuplicateRequirement: (requirementId: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string) => Promise<void>;
  onUpdateDate: (dateId: string, patch: Partial<MatrixDate>) => Promise<void>;
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
              return (
                <button
                  key={date.id}
                  title={candidateSummary(group, date.id)}
                  onClick={() => onPatchNeed(requirement.id, date.id, !isRequired)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onOpenGroup(group.id);
                  }}
                  className={`mx-auto inline-flex min-h-8 min-w-[82px] items-center justify-center rounded border px-2 text-[11px] font-semibold ${pipelineClass(pipeline)}`}
                >
                  {isRequired ? shortPipeline(pipeline) : ""}
                </button>
              );
            })}
          </div>
        )))}
      </div>
    </div>
  );
}

function CandidateSheet({ group, dates, onUpdateCandidate, onUpdateCandidateDate, onDeleteCandidate, onAddCandidate }: {
  group: OptionGroup;
  dates: MatrixDate[];
  onUpdateCandidate: (candidateId: string, patch: Partial<OptionCandidate>) => Promise<void>;
  onUpdateCandidateDate: (candidateId: string, dateId: string, status: HoldStatus | null) => Promise<void>;
  onDeleteCandidate: (candidateId: string) => Promise<void>;
  onAddCandidate: () => Promise<void>;
}) {
  const gridColumns = `220px 150px 95px 120px ${dates.map(() => "126px").join(" ")} 44px`;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-max">
        <div className="sticky top-0 z-20 grid min-h-9 items-center gap-x-3 border-b border-gray-200 bg-[#f8f8f6] px-3 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: gridColumns }}>
          <div>Name</div><div>Subtitle</div><div className="text-right">Rate</div><div>State</div>
          {dates.map((date) => <div key={date.id} className="text-center">{dateLabel(date)}</div>)}
          <div />
        </div>
        {group.candidates.map((candidate) => (
          <div key={candidate.id} className={`grid min-h-12 items-center gap-x-3 border-b border-gray-100 px-3 text-xs hover:bg-[#f8f8f6] ${candidate.activeState === "RELEASED" ? "opacity-45" : ""}`} style={{ gridTemplateColumns: gridColumns }}>
            <EditableText value={candidate.name} onSave={(name) => onUpdateCandidate(candidate.id, { name })} className="font-semibold text-gray-900" placeholder="Candidate" />
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
