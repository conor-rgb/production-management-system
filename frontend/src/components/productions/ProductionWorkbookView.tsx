import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, Key, ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, ListFilter, Plus, RefreshCw, Save, Search, Send, Table2, UserPlus, XCircle } from "lucide-react";
import { ApiError, api } from "../../lib/api";
import type {
  Production,
  ProductionSheet,
  ProductionSheetRow,
  ProductionWorkbook,
  ProductionWorkbookResponse,
  ProductionWorkbookRowStatus,
  ProductionWorkbookSheetType,
} from "../../lib/types";
import { PRODUCTION_STATUS_LABELS } from "../../lib/types";

type ArchiveLink = { key: string; label: string; tab: string; url: string };
type ArchiveLinksResponse = { links: ArchiveLink[] };
type SaveState = "idle" | "saving" | "saved" | "error";
type RowAction = "confirm" | "release" | "chase" | "request" | "first-option" | "second-option" | "park";
type SetupDraft = {
  date: string;
  dateLabel: string;
  workstream: string;
  roleName: string;
  roleType: string;
  roleQuantity: string;
};
type BlackbookEntry = {
  id: string;
  displayName: string;
  entryType: string;
  category: string;
  companyName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  defaultRate?: number | null;
  rateUnit?: string | null;
  currency?: string | null;
};
type QuickBlackbookDraft = {
  displayName: string;
  entryType: string;
  category: string;
  companyName: string;
  jobTitle: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  country: string;
  defaultRate: string;
  rateUnit: string;
  currency: string;
  notes: string;
  forceCreate: boolean;
};
type RoleTarget = {
  id: string;
  groupId: string;
  roleRequirementId?: string;
  label: string;
  department: string;
  type: string;
  lifecycle: "Active" | "Parked" | "Released";
};
type WorkbookDate = { id: string; date?: string; label?: string | null; dateType?: string; status?: string; time?: string | null; location?: string | null; notes?: string | null };
type ScopeDateDraft = {
  date: string;
  dateType: string;
  label: string;
  status: string;
  time: string;
  location: string;
  notes: string;
};

const defaultCrewDepartments = [
  "Production",
  "Photo",
  "Motion",
  "Glam",
  "Styling / Wardrobe",
  "Art Department",
  "Set Design / Props",
  "Locations",
  "Casting / Talent",
  "Catering",
  "Transport",
  "Travel",
  "Post",
  "Client / Agency",
  "Health & Safety",
];

const productionDateTypes = ["PPM", "RECCE", "FITTING", "BUILD", "MEETING", "SHOOT_DAY", "STRIKE", "POST_DELIVERY", "OTHER"];
const productionDateStatuses = ["PROPOSED", "OPTIONED", "CONFIRMED", "RELEASED", "CANCELLED"];
const scopeDatePresets = [
  { label: "Fitting", dateType: "FITTING" },
  { label: "Build", dateType: "BUILD" },
  { label: "Shoot", dateType: "SHOOT_DAY" },
  { label: "Strike", dateType: "STRIKE" },
  { label: "Delivery", dateType: "POST_DELIVERY" },
  { label: "Recce", dateType: "RECCE" },
  { label: "PPM", dateType: "PPM" },
];

type Column = {
  key: keyof ProductionSheetRow | `data.${string}`;
  label: string;
  type?: "text" | "date" | "status";
  width?: string;
};

const sheetLabels: Record<ProductionWorkbookSheetType, string> = {
  DASHBOARD: "Dashboard",
  SCOPE_DATES: "Scope & Dates",
  ROLE_PLAN: "Role Plan",
  OPTIONS_HOLDS: "Options & Holds",
  CONFIRMED_TEAM: "Crew List",
  LOCATIONS: "Locations",
  ARTISTS_TALENT: "Artists / Talent",
  CATERING: "Catering",
  TODO: "To Do",
  TIMELINE: "Timeline",
  RUN_OF_SHOW: "Run of Show",
  CREW: "Crew",
  HOLDS: "Holds",
  TRAVEL: "Travel",
  HOTELS: "Hotels",
  CARS: "Cars",
  EQUIPMENT: "Equipment",
  DELIVERIES: "Deliveries",
  TASKS_CHASES: "Tasks / Chases",
  FILES_COMMS: "Files/Comms",
};

const rowStatuses: ProductionWorkbookRowStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "DONE",
  "CANCELLED",
  "REQUESTED",
  "FIRST_OPTION",
  "SECOND_OPTION",
  "CONFIRMED",
  "RELEASED",
  "PARKED",
  "NEEDS_CHASE",
  "SENT",
  "READY",
  "INTERNAL",
];

const statusLabels: Record<ProductionWorkbookRowStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
  REQUESTED: "Requested",
  FIRST_OPTION: "1st option",
  SECOND_OPTION: "2nd option",
  CONFIRMED: "Confirmed",
  RELEASED: "Released",
  PARKED: "Parked",
  NEEDS_CHASE: "Needs chase",
  SENT: "Sent",
  READY: "Ready",
  INTERNAL: "Internal",
};

const statusClass: Record<ProductionWorkbookRowStatus, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  WAITING: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-800",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-gray-200 text-gray-500",
  REQUESTED: "bg-violet-100 text-violet-800",
  FIRST_OPTION: "bg-cyan-100 text-cyan-800",
  SECOND_OPTION: "bg-sky-100 text-sky-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  RELEASED: "bg-gray-200 text-gray-500",
  PARKED: "bg-stone-100 text-stone-700",
  NEEDS_CHASE: "bg-orange-100 text-orange-800",
  SENT: "bg-indigo-100 text-indigo-800",
  READY: "bg-teal-100 text-teal-800",
  INTERNAL: "bg-zinc-100 text-zinc-700",
};

const baseColumns: Column[] = [
  { key: "status", label: "Status", type: "status", width: "150px" },
  { key: "date", label: "Date", type: "date", width: "138px" },
  { key: "title", label: "Item", width: "260px" },
  { key: "workstream", label: "Workstream", width: "170px" },
  { key: "owner", label: "Owner", width: "170px" },
  { key: "location", label: "Location", width: "220px" },
  { key: "notes", label: "Notes", width: "320px" },
];

const sheetColumns: Partial<Record<ProductionWorkbookSheetType, Column[]>> = {
  SCOPE_DATES: [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "date", label: "Date", type: "date", width: "138px" },
    { key: "title", label: "Date / Scope", width: "250px" },
    { key: "workstream", label: "Workstream", width: "180px" },
    { key: "location", label: "Location", width: "230px" },
    { key: "data.time", label: "Time", width: "110px" },
    { key: "notes", label: "Notes", width: "340px" },
  ],
  ROLE_PLAN: [
    { key: "title", label: "Role / Slot", width: "240px" },
    { key: "data.groupType", label: "Type", width: "130px" },
    { key: "data.requiredDatesSummary", label: "Needed On", width: "240px" },
    { key: "data.assignedCount", label: "Filled", width: "100px" },
    { key: "notes", label: "Rate / Notes", width: "360px" },
  ],
  OPTIONS_HOLDS: optionColumns("Option / Hold"),
  LOCATIONS: optionColumns("Location"),
  ARTISTS_TALENT: optionColumns("Artist / Talent"),
  CATERING: optionColumns("Catering"),
  CONFIRMED_TEAM: [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "title", label: "Crew / Supplier", width: "240px" },
    { key: "workstream", label: "Role / Area", width: "190px" },
    { key: "owner", label: "Contact", width: "170px" },
    { key: "data.email", label: "Email", width: "230px" },
    { key: "data.phone", label: "Phone", width: "150px" },
    { key: "data.rate", label: "Rate", width: "110px" },
    { key: "data.itineraryState", label: "Itinerary", width: "130px" },
    { key: "notes", label: "Notes", width: "340px" },
  ],
  CREW: [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "title", label: "Name", width: "220px" },
    { key: "owner", label: "Role", width: "180px" },
    { key: "data.email", label: "Email", width: "230px" },
    { key: "data.phone", label: "Phone", width: "150px" },
    { key: "data.callTime", label: "Call", width: "110px" },
    { key: "data.wrapTime", label: "Wrap", width: "110px" },
    { key: "notes", label: "Notes", width: "320px" },
  ],
  HOLDS: [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "title", label: "Hold", width: "240px" },
    { key: "workstream", label: "Area", width: "180px" },
    { key: "owner", label: "Contact", width: "170px" },
    { key: "location", label: "Location", width: "220px" },
    { key: "data.email", label: "Email", width: "230px" },
    { key: "data.phone", label: "Phone", width: "150px" },
    { key: "notes", label: "Notes", width: "320px" },
  ],
  TRAVEL: travelColumns("Route"),
  HOTELS: travelColumns("Hotel / Stay"),
  CARS: travelColumns("Car / Transfer"),
  FILES_COMMS: [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "date", label: "Date", type: "date", width: "138px" },
    { key: "title", label: "File / Thread", width: "320px" },
    { key: "owner", label: "From", width: "180px" },
    { key: "data.kind", label: "Kind", width: "110px" },
    { key: "notes", label: "Snippet / Notes", width: "420px" },
  ],
  TASKS_CHASES: baseColumns,
};

function optionColumns(titleLabel: string): Column[] {
  return [
    { key: "status", label: "Status", type: "status", width: "150px" },
    { key: "title", label: titleLabel, width: "240px" },
    { key: "workstream", label: "Role / Area", width: "180px" },
    { key: "owner", label: "Contact", width: "170px" },
    { key: "location", label: "Location", width: "220px" },
    { key: "data.rate", label: "Rate", width: "110px" },
    { key: "data.email", label: "Email", width: "230px" },
    { key: "data.phone", label: "Phone", width: "150px" },
    { key: "notes", label: "Notes", width: "340px" },
  ];
}

function travelColumns(titleLabel: string): Column[] {
  return [
    { key: "status", label: "Status", type: "status", width: "140px" },
    { key: "date", label: "Date", type: "date", width: "138px" },
    { key: "title", label: titleLabel, width: "240px" },
    { key: "owner", label: "Person", width: "170px" },
    { key: "data.startTime", label: "Start", width: "100px" },
    { key: "data.endTime", label: "End", width: "100px" },
    { key: "data.provider", label: "Provider", width: "180px" },
    { key: "data.bookingReference", label: "Booking Ref", width: "170px" },
    { key: "location", label: "Location", width: "240px" },
    { key: "notes", label: "Notes", width: "320px" },
  ];
}

function columnsFor(sheetType: ProductionWorkbookSheetType): Column[] {
  if (sheetType === "DASHBOARD") return [];
  return sheetColumns[sheetType] ?? baseColumns;
}

function formatDateInput(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function displayValue(row: ProductionSheetRow, key: Column["key"]): string {
  if (key.startsWith("data.")) {
    const value = row.data?.[key.slice(5)];
    if (value === null || value === undefined) return "";
    return String(value);
  }
  const value = row[key as keyof ProductionSheetRow];
  if (value === null || value === undefined) return "";
  if (key === "date") return formatDateInput(String(value));
  return String(value);
}

function stringish(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function rowPatch(key: Column["key"], value: string): { dataKey: string; value: string } | { field: string; value: string } {
  if (key.startsWith("data.")) return { dataKey: key.slice(5), value };
  return { field: String(key), value };
}

function roleTargetsFromWorkbook(workbook: ProductionWorkbook | null): RoleTarget[] {
  const roleSheet = workbook?.sheets.find((sheet) => sheet.type === "ROLE_PLAN");
  if (!roleSheet) return [];
  return roleSheet.rows
    .filter((row) => row.sourceEntityType === "OptionRequirement" && stringValue(row.data?.groupId))
    .map((row) => {
      const label = row.title || stringValue(row.data?.roleLabel) || stringValue(row.data?.groupName) || "Role slot";
      return {
        id: row.id,
        groupId: stringValue(row.data?.groupId),
        roleRequirementId: row.sourceEntityId ?? undefined,
        label,
        department: row.workstream || stringValue(row.data?.department) || "Production",
        type: stringValue(row.data?.groupType) || "CREW",
        lifecycle: roleLifecycle(row),
      };
    });
}

function targetMatchesSheet(target: RoleTarget, sheet: ProductionWorkbookSheetType): boolean {
  if (sheet === "LOCATIONS") return target.type === "LOCATION" || target.department === "Locations";
  if (sheet === "ARTISTS_TALENT") return target.type === "TALENT" || target.department === "Casting / Talent";
  if (sheet === "CATERING") return target.type === "SERVICE" || target.department === "Catering";
  return true;
}

function workbookDatesFromContext(workbook: ProductionWorkbook | null, key: "dates" | "roleAssignableDates"): WorkbookDate[] {
  const dates = workbook?.context?.[key] ?? [];
  return dates.map((date) => ({
    id: stringValue(date.id),
    date: stringValue(date.date),
    label: stringValue(date.label) || null,
    dateType: stringValue(date.dateType) || "OTHER",
    status: stringValue(date.status) || "PROPOSED",
    time: stringValue(date.time) || null,
    location: stringValue(date.location) || null,
    notes: stringValue(date.notes) || null,
  })).filter((date) => date.id);
}

function dateTypeLabel(type: string): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateStatusLabel(status: string): string {
  return dateTypeLabel(status);
}

function defaultTypeForDepartment(department: string): string {
  if (department === "Locations") return "LOCATION";
  if (department === "Casting / Talent") return "TALENT";
  if (department === "Catering") return "SERVICE";
  if (department === "Set Design / Props") return "EQUIPMENT";
  if (department === "Transport" || department === "Travel") return "TRANSPORT";
  if (department === "Post") return "POST";
  if (department === "Client / Agency" || department === "Health & Safety") return "OTHER";
  return "CREW";
}

function requiredDateIds(row: ProductionSheetRow): Set<string> {
  const dates = Array.isArray(row.data?.datesNeeded) ? row.data.datesNeeded : [];
  return new Set(dates.map((item) => typeof item === "object" && item !== null && "id" in item ? stringValue((item as Record<string, unknown>).id) : "").filter(Boolean));
}

function dateShortLabel(date: WorkbookDate): string {
  const parsed = date.date ? new Date(date.date) : null;
  const formatted = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  return [date.label, formatted].filter(Boolean).join(" ") || "Date";
}

function roleOptionGroups(rows: ProductionSheetRow[], roleTargets: RoleTarget[], showInactiveRoles: boolean): Array<{ label: string; groups: Array<{ label: string; rows: ProductionSheetRow[]; target?: RoleTarget }> }> {
  const departments = new Map<string, Map<string, ProductionSheetRow[]>>();
  const targetsByGroup = new Map(roleTargets.map((target) => [target.groupId, target]));
  const targetByDepartmentAndLabel = new Map(roleTargets.map((target) => [`${target.department}::${target.label}`, target]));
  for (const target of roleTargets.filter((target) => target.lifecycle === "Active" || showInactiveRoles)) {
    if (!departments.has(target.department)) departments.set(target.department, new Map());
    const groups = departments.get(target.department);
    if (groups && !groups.has(target.label)) groups.set(target.label, []);
  }
  for (const row of rows) {
    const department = row.workstream || stringValue(row.data?.department) || "Production";
    const label = stringValue(row.data?.roleLabel) || stringValue(row.data?.groupName) || row.owner || "Unassigned";
    const target = targetsByGroup.get(stringValue(row.data?.groupId));
    if (target && target.lifecycle !== "Active" && !showInactiveRoles) continue;
    if (!departments.has(department)) departments.set(department, new Map());
    const groups = departments.get(department);
    groups?.set(label, [...(groups.get(label) ?? []), row]);
  }
  return Array.from(departments.entries())
    .sort(([a], [b]) => departmentSort(a) - departmentSort(b))
    .map(([label, groups]) => ({
      label,
      groups: Array.from(groups.entries()).map(([groupLabel, groupRows]) => ({
        label: groupLabel,
        rows: groupRows,
        target: targetByDepartmentAndLabel.get(`${label}::${groupLabel}`),
      })),
    }));
}

function roleLifecycle(row: ProductionSheetRow): "Active" | "Parked" | "Released" {
  if (row.status === "PARKED") return "Parked";
  if (row.status === "RELEASED") return "Released";
  return "Active";
}

function roleSlotStatsByGroup(rows: ProductionSheetRow[]): Map<string, { assigned: number; required: number }> {
  const stats = new Map<string, { assigned: number; required: number }>();
  for (const row of rows) {
    const groupId = stringValue(row.data?.groupId);
    if (!groupId) continue;
    const current = stats.get(groupId) ?? { assigned: 0, required: 0 };
    if (row.status !== "RELEASED") current.required += 1;
    current.assigned += Number(row.data?.assignedCount ?? 0);
    stats.set(groupId, current);
  }
  return stats;
}

function optionStatsByGroup(rows: ProductionSheetRow[]): Map<string, { total: number; confirmed: number }> {
  const stats = new Map<string, { total: number; confirmed: number }>();
  for (const row of rows) {
    const groupId = stringValue(row.data?.groupId);
    if (!groupId) continue;
    const current = stats.get(groupId) ?? { total: 0, confirmed: 0 };
    current.total += 1;
    if (row.status === "CONFIRMED") current.confirmed += 1;
    stats.set(groupId, current);
  }
  return stats;
}

function candidateSourceLabel(row: ProductionSheetRow): string {
  if (stringValue(row.data?.blackbookEntryId)) return stringValue(row.data?.source) === "Quick added" ? "Quick added" : "Blackbook";
  if (row.sourceEntityType === "OptionCandidate") return "Unlinked";
  return stringValue(row.data?.source) || "Manual";
}

function EditableCell({
  row,
  column,
  onSave,
}: {
  row: ProductionSheetRow;
  column: Column;
  onSave: (rowId: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [value, setValue] = useState(displayValue(row, column.key));
  const [state, setState] = useState<SaveState>("idle");

  useEffect(() => {
    setValue(displayValue(row, column.key));
    setState("idle");
  }, [row, column.key]);

  async function commit(nextValue = value) {
    if (nextValue === displayValue(row, column.key)) return;
    setState("saving");
    const patchInfo = rowPatch(column.key, nextValue);
    const patch = "dataKey" in patchInfo
      ? { data: { ...row.data, [patchInfo.dataKey]: patchInfo.value } }
      : { [patchInfo.field]: patchInfo.value || null };
    try {
      await onSave(row.id, patch);
      setState("saved");
      window.setTimeout(() => setState("idle"), 900);
    } catch {
      setState("error");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      void commit();
    }
    if (event.key === "Escape") {
      setValue(displayValue(row, column.key));
      event.currentTarget.blur();
    }
  }

  if (column.type === "status") {
    const current = (value || "TODO") as ProductionWorkbookRowStatus;
    return (
      <div className="relative">
        <select
          value={current}
          onChange={(event) => {
            setValue(event.target.value);
            void commit(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          className={`h-8 w-full rounded border border-transparent px-2 text-xs font-medium outline-none hover:border-gray-300 focus:border-[#0f8f7f] ${statusClass[current] ?? "bg-gray-100 text-gray-700"}`}
        >
          {rowStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
        <SaveIndicator state={state} />
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={value}
        type={column.type === "date" ? "date" : "text"}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKeyDown}
        className="h-8 w-full rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-gray-300 focus:border-[#0f8f7f] focus:bg-white"
      />
      <SaveIndicator state={state} />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const icon = state === "saving" ? <RefreshCw size={12} className="animate-spin" /> : state === "saved" ? <Save size={12} /> : <XCircle size={12} />;
  const colour = state === "error" ? "text-red-600" : "text-gray-400";
  return <span className={`absolute right-1 top-2 ${colour}`}>{icon}</span>;
}

function Dashboard({
  workbook,
  production,
  archiveLinks,
  setupDraft,
  setSetupDraft,
  onSetup,
  settingUp,
  onSelectSheet,
}: {
  workbook: ProductionWorkbook;
  production: Production;
  archiveLinks: ArchiveLink[];
  setupDraft: SetupDraft;
  setSetupDraft: (draft: SetupDraft) => void;
  onSetup: () => Promise<void>;
  settingUp: boolean;
  onSelectSheet: (sheet: ProductionWorkbookSheetType) => void;
}) {
  const dashboard = workbook.sheets.find((sheet) => sheet.type === "DASHBOARD")?.rows[0];
  const metadata = dashboard?.data ?? workbook.metadata ?? {};
  const facts: Array<[Key, string | number | null | undefined]> = [
    ["Job code", production.jobCode ?? stringish(metadata.jobCode)],
    ["Client", production.clientName ?? stringish(metadata.clientName)],
    ["Brand", production.brand ?? stringish(metadata.brand)],
    ["Status", PRODUCTION_STATUS_LABELS[production.status]],
    ["Quoted", typeof metadata.quotedValue === "number" ? `£${metadata.quotedValue.toLocaleString()}` : null],
    ["Actual spend", typeof metadata.actualSpend === "number" ? `£${metadata.actualSpend.toLocaleString()}` : null],
    ["Variance", typeof metadata.variance === "number" ? `£${metadata.variance.toLocaleString()}` : null],
  ];

  const allRows = workbook.sheets.flatMap((sheet) => sheet.rows.map((row) => ({ ...row, sheetTitle: sheet.title, sheetTypeValue: sheet.type })));
  const needsDecision = allRows.filter((row) => ["REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "WAITING", "NEEDS_CHASE", "BLOCKED"].includes(row.status ?? "")).slice(0, 8);
  const missingRoles = workbook.sheets.find((sheet) => sheet.type === "ROLE_PLAN")?.rows.filter((row) => row.status !== "CONFIRMED" && row.status !== "DONE").slice(0, 8) ?? [];
  const holds = workbook.sheets.find((sheet) => sheet.type === "OPTIONS_HOLDS")?.rows.filter((row) => ["REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "NEEDS_CHASE"].includes(row.status ?? "")).slice(0, 8) ?? [];
  const confirmed = workbook.sheets.find((sheet) => sheet.type === "CONFIRMED_TEAM")?.rows ?? [];
  const travelRows = ["TRAVEL", "HOTELS", "CARS"].reduce((sum, type) => sum + (workbook.sheets.find((sheet) => sheet.type === type)?.rows.length ?? 0), 0);
  const setupDisabled = !setupDraft.date && !setupDraft.workstream.trim() && !setupDraft.roleName.trim();

  return (
    <div className="grid gap-5 overflow-auto p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div className="mb-4 border-b border-gray-200 pb-3">
          <h2 className="text-xl font-semibold text-gray-950">{production.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{String(metadata.description ?? production.notes ?? "")}</p>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-950">Build Job</h3>
              <p className="text-xs text-gray-500">Create dates, scope lanes, and required role slots from one place.</p>
            </div>
            <button
              onClick={() => void onSetup()}
              disabled={settingUp || setupDisabled}
              className="inline-flex h-8 items-center gap-2 rounded-md bg-[#0f8f7f] px-3 text-sm font-medium text-white hover:bg-[#0b7569] disabled:opacity-50"
            >
              {settingUp ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add setup
            </button>
          </div>
          <div className="grid gap-2 lg:grid-cols-[150px_1fr_1fr_170px_140px_90px]">
            <input type="date" value={setupDraft.date} onChange={(event) => setSetupDraft({ ...setupDraft, date: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]" />
            <input value={setupDraft.dateLabel} onChange={(event) => setSetupDraft({ ...setupDraft, dateLabel: event.target.value })} placeholder="Date label: shoot day, fitting, delivery" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            <input value={setupDraft.workstream} onChange={(event) => setSetupDraft({ ...setupDraft, workstream: event.target.value })} placeholder="Scope lane: casting, locations, catering" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            <input value={setupDraft.roleName} onChange={(event) => setSetupDraft({ ...setupDraft, roleName: event.target.value })} placeholder="Role/supplier slot" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            <select value={setupDraft.roleType} onChange={(event) => setSetupDraft({ ...setupDraft, roleType: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
              {["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"].map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
            </select>
            <input value={setupDraft.roleQuantity} onChange={(event) => setSetupDraft({ ...setupDraft, roleQuantity: event.target.value })} placeholder="Qty" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CommandMetric label="Decisions" value={needsDecision.length} tone={needsDecision.length ? "amber" : "green"} />
          <CommandMetric label="Missing roles" value={missingRoles.length} tone={missingRoles.length ? "amber" : "green"} />
          <CommandMetric label="Active holds" value={holds.length} tone={holds.length ? "blue" : "green"} />
          <CommandMetric label="Confirmed" value={confirmed.length} tone="green" />
          <CommandMetric label="Logistics rows" value={travelRows} tone={travelRows < confirmed.length ? "amber" : "blue"} />
          <CommandMetric label="Workstreams" value={workbook.context?.workstreams?.length ?? 0} tone="neutral" />
          <CommandMetric label="Dates" value={workbook.context?.dates?.length ?? 0} tone="neutral" />
          <CommandMetric label="Option groups" value={workbook.context?.optionGroups?.length ?? 0} tone="neutral" />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <CommandPanel title="Next Decisions" empty="No urgent decisions.">
            {needsDecision.map((row) => (
              <button key={`${row.sheetTypeValue}-${row.id}`} onClick={() => onSelectSheet(row.sheetTypeValue)} className="block w-full border-b border-gray-100 py-2 text-left last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-950">{row.title ?? "Untitled"}</span>
                  {row.status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass[row.status]}`}>{statusLabels[row.status]}</span>}
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{[row.sheetTitle, row.workstream, row.owner].filter(Boolean).join(" · ")}</p>
              </button>
            ))}
          </CommandPanel>
          <CommandPanel title="Role Slots" empty="No missing role slots.">
            {missingRoles.map((row) => (
              <button key={row.id} onClick={() => onSelectSheet("ROLE_PLAN")} className="block w-full border-b border-gray-100 py-2 text-left last:border-b-0">
                <p className="truncate text-sm font-medium text-gray-950">{row.title ?? "Role"}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{[row.workstream, row.notes].filter(Boolean).join(" · ")}</p>
              </button>
            ))}
          </CommandPanel>
          <CommandPanel title="Holds To Work" empty="No active holds.">
            {holds.map((row) => (
              <button key={row.id} onClick={() => onSelectSheet("OPTIONS_HOLDS")} className="block w-full border-b border-gray-100 py-2 text-left last:border-b-0">
                <p className="truncate text-sm font-medium text-gray-950">{row.title ?? "Hold"}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{[row.status ? statusLabels[row.status] : null, row.workstream, row.owner].filter(Boolean).join(" · ")}</p>
              </button>
            ))}
          </CommandPanel>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workbook.sheets.filter((sheet) => sheet.type !== "DASHBOARD").map((sheet) => (
            <button key={sheet.id} onClick={() => onSelectSheet(sheet.type)} className="rounded-md border border-gray-200 bg-white p-4 text-left hover:border-[#0f8f7f]">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{sheetLabels[sheet.type] ?? sheet.title}</div>
              <div className="mt-2 text-2xl font-semibold text-gray-950">{sheet.rows.length}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Production Snapshot</h3>
          <dl className="space-y-3">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[105px_1fr] gap-3 text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="min-w-0 truncate font-medium text-gray-900">{value ? String(value) : "-"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Archive Tools</h3>
          <div className="grid gap-2">
            {archiveLinks.map((link) => (
              <a key={link.key} href={link.url} className="inline-flex h-9 items-center justify-between rounded-md border border-gray-200 px-3 text-sm text-gray-700 hover:border-gray-300 hover:text-gray-950">
                {link.label}
                <ExternalLink size={13} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandMetric({ label, value, tone }: { label: string; value: number; tone: "neutral" | "green" | "amber" | "blue" }) {
  const classes = tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-950";
  return (
    <div className={`rounded-md border p-4 ${classes}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function CommandPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-950">{title}</h3>
      {hasItems ? children : <p className="py-4 text-sm text-gray-500">{empty}</p>}
    </div>
  );
}

export default function ProductionWorkbookView({ production, onBack }: { production: Production; onBack: () => void }) {
  const [workbook, setWorkbook] = useState<ProductionWorkbook | null>(null);
  const [activeSheetType, setActiveSheetType] = useState<ProductionWorkbookSheetType>("DASHBOARD");
  const [archiveLinks, setArchiveLinks] = useState<ArchiveLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [actioningRowId, setActioningRowId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<ProductionSheetRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProductionWorkbookRowStatus | "ALL">("ALL");
  const [blackbookPickerOpen, setBlackbookPickerOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    date: "",
    dateLabel: "",
    workstream: "",
    roleName: "",
    roleType: "CREW",
    roleQuantity: "1",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response: ProductionWorkbookResponse;
      try {
        response = await api.get<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/bootstrap`, {});
        } else {
          throw err;
        }
      }
      if (!response.enabled || !response.workbook) {
        window.location.href = `/productions?production=${encodeURIComponent(production.id)}&legacy=true`;
        return;
      }
      setWorkbook(response.workbook);
      setActiveSheetType((current) => response.workbook?.sheets.some((sheet) => sheet.type === current) ? current : "DASHBOARD");
      if (response.workbook.context?.archiveLinks?.length) {
        setArchiveLinks(response.workbook.context.archiveLinks);
      } else {
        const archive = await api.get<ArchiveLinksResponse>(`/api/production-workbooks/${production.id}/archive-links`);
        setArchiveLinks(archive.links);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load production workbook");
    } finally {
      setLoading(false);
    }
  }, [production.id]);

  useEffect(() => { void load(); }, [load]);

  const activeSheet = useMemo(() => workbook?.sheets.find((sheet) => sheet.type === activeSheetType) ?? null, [activeSheetType, workbook]);
  const columns = activeSheet ? columnsFor(activeSheet.type) : [];
  const roleTargets = useMemo(() => roleTargetsFromWorkbook(workbook), [workbook]);
  const allWorkbookDates = useMemo(() => workbookDatesFromContext(workbook, "dates"), [workbook]);
  const workbookDates = useMemo(() => workbookDatesFromContext(workbook, "roleAssignableDates"), [workbook]);
  const [preferredBlackbookTargetId, setPreferredBlackbookTargetId] = useState<string | null>(null);

  async function saveRow(rowId: string, patch: Record<string, unknown>) {
    const response = await api.patch<{ row: ProductionSheetRow }>(`/api/production-workbooks/${production.id}/rows/${rowId}`, patch);
    setWorkbook((current) => updateWorkbookRow(current, response.row));
  }

  async function addRow() {
    if (!activeSheet || activeSheet.type === "DASHBOARD") return;
    setAdding(true);
    try {
      const defaults = manualDefaultsForSheet(activeSheet.type);
      const response = await api.post<{ row: ProductionSheetRow }>(`/api/production-workbooks/${production.id}/sheets/${activeSheet.type}/rows`, {
        title: defaults.title,
        status: defaults.status,
        data: { kind: defaults.kind },
      });
      setWorkbook((current) => addWorkbookRow(current, response.row));
      setSelectedRow(response.row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add row");
    } finally {
      setAdding(false);
    }
  }

  async function runSetup() {
    setSettingUp(true);
    setError(null);
    try {
      const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/setup`, {
        dates: setupDraft.date ? [{ date: setupDraft.date, label: setupDraft.dateLabel || "Production date", status: "PROPOSED", dateType: "OTHER" }] : [],
        workstreams: setupDraft.workstream.trim() ? [{ name: setupDraft.workstream.trim() }] : [],
        roles: setupDraft.roleName.trim() ? [{
          name: setupDraft.roleName.trim(),
          quantity: Number(setupDraft.roleQuantity || 1),
          type: setupDraft.roleType,
          workstreamName: setupDraft.workstream.trim() || undefined,
        }] : [],
      });
      if (response.workbook) setWorkbook(response.workbook);
      setSetupDraft({ date: "", dateLabel: "", workstream: "", roleName: "", roleType: "CREW", roleQuantity: "1" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build job setup");
    } finally {
      setSettingUp(false);
    }
  }

  async function rowAction(row: ProductionSheetRow, action: RowAction) {
    setActioningRowId(row.id);
    setError(null);
    try {
      if (action === "chase") {
        const response = await api.post<{ row: ProductionSheetRow }>(`/api/production-workbooks/${production.id}/rows/${row.id}/chase`, {});
        setWorkbook((current) => updateWorkbookRow(current, response.row));
        setSelectedRow(response.row);
      } else if (action === "request" || action === "first-option" || action === "second-option" || action === "park") {
        const status = action === "first-option" ? "FIRST_OPTION" : action === "second-option" ? "SECOND_OPTION" : action === "park" ? "PARKED" : "REQUESTED";
        const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/rows/${row.id}/status`, { status });
        if (response.workbook) setWorkbook(response.workbook);
        setSelectedRow(null);
      } else {
        const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/rows/${row.id}/${action}`, {});
        if (response.workbook) setWorkbook(response.workbook);
        setSelectedRow(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} row`);
    } finally {
      setActioningRowId(null);
    }
  }

  async function createRoleRequirement(department: string, payload: { name: string; type: string; quantity: number; notes?: string }) {
    setAdding(true);
    setError(null);
    try {
      const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/role-plan/requirements`, {
        department,
        ...payload,
      });
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create role");
    } finally {
      setAdding(false);
    }
  }

  async function createScopeDate(payload: ScopeDateDraft) {
    if (!payload.date) return;
    setAdding(true);
    setError(null);
    try {
      const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/scope-dates`, payload);
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create production date");
    } finally {
      setAdding(false);
    }
  }

  async function updateScopeDate(dateId: string, patch: Partial<ScopeDateDraft>) {
    setActioningRowId(dateId);
    setError(null);
    try {
      const response = await api.patch<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/scope-dates/${dateId}`, patch);
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update production date");
    } finally {
      setActioningRowId(null);
    }
  }

  async function createScopePreset(preset: { label: string; dateType: string }) {
    const today = new Date().toISOString().slice(0, 10);
    await createScopeDate({ date: today, dateType: preset.dateType, label: preset.label, status: "PROPOSED", time: "", location: "", notes: "" });
  }

  async function duplicateRoleRequirement(row: ProductionSheetRow) {
    const requirementId = row.sourceEntityType === "OptionRequirement" ? row.sourceEntityId : null;
    if (!requirementId) return void duplicateRow(row);
    setActioningRowId(row.id);
    try {
      const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/role-plan/requirements/${requirementId}/duplicate`, {});
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate role");
    } finally {
      setActioningRowId(null);
    }
  }

  async function toggleRequirementDate(row: ProductionSheetRow, date: WorkbookDate, required: boolean) {
    const requirementId = row.sourceEntityType === "OptionRequirement" ? row.sourceEntityId : null;
    if (!requirementId) return;
    setActioningRowId(row.id);
    try {
      const response = await api.patch<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/role-plan/requirements/${requirementId}/dates/${date.id}`, {
        isRequired: required,
      });
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role date");
    } finally {
      setActioningRowId(null);
    }
  }

  async function assignCandidateToDate(row: ProductionSheetRow, date: WorkbookDate) {
    const requirementId = stringValue(row.data?.defaultRequirementId);
    if (!requirementId || !row.sourceEntityId) return;
    setActioningRowId(row.id);
    try {
      const response = await api.patch<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/role-plan/requirements/${requirementId}/dates/${date.id}/assignment`, {
        candidateId: row.sourceEntityId,
      });
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign candidate");
    } finally {
      setActioningRowId(null);
    }
  }

  async function syncCrewList() {
    setAdding(true);
    setError(null);
    try {
      const response = await api.post<ProductionWorkbookResponse>(`/api/production-workbooks/${production.id}/sync-crew-list`, {});
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync crew list");
    } finally {
      setAdding(false);
    }
  }

  function openBlackbookForTarget(targetId?: string | null) {
    setPreferredBlackbookTargetId(targetId ?? null);
    setBlackbookPickerOpen(true);
  }

  async function duplicateRow(row: ProductionSheetRow) {
    setAdding(true);
    try {
      const response = await api.post<{ row: ProductionSheetRow }>(`/api/production-workbooks/${production.id}/sheets/${row.sheetType}/rows`, {
        title: `${row.title ?? "Row"} copy`,
        status: row.status ?? "TODO",
        date: row.date,
        workstream: row.workstream,
        owner: row.owner,
        location: row.location,
        notes: row.notes,
        data: row.data,
      });
      setWorkbook((current) => addWorkbookRow(current, response.row));
      setSelectedRow(response.row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate row");
    } finally {
      setAdding(false);
    }
  }

  async function addFromBlackbook(entry: BlackbookEntry | null, target: RoleTarget | null, groupName: string, type: string, createBlackbook?: QuickBlackbookDraft) {
    setAdding(true);
    setError(null);
    try {
      const response = await api.post<{ workbook: ProductionWorkbook }>(`/api/production-workbooks/${production.id}/rows/from-blackbook`, {
        blackbookEntryId: entry?.id,
        createBlackbook: createBlackbook ? {
          ...createBlackbook,
          defaultRate: createBlackbook.defaultRate ? Number(createBlackbook.defaultRate) : undefined,
        } : undefined,
        roleRequirementId: target?.roleRequirementId,
        groupId: target?.groupId,
        groupName: target?.label ?? groupName,
        workstreamName: target?.department ?? groupName,
        type: target?.type ?? type,
      });
      if (response.workbook) setWorkbook(response.workbook);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add Blackbook entry");
      throw err;
    } finally {
      setAdding(false);
    }
  }

  const projectName = [production.brand, production.clientName].filter(Boolean).join(" x ") || production.title || production.jobCode || "Project";

  if (loading) {
    return <div className="grid h-full place-items-center bg-white text-sm text-gray-500">Loading workbook...</div>;
  }

  if (error || !workbook) {
    return (
      <div className="grid h-full place-items-center bg-white p-6">
        <div className="max-w-md rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Workbook could not load</p>
          <p className="mt-1">{error ?? "No workbook was returned."}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void load()} className="rounded-md bg-red-700 px-3 py-2 text-white">Retry</button>
            <a href={`/productions?production=${encodeURIComponent(production.id)}&legacy=true`} className="rounded-md border border-red-300 px-3 py-2">Open archive</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-gray-950">
      <div className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex min-h-[64px] flex-wrap items-center gap-3 px-4 py-2 lg:flex-nowrap lg:px-5">
          <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="Back to projects">
            <ArrowLeft size={17} />
          </button>
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#0f8f7f] text-white">
            <Table2 size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{projectName}</h1>
            <p className="truncate text-xs text-gray-500">{[production.jobCode, production.title, PRODUCTION_STATUS_LABELS[production.status]].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            {archiveLinks.slice(0, 5).map((link) => (
              <a key={link.key} href={link.url} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:text-gray-950">
                {link.label}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-gray-100 px-4 py-2 lg:px-5">
          {workbook.sheets.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => setActiveSheetType(sheet.type)}
              className={`h-8 shrink-0 rounded-md px-3 text-sm font-medium ${activeSheetType === sheet.type ? "bg-[#0f8f7f] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"}`}
            >
              {sheetLabels[sheet.type] ?? sheet.title}
              {sheet.type !== "DASHBOARD" && <span className="ml-2 text-xs opacity-70">{sheet.rows.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeSheet?.type === "DASHBOARD" ? (
          <Dashboard
            workbook={workbook}
            production={production}
            archiveLinks={archiveLinks}
            setupDraft={setupDraft}
            setSetupDraft={setSetupDraft}
            onSetup={runSetup}
            settingUp={settingUp}
            onSelectSheet={setActiveSheetType}
          />
        ) : activeSheet?.type === "SCOPE_DATES" ? (
          <ScopeDatesSheet
            dates={allWorkbookDates}
            assignableDates={workbookDates}
            adding={adding}
            actioningId={actioningRowId}
            onCreate={createScopeDate}
            onUpdate={updateScopeDate}
            onPreset={createScopePreset}
          />
        ) : activeSheet?.type === "ROLE_PLAN" ? (
          <RolePlanSheet
            sheet={activeSheet}
            optionsRows={workbook.sheets.find((sheet) => sheet.type === "OPTIONS_HOLDS")?.rows ?? []}
            dates={workbookDates}
            adding={adding}
            actioningRowId={actioningRowId}
            onCreateRole={createRoleRequirement}
            onSave={saveRow}
            onDuplicate={duplicateRoleRequirement}
            onRowAction={rowAction}
            onToggleDate={toggleRequirementDate}
            onAddOption={(row) => openBlackbookForTarget(row.id)}
            onSelectRow={setSelectedRow}
          />
        ) : activeSheet?.type === "OPTIONS_HOLDS" ? (
          <OptionsHoldsSheet
            sheet={activeSheet}
            roleTargets={roleTargets}
            dates={workbookDates}
            adding={adding}
            actioningRowId={actioningRowId}
            onOpenBlackbook={(targetId) => openBlackbookForTarget(targetId ?? null)}
            onRowAction={rowAction}
            onAssignDate={assignCandidateToDate}
            onSave={saveRow}
            onSelectRow={setSelectedRow}
          />
        ) : activeSheet?.type === "CONFIRMED_TEAM" ? (
          <CrewListSheet
            sheet={activeSheet}
            adding={adding}
            actioningRowId={actioningRowId}
            onSync={syncCrewList}
            onAddManual={addRow}
            onDuplicate={duplicateRow}
            onRowAction={rowAction}
            onSave={saveRow}
            onSelectRow={setSelectedRow}
          />
        ) : activeSheet ? (
          <SheetGrid
            sheet={activeSheet}
            columns={columns}
            onSave={saveRow}
            onAdd={addRow}
            adding={adding}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            onRowAction={rowAction}
            onDuplicate={duplicateRow}
            onSelectRow={setSelectedRow}
            onOpenBlackbook={() => setBlackbookPickerOpen(true)}
            actioningRowId={actioningRowId}
          />
        ) : null}
      </div>
      {selectedRow && <RowDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} onAction={rowAction} actioning={actioningRowId === selectedRow.id} />}
      {blackbookPickerOpen && activeSheet && (
        <BlackbookPickerDrawer
          sheet={activeSheet}
          roleTargets={roleTargets}
          preferredTargetId={preferredBlackbookTargetId}
          onClose={() => {
            setBlackbookPickerOpen(false);
            setPreferredBlackbookTargetId(null);
          }}
          onAdd={addFromBlackbook}
          adding={adding}
        />
      )}
    </div>
  );
}

function ScopeDatesSheet({
  dates,
  assignableDates,
  adding,
  actioningId,
  onCreate,
  onUpdate,
  onPreset,
}: {
  dates: WorkbookDate[];
  assignableDates: WorkbookDate[];
  adding: boolean;
  actioningId: string | null;
  onCreate: (payload: ScopeDateDraft) => Promise<void>;
  onUpdate: (dateId: string, patch: Partial<ScopeDateDraft>) => Promise<void>;
  onPreset: (preset: { label: string; dateType: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ScopeDateDraft>({ date: "", dateType: "SHOOT_DAY", label: "", status: "PROPOSED", time: "", location: "", notes: "" });
  const assignableIds = new Set(assignableDates.map((date) => date.id));
  async function submit() {
    if (!draft.date) return;
    await onCreate(draft);
    setDraft({ date: "", dateType: "SHOOT_DAY", label: "", status: "PROPOSED", time: "", location: "", notes: "" });
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowHeader
        title="Scope & Dates"
        subtitle={`${dates.length} scheduled dates · ${assignableDates.length} available in Role Plan`}
        action={<div className="flex gap-1 overflow-x-auto">{scopeDatePresets.map((preset) => <button key={preset.dateType} onClick={() => void onPreset(preset)} disabled={adding} className="h-8 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{preset.label}</button>)}</div>}
      />
      <div className="border-b border-gray-200 bg-white p-3">
        <div className="grid gap-2 lg:grid-cols-[150px_145px_1fr_140px_105px_180px_1fr_90px]">
          <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]" />
          <select value={draft.dateType} onChange={(event) => setDraft({ ...draft, dateType: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
            {productionDateTypes.map((type) => <option key={type} value={type}>{dateTypeLabel(type)}</option>)}
          </select>
          <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Label" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
            {productionDateStatuses.map((status) => <option key={status} value={status}>{dateStatusLabel(status)}</option>)}
          </select>
          <input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} placeholder="Time" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
          <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Location" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
          <input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Notes" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
          <button onClick={() => void submit()} disabled={adding || !draft.date} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#0f8f7f] px-3 text-sm font-medium text-white disabled:opacity-50"><Plus size={14} /> Add</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 bg-gray-50">
            <tr>
              {["Date", "Type", "Label", "Status", "Time", "Location", "Notes", "Role Plan"].map((label) => <th key={label} className="border-b border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date.id} className="hover:bg-[#f6fbfa]">
                <td className="w-[145px] border-b border-r border-gray-100 p-1"><input type="date" value={formatDateInput(date.date)} onChange={(event) => void onUpdate(date.id, { date: event.target.value })} disabled={actioningId === date.id} className="h-8 w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]" /></td>
                <td className="w-[150px] border-b border-r border-gray-100 p-1"><select value={date.dateType || "OTHER"} onChange={(event) => void onUpdate(date.id, { dateType: event.target.value })} disabled={actioningId === date.id} className="h-8 w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">{productionDateTypes.map((type) => <option key={type} value={type}>{dateTypeLabel(type)}</option>)}</select></td>
                <td className="min-w-[210px] border-b border-r border-gray-100 p-1"><InlineDateText value={date.label ?? ""} onSave={(value) => onUpdate(date.id, { label: value })} disabled={actioningId === date.id} /></td>
                <td className="w-[145px] border-b border-r border-gray-100 p-1"><select value={date.status || "PROPOSED"} onChange={(event) => void onUpdate(date.id, { status: event.target.value })} disabled={actioningId === date.id} className="h-8 w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">{productionDateStatuses.map((status) => <option key={status} value={status}>{dateStatusLabel(status)}</option>)}</select></td>
                <td className="w-[100px] border-b border-r border-gray-100 p-1"><InlineDateText value={date.time ?? ""} onSave={(value) => onUpdate(date.id, { time: value })} disabled={actioningId === date.id} /></td>
                <td className="min-w-[190px] border-b border-r border-gray-100 p-1"><InlineDateText value={date.location ?? ""} onSave={(value) => onUpdate(date.id, { location: value })} disabled={actioningId === date.id} /></td>
                <td className="min-w-[260px] border-b border-r border-gray-100 p-1"><InlineDateText value={date.notes ?? ""} onSave={(value) => onUpdate(date.id, { notes: value })} disabled={actioningId === date.id} /></td>
                <td className="w-[130px] border-b border-gray-100 px-2 py-1">{assignableIds.has(date.id) ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Available</span> : <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">Hidden</span>}</td>
              </tr>
            ))}
            {!dates.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Add project dates here to make them available in Role Plan.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolePlanSheet({
  sheet,
  optionsRows,
  dates,
  adding,
  actioningRowId,
  onCreateRole,
  onSave,
  onDuplicate,
  onRowAction,
  onToggleDate,
  onAddOption,
  onSelectRow,
}: {
  sheet: ProductionSheet;
  optionsRows: ProductionSheetRow[];
  dates: WorkbookDate[];
  adding: boolean;
  actioningRowId: string | null;
  onCreateRole: (department: string, payload: { name: string; type: string; quantity: number; notes?: string }) => Promise<void>;
  onSave: (rowId: string, patch: Record<string, unknown>) => Promise<void>;
  onDuplicate: (row: ProductionSheetRow) => Promise<void>;
  onRowAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>;
  onToggleDate: (row: ProductionSheetRow, date: WorkbookDate, required: boolean) => Promise<void>;
  onAddOption: (row: ProductionSheetRow) => void;
  onSelectRow: (row: ProductionSheetRow) => void;
}) {
  const [showReleased, setShowReleased] = useState(false);
  const visibleRows = showReleased ? sheet.rows : sheet.rows.filter((row) => row.status !== "RELEASED");
  const groups = groupRows(visibleRows, "ROLE_PLAN");
  const optionStats = optionStatsByGroup(optionsRows);
  const slotStats = roleSlotStatsByGroup(sheet.rows);
  const releasedCount = sheet.rows.filter((row) => row.status === "RELEASED").length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowHeader
        title="Role Plan"
        subtitle={`${visibleRows.length} visible slots${releasedCount ? ` · ${releasedCount} released` : ""}`}
        action={releasedCount ? (
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={showReleased} onChange={(event) => setShowReleased(event.target.checked)} className="h-4 w-4 accent-[#0f8f7f]" />
            Show released
          </label>
        ) : undefined}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 bg-gray-50">
            <tr>
              {["Role / Slot", "Type", "Needed On", "Filled", "Options", "Rate / Notes", "Actions"].map((label) => (
                <th key={label} className="border-b border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td colSpan={7} className="bg-gray-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{group.label}</span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">{group.rows.length}</span>
                      </div>
                      <InlineRoleCreator department={group.label} adding={adding} onCreate={onCreateRole} />
                    </div>
                  </td>
                </tr>
                {group.rows.length ? group.rows.map((row) => {
                  const requiredIds = requiredDateIds(row);
                  const groupId = stringValue(row.data?.groupId);
                  const roleStats = slotStats.get(groupId) ?? { assigned: Number(row.data?.assignedCount ?? 0), required: 1 };
                  const candidateStats = optionStats.get(groupId) ?? { total: 0, confirmed: 0 };
                  const lifecycle = roleLifecycle(row);
                  return (
                    <tr key={row.id} className={`${lifecycle === "Parked" ? "text-gray-500" : lifecycle === "Released" ? "bg-gray-50 text-gray-400" : "hover:bg-[#f6fbfa]"}`}>
                      <td className="min-w-[260px] border-b border-r border-gray-100 p-1">
                        <div className="flex items-center gap-2">
                          <LifecycleBadge lifecycle={lifecycle} />
                          <div className="min-w-0 flex-1"><EditableCell row={row} column={{ key: "title", label: "Role / Slot" }} onSave={onSave} /></div>
                        </div>
                      </td>
                      <td className="w-[140px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "data.groupType", label: "Type" }} onSave={onSave} /></td>
                      <td className="min-w-[280px] border-b border-r border-gray-100 px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {dates.length ? dates.map((date) => {
                            const active = requiredIds.has(date.id);
                            return (
                              <button key={date.id} onClick={() => void onToggleDate(row, date, !active)} disabled={actioningRowId === row.id} className={`h-7 rounded border px-2 text-xs ${active ? "border-[#0f8f7f] bg-[#e6f4f2] text-[#0b7569]" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                                {dateShortLabel(date)}
                              </button>
                            );
                          }) : <span className="text-xs text-gray-400">Add project dates in Scope & Dates to assign roles.</span>}
                        </div>
                      </td>
                      <td className="w-[110px] border-b border-r border-gray-100 px-2 py-1 text-gray-700">{roleStats.assigned} / {roleStats.required}</td>
                      <td className="w-[170px] border-b border-r border-gray-100 px-2 py-1 text-gray-700">{candidateStats.total} options · {candidateStats.confirmed} confirmed</td>
                      <td className="min-w-[280px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "notes", label: "Notes" }} onSave={onSave} /></td>
                      <td className="w-[260px] border-b border-gray-100 p-1">
                        <div className="flex items-center gap-1">
                          <IconTextButton onClick={() => onAddOption(row)} icon={<UserPlus size={13} />} label="Option" />
                          <IconButton onClick={() => void onDuplicate(row)} title="Duplicate role" disabled={actioningRowId === row.id}><Copy size={14} /></IconButton>
                          <IconButton onClick={() => void onRowAction(row, "park")} title="Park role" disabled={actioningRowId === row.id}><Save size={14} /></IconButton>
                          <IconButton onClick={() => void onRowAction(row, "release")} title="Release role" disabled={actioningRowId === row.id}><XCircle size={14} /></IconButton>
                          <button onClick={() => onSelectRow(row)} className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-600 hover:bg-gray-50">Detail</button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} className="border-b border-gray-100 px-3 py-3 text-sm text-gray-400">Add roles to {group.label}</td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionsHoldsSheet({
  sheet,
  roleTargets,
  dates,
  adding,
  actioningRowId,
  onOpenBlackbook,
  onRowAction,
  onAssignDate,
  onSave,
  onSelectRow,
}: {
  sheet: ProductionSheet;
  roleTargets: RoleTarget[];
  dates: WorkbookDate[];
  adding: boolean;
  actioningRowId: string | null;
  onOpenBlackbook: (targetId?: string | null) => void;
  onRowAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>;
  onAssignDate: (row: ProductionSheetRow, date: WorkbookDate) => Promise<void>;
  onSave: (rowId: string, patch: Record<string, unknown>) => Promise<void>;
  onSelectRow: (row: ProductionSheetRow) => void;
}) {
  const [showInactiveRoles, setShowInactiveRoles] = useState(false);
  const activeTargets = roleTargets.filter((target) => target.lifecycle === "Active");
  const inactiveTargetCount = roleTargets.length - activeTargets.length;
  const grouped = roleOptionGroups(sheet.rows, roleTargets, showInactiveRoles);
  const visibleCandidateCount = grouped.reduce((sum, department) => sum + department.groups.reduce((inner, group) => inner + group.rows.length, 0), 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowHeader
        title="Options & Holds"
        subtitle={`${visibleCandidateCount} visible candidates · ${activeTargets.length} active role slots`}
        action={<div className="flex items-center gap-2">
          {inactiveTargetCount > 0 && (
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={showInactiveRoles} onChange={(event) => setShowInactiveRoles(event.target.checked)} className="h-4 w-4 accent-[#0f8f7f]" />
              Show parked/released
            </label>
          )}
          <IconTextButton onClick={() => onOpenBlackbook(null)} disabled={adding || activeTargets.length === 0} icon={<UserPlus size={14} />} label="Add option" />
        </div>}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTargets.length === 0 && !sheet.rows.length ? (
          <div className="p-5 text-sm text-gray-500">Add active roles in Role Plan before adding options and holds.</div>
        ) : grouped.map((department) => (
          <section key={department.label} className="border-b border-gray-200">
            <DepartmentHeader label={department.label} count={department.groups.reduce((sum, group) => sum + group.rows.length, 0)} />
            {department.groups.map((group) => (
              <div key={group.label} className="border-t border-gray-100">
                <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                    <span>{group.label}</span>
                    {group.target?.lifecycle && group.target.lifecycle !== "Active" && <LifecycleBadge lifecycle={group.target.lifecycle} />}
                  </div>
                  {group.target?.lifecycle === "Active" && (
                    <button onClick={() => onOpenBlackbook(group.target?.id ?? null)} disabled={adding} className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><UserPlus size={13} /> Add option</button>
                  )}
                </div>
                <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                  <tbody>
                    {group.rows.length ? group.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-[#f6fbfa]">
                        <td className="w-[145px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "status", label: "Status", type: "status" }} onSave={onSave} /></td>
                        <td className="min-w-[220px] border-b border-r border-gray-100 p-1">
                          <EditableCell row={row} column={{ key: "title", label: "Candidate" }} onSave={onSave} />
                          <span className="ml-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">{candidateSourceLabel(row)}</span>
                        </td>
                        <td className="w-[170px] border-b border-r border-gray-100 px-2 py-1 text-gray-600">{stringValue(row.data?.roleLabel) || stringValue(row.data?.groupName) || row.workstream}</td>
                        <td className="w-[180px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "owner", label: "Contact" }} onSave={onSave} /></td>
                        <td className="w-[110px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "data.rate", label: "Rate" }} onSave={onSave} /></td>
                        <td className="min-w-[260px] border-b border-r border-gray-100 px-2 py-1 text-xs text-gray-600">{stringValue(row.data?.datesSummary) || "No date holds"}</td>
                        <td className="min-w-[210px] border-b border-r border-gray-100 px-2 py-1">
                          <div className="flex flex-wrap gap-1">
                            {dates.map((date) => <button key={date.id} onClick={() => void onAssignDate(row, date)} disabled={actioningRowId === row.id || !row.sourceEntityId} className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{dateShortLabel(date)}</button>)}
                          </div>
                        </td>
                        <td className="min-w-[340px] border-b border-gray-100 p-1">
                          <div className="flex items-center gap-1">
                            <StatusAction row={row} action="request" label="Request" onAction={onRowAction} disabled={actioningRowId === row.id} />
                            <StatusAction row={row} action="first-option" label="1st" onAction={onRowAction} disabled={actioningRowId === row.id} />
                            <StatusAction row={row} action="second-option" label="2nd" onAction={onRowAction} disabled={actioningRowId === row.id} />
                            <IconButton onClick={() => void onRowAction(row, "confirm")} title="Confirm" disabled={actioningRowId === row.id}><CheckCircle2 size={14} /></IconButton>
                            <IconButton onClick={() => void onRowAction(row, "release")} title="Release" disabled={actioningRowId === row.id}><XCircle size={14} /></IconButton>
                            <IconButton onClick={() => void onRowAction(row, "park")} title="Park" disabled={actioningRowId === row.id}><Save size={14} /></IconButton>
                            <IconButton onClick={() => void onRowAction(row, "chase")} title="Needs chase" disabled={actioningRowId === row.id}><Send size={14} /></IconButton>
                            <button onClick={() => onSelectRow(row)} className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-600 hover:bg-gray-50">Detail</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className="px-3 py-2 text-sm text-gray-400">
                          <div className="flex items-center justify-between gap-3">
                            <span>No options for this role yet</span>
                            {group.target?.lifecycle === "Active" && <button onClick={() => onOpenBlackbook(group.target?.id ?? null)} disabled={adding} className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><UserPlus size={13} /> Add option</button>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function CrewListSheet({
  sheet,
  adding,
  actioningRowId,
  onSync,
  onAddManual,
  onDuplicate,
  onRowAction,
  onSave,
  onSelectRow,
}: {
  sheet: ProductionSheet;
  adding: boolean;
  actioningRowId: string | null;
  onSync: () => Promise<void>;
  onAddManual: () => Promise<void>;
  onDuplicate: (row: ProductionSheetRow) => Promise<void>;
  onRowAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>;
  onSave: (rowId: string, patch: Record<string, unknown>) => Promise<void>;
  onSelectRow: (row: ProductionSheetRow) => void;
}) {
  const confirmedRows = sheet.rows.filter((row) => row.status === "CONFIRMED");
  const groups = groupRows(confirmedRows, "CONFIRMED_TEAM");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowHeader
        title="Crew List"
        subtitle={`${confirmedRows.length} confirmed bookings`}
        action={<div className="flex gap-2"><IconTextButton onClick={onSync} disabled={adding} icon={<RefreshCw size={14} />} label="Sync" /><IconTextButton onClick={() => void onAddManual()} disabled={adding} icon={<Plus size={14} />} label="Manual booking" /></div>}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map((group) => (
          <section key={group.label} className="border-b border-gray-200">
            <DepartmentHeader label={group.label} count={group.rows.length} />
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <tbody>
                {group.rows.length ? group.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#f6fbfa]">
                    <td className="min-w-[220px] border-b border-r border-gray-100 p-1">
                      <EditableCell row={row} column={{ key: "title", label: "Confirmed" }} onSave={onSave} />
                      {stringValue(row.data?.roleRequirementState) && stringValue(row.data?.roleRequirementState) !== "ACTIVE" && (
                        <span className="ml-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Role {stringValue(row.data?.roleRequirementState).toLowerCase()}</span>
                      )}
                    </td>
                    <td className="w-[180px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "owner", label: "Role" }} onSave={onSave} /></td>
                    <td className="w-[180px] border-b border-r border-gray-100 px-2 py-1 text-gray-600">{row.workstream}</td>
                    <td className="w-[230px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "data.email", label: "Email" }} onSave={onSave} /></td>
                    <td className="w-[150px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "data.phone", label: "Phone" }} onSave={onSave} /></td>
                    <td className="w-[110px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "data.rate", label: "Rate" }} onSave={onSave} /></td>
                    <td className="w-[130px] border-b border-r border-gray-100 px-2 py-1 text-xs text-gray-600">{stringValue(row.data?.itineraryState) || "-"}</td>
                    <td className="min-w-[260px] border-b border-r border-gray-100 p-1"><EditableCell row={row} column={{ key: "notes", label: "Notes" }} onSave={onSave} /></td>
                    <td className="w-[170px] border-b border-gray-100 p-1">
                      <div className="flex items-center gap-1">
                        <IconButton onClick={() => void onRowAction(row, "chase")} title="Needs chase" disabled={actioningRowId === row.id}><Send size={14} /></IconButton>
                        <IconButton onClick={() => void onDuplicate(row)} title="Duplicate manual row" disabled={actioningRowId === row.id}><Copy size={14} /></IconButton>
                        <button onClick={() => onSelectRow(row)} className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-600 hover:bg-gray-50">Detail</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td className="px-3 py-3 text-sm text-gray-400">Nothing confirmed in {group.label} yet</td></tr>}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

function WorkflowHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
      <div>
        <h2 className="text-sm font-semibold text-gray-950">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function DepartmentHeader({ label, count, children }: { label: string; count: number; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 bg-gray-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">{count}</span>
      </div>
      {children}
    </div>
  );
}

function InlineRoleCreator({ department, adding, onCreate }: { department: string; adding: boolean; onCreate: (department: string, payload: { name: string; type: string; quantity: number; notes?: string }) => Promise<void> }) {
  const defaultType = defaultTypeForDepartment(department);
  const [name, setName] = useState("");
  const [type, setType] = useState(defaultType);
  const [quantity, setQuantity] = useState("1");
  useEffect(() => { setType(defaultTypeForDepartment(department)); }, [department]);
  async function submit() {
    if (!name.trim()) return;
    await onCreate(department, { name: name.trim(), type, quantity: Math.max(1, Number(quantity || 1)) });
    setName("");
    setQuantity("1");
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Role / supplier slot" className="h-8 w-[190px] rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]" />
      <select value={type} onChange={(event) => setType(event.target.value)} className="h-8 w-[120px] rounded-md border border-gray-200 px-2 text-xs outline-none focus:border-[#0f8f7f]">
        {["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" className="h-8 w-14 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]" />
      <button onClick={() => void submit()} disabled={adding || !name.trim()} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#0f8f7f] px-2.5 text-xs font-medium text-white disabled:opacity-50"><Plus size={13} /> Add</button>
    </div>
  );
}

function InlineDateText({ value, onSave, disabled }: { value: string; onSave: (value: string) => Promise<void>; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  async function commit() {
    if (draft !== value) await onSave(draft);
  }
  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      disabled={disabled}
      className="h-8 w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f] disabled:bg-gray-50"
    />
  );
}

function IconButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button onClick={onClick} disabled={disabled} title={title} className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">{children}</button>;
}

function IconTextButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60">{icon}{label}</button>;
}

function StatusAction({ row, action, label, onAction, disabled }: { row: ProductionSheetRow; action: RowAction; label: string; onAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>; disabled?: boolean }) {
  return <button onClick={() => void onAction(row, action)} disabled={disabled} className="h-7 rounded border border-gray-200 px-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">{label}</button>;
}

function LifecycleBadge({ lifecycle }: { lifecycle: "Active" | "Parked" | "Released" }) {
  const classes = lifecycle === "Active"
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : lifecycle === "Parked"
      ? "bg-gray-100 text-gray-600 border-gray-200"
      : "bg-stone-100 text-stone-500 border-stone-200";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes}`}>{lifecycle}</span>;
}

function SheetGrid({
  sheet,
  columns,
  onSave,
  onAdd,
  adding,
  statusFilter,
  onStatusFilter,
  onRowAction,
  onDuplicate,
  onSelectRow,
  onOpenBlackbook,
  actioningRowId,
}: {
  sheet: ProductionSheet;
  columns: Column[];
  onSave: (rowId: string, patch: Record<string, unknown>) => Promise<void>;
  onAdd: () => Promise<void>;
  adding: boolean;
  statusFilter: ProductionWorkbookRowStatus | "ALL";
  onStatusFilter: (status: ProductionWorkbookRowStatus | "ALL") => void;
  onRowAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>;
  onDuplicate: (row: ProductionSheetRow) => Promise<void>;
  onSelectRow: (row: ProductionSheetRow) => void;
  onOpenBlackbook: () => void;
  actioningRowId: string | null;
}) {
  const filterStatuses = ["ALL", "REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "CONFIRMED", "RELEASED", "WAITING", "BLOCKED", "NEEDS_CHASE"] as Array<ProductionWorkbookRowStatus | "ALL">;
  const visibleRows = statusFilter === "ALL" ? sheet.rows : sheet.rows.filter((row) => row.status === statusFilter);
  const groupedRows = groupRows(visibleRows, sheet.type);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-950">{sheet.title}</h2>
          <p className="text-xs text-gray-500">{visibleRows.length} of {sheet.rows.length} rows</p>
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><ListFilter size={13} /> Filter</span>
          {filterStatuses.map((status) => (
            <button
              key={status}
              onClick={() => onStatusFilter(status)}
              className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium ${statusFilter === status ? "border-[#0f8f7f] bg-[#e6f4f2] text-[#0b7569]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
            >
              {status === "ALL" ? "All" : statusLabels[status]}
            </button>
          ))}
          {supportsBlackbook(sheet.type) && (
            <button
              onClick={onOpenBlackbook}
              disabled={adding}
              className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
            >
              <UserPlus size={14} />
              Blackbook
            </button>
          )}
          <button
            onClick={() => void onAdd()}
            disabled={adding}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-[#0f8f7f] px-3 text-sm font-medium text-white hover:bg-[#0b7569] disabled:opacity-60"
          >
            {adding ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            {quickAddLabel(sheet.type)}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              <th className="sticky left-0 z-20 w-12 border-b border-r border-gray-200 bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-500">#</th>
              {columns.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }} className={`${column.key === "title" ? "sticky left-12 z-20 bg-gray-50" : ""} border-b border-r border-gray-200 px-2 py-2 text-xs font-semibold text-gray-500`}>
                  {column.label}
                </th>
              ))}
              <th className="sticky right-0 z-20 w-[250px] border-b border-l border-gray-200 bg-gray-50 px-2 py-2 text-xs font-semibold text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <Fragment key={`${group.label}-group`}>
                <tr key={`${group.label}-group`}>
                  <td colSpan={columns.length + 2} className="bg-gray-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</td>
                </tr>
                {group.rows.length ? group.rows.map((row, index) => (
                  <tr key={row.id} className="group hover:bg-[#f6fbfa]">
                    <td onClick={() => onSelectRow(row)} className="sticky left-0 z-10 cursor-pointer border-b border-r border-gray-100 bg-white px-2 py-1 text-xs text-gray-400 group-hover:bg-[#f6fbfa]">{index + 1}</td>
                    {columns.map((column) => (
                      <td key={column.key} onDoubleClick={() => onSelectRow(row)} className={`${column.key === "title" ? "sticky left-12 z-10 bg-white group-hover:bg-[#f6fbfa]" : ""} border-b border-r border-gray-100 p-1 align-middle`}>
                        <EditableCell row={row} column={column} onSave={onSave} />
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 border-b border-l border-gray-100 bg-white p-1 group-hover:bg-[#f6fbfa]">
                      <div className="flex items-center gap-1">
                        <button onClick={() => void onRowAction(row, "confirm")} disabled={actioningRowId === row.id} title="Confirm" className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><CheckCircle2 size={14} /></button>
                        <button onClick={() => void onRowAction(row, "release")} disabled={actioningRowId === row.id} title="Release" className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"><XCircle size={14} /></button>
                        <button onClick={() => void onRowAction(row, "chase")} disabled={actioningRowId === row.id} title="Needs chase" className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"><Send size={14} /></button>
                        <button onClick={() => void onDuplicate(row)} title="Duplicate row" className="grid h-7 w-7 place-items-center rounded border border-gray-200 text-gray-600 hover:bg-gray-50"><Copy size={14} /></button>
                        <button onClick={() => onSelectRow(row)} className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-600 hover:bg-gray-50">Detail</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-2 py-2 text-xs text-gray-300">-</td>
                    <td colSpan={columns.length + 1} className="border-b border-gray-100 px-3 py-2 text-sm text-gray-400">{emptyGroupMessage(sheet.type, group.label)}</td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!visibleRows.length && !groupedRows.length && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-sm text-gray-500">
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function manualDefaultsForSheet(sheet: ProductionWorkbookSheetType): { title: string; status: ProductionWorkbookRowStatus; kind: string } {
  if (sheet === "ROLE_PLAN") return { title: "New role slot", status: "REQUESTED", kind: "role_requirement" };
  if (sheet === "CONFIRMED_TEAM") return { title: "New confirmed booking", status: "CONFIRMED", kind: "confirmed_booking" };
  if (sheet === "OPTIONS_HOLDS" || sheet === "LOCATIONS" || sheet === "ARTISTS_TALENT" || sheet === "CATERING") return { title: "New option", status: "REQUESTED", kind: "option_candidate" };
  if (sheet === "TASKS_CHASES") return { title: "New chase", status: "TODO", kind: "task" };
  if (sheet === "SCOPE_DATES") return { title: "New scope item", status: "TODO", kind: "scope_date" };
  return { title: "New logistics row", status: "TODO", kind: "logistics_item" };
}

function quickAddLabel(sheet: ProductionWorkbookSheetType): string {
  if (sheet === "ROLE_PLAN") return "Add role";
  if (sheet === "OPTIONS_HOLDS" || sheet === "LOCATIONS" || sheet === "ARTISTS_TALENT" || sheet === "CATERING") return "Add option";
  if (sheet === "CONFIRMED_TEAM") return "Add booking";
  if (sheet === "TASKS_CHASES") return "Add chase";
  return "Add row";
}

function supportsBlackbook(sheet: ProductionWorkbookSheetType): boolean {
  return sheet === "OPTIONS_HOLDS" || sheet === "LOCATIONS" || sheet === "ARTISTS_TALENT" || sheet === "CATERING" || sheet === "ROLE_PLAN" || sheet === "CONFIRMED_TEAM";
}

function optionTypeForSheet(sheet: ProductionWorkbookSheetType): string {
  if (sheet === "LOCATIONS") return "LOCATION";
  if (sheet === "ARTISTS_TALENT") return "TALENT";
  if (sheet === "CATERING") return "SERVICE";
  return "CREW";
}

function defaultGroupForSheet(sheet: ProductionWorkbookSheetType): string {
  if (sheet === "LOCATIONS") return "Locations";
  if (sheet === "ARTISTS_TALENT") return "Artists / Talent";
  if (sheet === "CATERING") return "Catering";
  if (sheet === "CONFIRMED_TEAM") return "Confirmed Team";
  if (sheet === "ROLE_PLAN") return "Crew";
  return "Options";
}

function groupRows(rows: ProductionSheetRow[], sheetType: ProductionWorkbookSheetType): Array<{ label: string; rows: ProductionSheetRow[] }> {
  const grouped = new Map<string, ProductionSheetRow[]>();
  for (const row of rows) {
    const label = row.workstream || row.date?.slice(0, 10) || (row.status ? statusLabels[row.status] : "Unassigned");
    grouped.set(label, [...(grouped.get(label) ?? []), row]);
  }
  if (sheetType === "ROLE_PLAN" || sheetType === "CONFIRMED_TEAM" || sheetType === "OPTIONS_HOLDS") {
    for (const department of defaultCrewDepartments) {
      if (!grouped.has(department)) grouped.set(department, []);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => departmentSort(a) - departmentSort(b)).map(([label, group]) => ({ label, rows: group }));
  }
  return Array.from(grouped.entries()).map(([label, group]) => ({ label, rows: group }));
}

function emptyGroupMessage(sheet: ProductionWorkbookSheetType, label: string): string {
  if (sheet === "ROLE_PLAN") return `Add roles to ${label}`;
  if (sheet === "OPTIONS_HOLDS") return "No options for this role yet";
  if (sheet === "CONFIRMED_TEAM") return `Nothing confirmed in ${label} yet`;
  return `No rows in ${label} yet.`;
}

function departmentSort(label: string): number {
  const index = defaultCrewDepartments.findIndex((department) => department.toLowerCase() === label.toLowerCase());
  return index === -1 ? 999 : index;
}

function BlackbookPickerDrawer({
  sheet,
  roleTargets,
  preferredTargetId,
  onClose,
  onAdd,
  adding,
}: {
  sheet: ProductionSheet;
  roleTargets: RoleTarget[];
  preferredTargetId?: string | null;
  onClose: () => void;
  onAdd: (entry: BlackbookEntry | null, target: RoleTarget | null, groupName: string, type: string, createBlackbook?: QuickBlackbookDraft) => Promise<void>;
  adding: boolean;
}) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<BlackbookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"blackbook" | "quick">("blackbook");
  const [success, setSuccess] = useState<string | null>(null);
  const [groupName, setGroupName] = useState(defaultGroupForSheet(sheet.type));
  const [type, setType] = useState(optionTypeForSheet(sheet.type));
  const sheetTargets = useMemo(() => roleTargets.filter((target) => target.lifecycle === "Active" && targetMatchesSheet(target, sheet.type)), [roleTargets, sheet.type]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const selectedTarget = sheetTargets.find((target) => target.id === selectedTargetId) ?? null;
  const [quick, setQuick] = useState<QuickBlackbookDraft>(() => quickDraftForTarget(null, sheet.type));

  useEffect(() => {
    setSelectedTargetId((current) => {
      if (preferredTargetId && sheetTargets.some((target) => target.id === preferredTargetId)) return preferredTargetId;
      return sheetTargets.some((target) => target.id === current) ? current : (sheetTargets[0]?.id ?? "");
    });
  }, [sheetTargets, preferredTargetId]);

  useEffect(() => {
    setQuick((current) => ({
      ...quickDraftForTarget(selectedTarget, sheet.type),
      displayName: current.displayName,
      companyName: current.companyName,
      jobTitle: current.jobTitle,
      email: current.email,
      phone: current.phone,
      website: current.website,
      city: current.city,
      country: current.country,
      defaultRate: current.defaultRate,
      rateUnit: current.rateUnit,
      currency: current.currency || "GBP",
      notes: current.notes,
      forceCreate: current.forceCreate,
    }));
  }, [selectedTarget, sheet.type]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ q: query, limit: "40" });
    const category = categoryForSheet(sheet.type);
    if (category) params.set("category", category);
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query, sheet.type]);

  async function addExisting(entry: BlackbookEntry) {
    await onAdd(entry, selectedTarget, groupName || defaultGroupForSheet(sheet.type), type);
    setSuccess(`Added ${entry.displayName}`);
  }

  async function addQuick() {
    if (!quick.displayName.trim()) return;
    await onAdd(null, selectedTarget, groupName || defaultGroupForSheet(sheet.type), type, quick);
    setSuccess(`Added ${quick.displayName}`);
    setQuick((current) => ({ ...quickDraftForTarget(selectedTarget, sheet.type), entryType: current.entryType, category: current.category, currency: current.currency || "GBP" }));
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sheetLabels[sheet.type]}</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-950">Add Option / Hold</h3>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><XCircle size={16} /></button>
      </div>
      <div className="border-b border-gray-100 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Role Plan slot</label>
          <select value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)} className="h-9 w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
            {sheetTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.department} / {target.label}</option>
            ))}
            <option value="">Create new Role Plan group</option>
          </select>
          {!sheetTargets.length && <p className="mt-1 text-xs text-amber-700">No active Role Plan slots are available for this sheet. Create or reactivate a role first, or use the fallback group carefully.</p>}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_140px] gap-2">
          <input value={selectedTarget ? selectedTarget.label : groupName} onChange={(event) => setGroupName(event.target.value)} disabled={Boolean(selectedTarget)} className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f] disabled:bg-gray-50 disabled:text-gray-500" placeholder="Role/group name" />
          <select value={selectedTarget ? selectedTarget.type : type} onChange={(event) => setType(event.target.value)} disabled={Boolean(selectedTarget)} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f] disabled:bg-gray-50 disabled:text-gray-500">
            {["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        {success && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{success}</div>}
        <div className="mt-3 grid grid-cols-2 rounded-md bg-gray-100 p-1">
          <button onClick={() => setTab("blackbook")} className={`h-8 rounded text-sm font-medium ${tab === "blackbook" ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}>Blackbook</button>
          <button onClick={() => setTab("quick")} className={`h-8 rounded text-sm font-medium ${tab === "quick" ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}>Quick Add</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {tab === "blackbook" ? (
          <>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, suppliers, locations, artists..." className="h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-[#0f8f7f]" />
            </div>
            {loading && <div className="p-4 text-sm text-gray-500">Searching...</div>}
            {!loading && entries.map((entry) => (
              <button key={entry.id} onClick={() => void addExisting(entry)} disabled={adding || (!selectedTarget && !groupName.trim())} className="mb-1 block w-full rounded-md border border-transparent p-3 text-left hover:border-gray-200 hover:bg-gray-50 disabled:opacity-60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">{entry.displayName}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{[entry.companyName, entry.jobTitle, entry.city, entry.country].filter(Boolean).join(" · ") || `${entry.entryType} · ${entry.category}`}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{[entry.email, entry.phone, entry.website].filter(Boolean).join(" · ")}</p>
                    {entry.defaultRate != null && <p className="mt-1 text-xs text-gray-500">{entry.currency ?? "GBP"} {entry.defaultRate} {entry.rateUnit ?? ""}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">{entry.category}</span>
                </div>
              </button>
            ))}
            {!loading && !entries.length && <div className="p-4 text-sm text-gray-500">No Blackbook records found.</div>}
          </>
        ) : (
          <div className="grid gap-2 p-2">
            <input value={quick.displayName} onChange={(event) => setQuick({ ...quick, displayName: event.target.value })} placeholder="Display name" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            <div className="grid grid-cols-2 gap-2">
              <select value={quick.entryType} onChange={(event) => setQuick({ ...quick, entryType: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
                {["PERSON", "COMPANY", "LOCATION", "TALENT", "SERVICE"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={quick.category} onChange={(event) => setQuick({ ...quick, category: event.target.value })} className="h-9 rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-[#0f8f7f]">
                {["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={quick.companyName} onChange={(event) => setQuick({ ...quick, companyName: event.target.value })} placeholder="Company" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
              <input value={quick.jobTitle} onChange={(event) => setQuick({ ...quick, jobTitle: event.target.value })} placeholder="Job title / role" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={quick.email} onChange={(event) => setQuick({ ...quick, email: event.target.value })} placeholder="Email" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
              <input value={quick.phone} onChange={(event) => setQuick({ ...quick, phone: event.target.value })} placeholder="Phone" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            </div>
            <input value={quick.website} onChange={(event) => setQuick({ ...quick, website: event.target.value })} placeholder="Website / social" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            <div className="grid grid-cols-2 gap-2">
              <input value={quick.city} onChange={(event) => setQuick({ ...quick, city: event.target.value })} placeholder="City" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
              <input value={quick.country} onChange={(event) => setQuick({ ...quick, country: event.target.value })} placeholder="Country" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            </div>
            <div className="grid grid-cols-[1fr_120px_90px] gap-2">
              <input value={quick.defaultRate} onChange={(event) => setQuick({ ...quick, defaultRate: event.target.value })} placeholder="Rate" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
              <input value={quick.rateUnit} onChange={(event) => setQuick({ ...quick, rateUnit: event.target.value })} placeholder="Unit" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
              <input value={quick.currency} onChange={(event) => setQuick({ ...quick, currency: event.target.value })} placeholder="GBP" className="h-9 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-[#0f8f7f]" />
            </div>
            <textarea value={quick.notes} onChange={(event) => setQuick({ ...quick, notes: event.target.value })} placeholder="Notes" className="min-h-20 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#0f8f7f]" />
            <label className="inline-flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={quick.forceCreate} onChange={(event) => setQuick({ ...quick, forceCreate: event.target.checked })} className="h-4 w-4 accent-[#0f8f7f]" /> Force new Blackbook record</label>
            <button onClick={() => void addQuick()} disabled={adding || !quick.displayName.trim() || (!selectedTarget && !groupName.trim())} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#0f8f7f] px-3 text-sm font-medium text-white disabled:opacity-50">{adding ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Add option and save to Blackbook</button>
          </div>
        )}
      </div>
    </div>
  );
}

function categoryForSheet(sheet: ProductionWorkbookSheetType): string | null {
  if (sheet === "LOCATIONS") return "LOCATION";
  if (sheet === "ARTISTS_TALENT") return "TALENT";
  if (sheet === "CATERING") return "SERVICE";
  return null;
}

function quickDraftForTarget(target: RoleTarget | null, sheet: ProductionWorkbookSheetType): QuickBlackbookDraft {
  const category = blackbookCategoryForType(target?.type ?? optionTypeForSheet(sheet));
  return {
    displayName: "",
    entryType: entryTypeForBlackbookCategory(category),
    category,
    companyName: "",
    jobTitle: target?.label ?? "",
    email: "",
    phone: "",
    website: "",
    city: "",
    country: "",
    defaultRate: "",
    rateUnit: "day",
    currency: "GBP",
    notes: "",
    forceCreate: false,
  };
}

function blackbookCategoryForType(type: string): string {
  if (type === "CREW") return "CREW";
  if (type === "TALENT") return "TALENT";
  if (type === "LOCATION") return "LOCATION";
  if (type === "SERVICE") return "SERVICE";
  if (type === "EQUIPMENT") return "EQUIPMENT";
  if (type === "TRANSPORT") return "TRANSPORT";
  if (type === "POST") return "POST";
  return "OTHER";
}

function entryTypeForBlackbookCategory(category: string): string {
  if (category === "LOCATION") return "LOCATION";
  if (category === "TALENT") return "TALENT";
  if (["SERVICE", "EQUIPMENT", "TRANSPORT", "POST"].includes(category)) return "COMPANY";
  return "PERSON";
}

function RowDetailDrawer({
  row,
  onClose,
  onAction,
  actioning,
}: {
  row: ProductionSheetRow;
  onClose: () => void;
  onAction: (row: ProductionSheetRow, action: RowAction) => Promise<void>;
  actioning: boolean;
}) {
  const detailFields = [
    ["Sheet", sheetLabels[row.sheetType]],
    ["Source", [row.sourceEntityType, row.sourceEntityId].filter(Boolean).join(" · ")],
    ["Workstream", row.workstream],
    ["Owner", row.owner],
    ["Location", row.location],
    ["Date", row.date?.slice(0, 10)],
    ["Notes", row.notes],
  ];
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{sheetLabels[row.sheetType]}</p>
          <h3 className="mt-1 truncate text-lg font-semibold text-gray-950">{row.title ?? "Untitled row"}</h3>
          {row.status && <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass[row.status]}`}>{statusLabels[row.status]}</span>}
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><XCircle size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button onClick={() => void onAction(row, "confirm")} disabled={actioning} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 size={14} /> Confirm</button>
          <button onClick={() => void onAction(row, "release")} disabled={actioning} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-gray-200 px-2 text-sm font-medium text-gray-700 disabled:opacity-50"><XCircle size={14} /> Release</button>
          <button onClick={() => void onAction(row, "chase")} disabled={actioning} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-orange-200 px-2 text-sm font-medium text-orange-700 disabled:opacity-50"><Send size={14} /> Chase</button>
        </div>
        <dl className="space-y-3">
          {detailFields.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[100px_1fr] gap-3 text-sm">
              <dt className="text-gray-500">{label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap text-gray-900">{value || "-"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Structured Data</h4>
          <div className="rounded-md bg-gray-950 p-3 text-xs text-gray-100">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap">{JSON.stringify(row.data ?? {}, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function updateWorkbookRow(workbook: ProductionWorkbook | null, updated: ProductionSheetRow): ProductionWorkbook | null {
  if (!workbook) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => (
      sheet.id === updated.sheetId
        ? { ...sheet, rows: sheet.rows.map((row) => row.id === updated.id ? updated : row) }
        : sheet
    )),
  };
}

function addWorkbookRow(workbook: ProductionWorkbook | null, row: ProductionSheetRow): ProductionWorkbook | null {
  if (!workbook) return workbook;
  return {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => (
      sheet.id === row.sheetId
        ? { ...sheet, rows: [...sheet.rows, row].sort((a, b) => a.order - b.order) }
        : sheet
    )),
  };
}
