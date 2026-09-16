import { Router, Request, Response } from "express";
import {
  BlackbookCategory,
  BlackbookEntryType,
  CandidateDateHoldStatus,
  CrewItineraryItemType,
  CrewStatus,
  OptionCandidateState,
  OptionRequirementState,
  OptionRequirementType,
  Prisma,
  ProductionDateStatus,
  ProductionDateType,
  ProductionStatus,
  ProductionWorkbookRowStatus,
  ProductionWorkbookSheetType,
  ProjectActionStatus,
  ProjectActionType,
} from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const workbookEnabled = () => process.env.PRODUCTIONS_WORKBOOK_ENABLED !== "false";

const sheetDefinitions: Array<{ type: ProductionWorkbookSheetType; title: string; order: number }> = [
  { type: ProductionWorkbookSheetType.DASHBOARD, title: "Dashboard", order: 0 },
  { type: ProductionWorkbookSheetType.SCOPE_DATES, title: "Scope & Dates", order: 1 },
  { type: ProductionWorkbookSheetType.ROLE_PLAN, title: "Role Plan", order: 2 },
  { type: ProductionWorkbookSheetType.OPTIONS_HOLDS, title: "Options & Holds", order: 3 },
  { type: ProductionWorkbookSheetType.CONFIRMED_TEAM, title: "Crew List", order: 4 },
  { type: ProductionWorkbookSheetType.LOCATIONS, title: "Locations", order: 5 },
  { type: ProductionWorkbookSheetType.ARTISTS_TALENT, title: "Artists / Talent", order: 6 },
  { type: ProductionWorkbookSheetType.CATERING, title: "Catering", order: 7 },
  { type: ProductionWorkbookSheetType.TRAVEL, title: "Travel", order: 8 },
  { type: ProductionWorkbookSheetType.HOTELS, title: "Hotels", order: 9 },
  { type: ProductionWorkbookSheetType.CARS, title: "Cars", order: 10 },
  { type: ProductionWorkbookSheetType.EQUIPMENT, title: "Equipment", order: 11 },
  { type: ProductionWorkbookSheetType.DELIVERIES, title: "Deliveries", order: 12 },
  { type: ProductionWorkbookSheetType.RUN_OF_SHOW, title: "Run of Show", order: 13 },
  { type: ProductionWorkbookSheetType.TASKS_CHASES, title: "Tasks / Chases", order: 14 },
  { type: ProductionWorkbookSheetType.FILES_COMMS, title: "Files & Comms", order: 15 },
];

const legacySheetTypes = new Set<ProductionWorkbookSheetType>([
  ProductionWorkbookSheetType.TODO,
  ProductionWorkbookSheetType.TIMELINE,
  ProductionWorkbookSheetType.CREW,
  ProductionWorkbookSheetType.HOLDS,
]);

const archiveLinks = [
  { key: "budget", label: "Budget", tab: "Budget" },
  { key: "options", label: "Options", tab: "Options" },
  { key: "timeline", label: "Timeline Archive", tab: "Timeline" },
  { key: "dates", label: "Dates", tab: "Dates" },
  { key: "crew", label: "Crew Tools", tab: "Crew" },
  { key: "purchase-orders", label: "POs", tab: "POs" },
  { key: "comms", label: "Comms", tab: "Comms" },
  { key: "selects", label: "Selects", tab: "Selects" },
  { key: "files", label: "Files", tab: "Files" },
];

const defaultCrewDepartments: Array<{ name: string; type: OptionRequirementType; color: string }> = [
  { name: "Production", type: OptionRequirementType.CREW, color: "#0f8f7f" },
  { name: "Photo", type: OptionRequirementType.CREW, color: "#2563eb" },
  { name: "Motion", type: OptionRequirementType.CREW, color: "#7c3aed" },
  { name: "Glam", type: OptionRequirementType.CREW, color: "#db2777" },
  { name: "Styling / Wardrobe", type: OptionRequirementType.CREW, color: "#ea580c" },
  { name: "Art Department", type: OptionRequirementType.CREW, color: "#65a30d" },
  { name: "Set Design / Props", type: OptionRequirementType.EQUIPMENT, color: "#16a34a" },
  { name: "Locations", type: OptionRequirementType.LOCATION, color: "#0891b2" },
  { name: "Casting / Talent", type: OptionRequirementType.TALENT, color: "#9333ea" },
  { name: "Catering", type: OptionRequirementType.SERVICE, color: "#ca8a04" },
  { name: "Transport", type: OptionRequirementType.TRANSPORT, color: "#475569" },
  { name: "Travel", type: OptionRequirementType.TRANSPORT, color: "#0284c7" },
  { name: "Post", type: OptionRequirementType.POST, color: "#4f46e5" },
  { name: "Client / Agency", type: OptionRequirementType.OTHER, color: "#64748b" },
  { name: "Health & Safety", type: OptionRequirementType.OTHER, color: "#dc2626" },
];

function isActiveProduction(status: ProductionStatus): boolean {
  return status !== ProductionStatus.CLOSED;
}

function toDateOnly(value: Date | null | undefined): Date | null {
  if (!value) return null;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowStatus(value: unknown): ProductionWorkbookRowStatus | undefined {
  return typeof value === "string" && value in ProductionWorkbookRowStatus
    ? (value as ProductionWorkbookRowStatus)
    : undefined;
}

function sheetType(value: unknown): ProductionWorkbookSheetType | undefined {
  return typeof value === "string" && value in ProductionWorkbookSheetType
    ? (value as ProductionWorkbookSheetType)
    : undefined;
}

function mapActionStatus(status: ProjectActionStatus): ProductionWorkbookRowStatus {
  if (status === ProjectActionStatus.IN_PROGRESS) return ProductionWorkbookRowStatus.IN_PROGRESS;
  if (status === ProjectActionStatus.WAITING) return ProductionWorkbookRowStatus.WAITING;
  if (status === ProjectActionStatus.DONE) return ProductionWorkbookRowStatus.DONE;
  if (status === ProjectActionStatus.BLOCKED) return ProductionWorkbookRowStatus.BLOCKED;
  if (status === ProjectActionStatus.CANCELLED) return ProductionWorkbookRowStatus.CANCELLED;
  return ProductionWorkbookRowStatus.TODO;
}

function mapCrewStatus(status: CrewStatus): ProductionWorkbookRowStatus {
  if (status === CrewStatus.FIRST_OPTION) return ProductionWorkbookRowStatus.FIRST_OPTION;
  if (status === CrewStatus.SECOND_OPTION) return ProductionWorkbookRowStatus.SECOND_OPTION;
  if (status === CrewStatus.CONFIRMED) return ProductionWorkbookRowStatus.CONFIRMED;
  if (status === CrewStatus.RELEASED) return ProductionWorkbookRowStatus.RELEASED;
  return ProductionWorkbookRowStatus.REQUESTED;
}

function statusFromCandidate(candidate: { activeState: OptionCandidateState; dateStatuses?: Array<{ status: CandidateDateHoldStatus }> }): ProductionWorkbookRowStatus {
  if (candidate.activeState === OptionCandidateState.RELEASED) return ProductionWorkbookRowStatus.RELEASED;
  if (candidate.activeState === OptionCandidateState.PARKED) return ProductionWorkbookRowStatus.PARKED;
  const statuses = candidate.dateStatuses?.map((record) => record.status) ?? [];
  if (statuses.includes(CandidateDateHoldStatus.CONFIRMED)) return ProductionWorkbookRowStatus.CONFIRMED;
  if (statuses.includes(CandidateDateHoldStatus.FIRST_OPTION)) return ProductionWorkbookRowStatus.FIRST_OPTION;
  if (statuses.includes(CandidateDateHoldStatus.SECOND_OPTION)) return ProductionWorkbookRowStatus.SECOND_OPTION;
  if (statuses.includes(CandidateDateHoldStatus.RELEASED)) return ProductionWorkbookRowStatus.RELEASED;
  return ProductionWorkbookRowStatus.REQUESTED;
}

function optionType(value: unknown): OptionRequirementType {
  return typeof value === "string" && value in OptionRequirementType ? value as OptionRequirementType : OptionRequirementType.OTHER;
}

function blackbookCategoryFromOptionType(type: OptionRequirementType): BlackbookCategory {
  if (type === OptionRequirementType.CREW) return BlackbookCategory.CREW;
  if (type === OptionRequirementType.SERVICE) return BlackbookCategory.SERVICE;
  if (type === OptionRequirementType.LOCATION) return BlackbookCategory.LOCATION;
  if (type === OptionRequirementType.EQUIPMENT) return BlackbookCategory.EQUIPMENT;
  if (type === OptionRequirementType.TALENT) return BlackbookCategory.TALENT;
  if (type === OptionRequirementType.TRANSPORT) return BlackbookCategory.TRANSPORT;
  if (type === OptionRequirementType.POST) return BlackbookCategory.POST;
  return BlackbookCategory.OTHER;
}

function blackbookEntryTypeForCategory(category: BlackbookCategory): BlackbookEntryType {
  if (category === BlackbookCategory.LOCATION) return BlackbookEntryType.LOCATION;
  if (category === BlackbookCategory.TALENT) return BlackbookEntryType.TALENT;
  if (category === BlackbookCategory.SERVICE || category === BlackbookCategory.EQUIPMENT || category === BlackbookCategory.TRANSPORT || category === BlackbookCategory.POST) return BlackbookEntryType.COMPANY;
  return BlackbookEntryType.PERSON;
}

function blackbookCategory(value: unknown, fallback: BlackbookCategory): BlackbookCategory {
  return typeof value === "string" && value in BlackbookCategory ? value as BlackbookCategory : fallback;
}

function blackbookEntryType(value: unknown, fallback: BlackbookEntryType): BlackbookEntryType {
  return typeof value === "string" && value in BlackbookEntryType ? value as BlackbookEntryType : fallback;
}

function productionDateType(value: unknown): ProductionDateType {
  return typeof value === "string" && value in ProductionDateType ? value as ProductionDateType : ProductionDateType.OTHER;
}

function productionDateStatus(value: unknown): ProductionDateStatus {
  return typeof value === "string" && value in ProductionDateStatus ? value as ProductionDateStatus : ProductionDateStatus.PROPOSED;
}

function isRoleAssignableDate(status: ProductionDateStatus): boolean {
  return status === ProductionDateStatus.PROPOSED || status === ProductionDateStatus.OPTIONED || status === ProductionDateStatus.CONFIRMED;
}

function candidateHoldStatus(value: unknown): CandidateDateHoldStatus {
  if (value === "FIRST_OPTION") return CandidateDateHoldStatus.FIRST_OPTION;
  if (value === "SECOND_OPTION") return CandidateDateHoldStatus.SECOND_OPTION;
  if (value === "CONFIRMED") return CandidateDateHoldStatus.CONFIRMED;
  if (value === "RELEASED") return CandidateDateHoldStatus.RELEASED;
  return CandidateDateHoldStatus.REQUESTED;
}

function optionSheetFor(type: OptionRequirementType, name?: string | null): ProductionWorkbookSheetType {
  const label = (name ?? "").toLowerCase();
  if (type === OptionRequirementType.LOCATION) return ProductionWorkbookSheetType.LOCATIONS;
  if (type === OptionRequirementType.TALENT) return ProductionWorkbookSheetType.ARTISTS_TALENT;
  if (type === OptionRequirementType.SERVICE && /\b(catering|food|breakfast|lunch|dinner|coffee|craft)\b/.test(label)) return ProductionWorkbookSheetType.CATERING;
  if (type === OptionRequirementType.EQUIPMENT) return ProductionWorkbookSheetType.EQUIPMENT;
  if (type === OptionRequirementType.TRANSPORT) return ProductionWorkbookSheetType.CARS;
  return ProductionWorkbookSheetType.OPTIONS_HOLDS;
}

function defaultTypeForName(name: string): OptionRequirementType {
  const text = name.toLowerCase();
  if (/\b(location|locations|studio|venue|unit base)\b/.test(text)) return OptionRequirementType.LOCATION;
  if (/\b(casting|talent|artist|model|models|cast)\b/.test(text)) return OptionRequirementType.TALENT;
  if (/\b(catering|food|coffee|lunch|dinner|breakfast|craft)\b/.test(text)) return OptionRequirementType.SERVICE;
  if (/\b(equipment|camera|lighting|kit|prop)\b/.test(text)) return OptionRequirementType.EQUIPMENT;
  if (/\b(car|driver|transport|transfer)\b/.test(text)) return OptionRequirementType.TRANSPORT;
  if (/\b(post|edit|retouch|grade)\b/.test(text)) return OptionRequirementType.POST;
  return OptionRequirementType.CREW;
}

function requirementStateFromRowStatus(status: ProductionWorkbookRowStatus | null | undefined): OptionRequirementState | undefined {
  if (status === ProductionWorkbookRowStatus.PARKED) return OptionRequirementState.PARKED;
  if (status === ProductionWorkbookRowStatus.RELEASED) return OptionRequirementState.RELEASED;
  if (status === ProductionWorkbookRowStatus.REQUESTED || status === ProductionWorkbookRowStatus.IN_PROGRESS || status === ProductionWorkbookRowStatus.CONFIRMED || status === ProductionWorkbookRowStatus.DONE) {
    return OptionRequirementState.ACTIVE;
  }
  return undefined;
}

function candidateStateFromRowStatus(status: ProductionWorkbookRowStatus | null | undefined): OptionCandidateState {
  if (status === ProductionWorkbookRowStatus.PARKED) return OptionCandidateState.PARKED;
  if (status === ProductionWorkbookRowStatus.RELEASED) return OptionCandidateState.RELEASED;
  return OptionCandidateState.ACTIVE;
}

function sheetForManualRow(sheet: ProductionWorkbookSheetType): { kind: string; status: ProductionWorkbookRowStatus } {
  if (sheet === ProductionWorkbookSheetType.ROLE_PLAN) return { kind: "role_requirement", status: ProductionWorkbookRowStatus.REQUESTED };
  if (
    sheet === ProductionWorkbookSheetType.TRAVEL ||
    sheet === ProductionWorkbookSheetType.HOTELS ||
    sheet === ProductionWorkbookSheetType.CARS ||
    sheet === ProductionWorkbookSheetType.EQUIPMENT ||
    sheet === ProductionWorkbookSheetType.DELIVERIES
  ) return { kind: "logistics_item", status: ProductionWorkbookRowStatus.TODO };
  if (sheet === ProductionWorkbookSheetType.CONFIRMED_TEAM) return { kind: "confirmed_booking", status: ProductionWorkbookRowStatus.CONFIRMED };
  if (
    sheet === ProductionWorkbookSheetType.OPTIONS_HOLDS ||
    sheet === ProductionWorkbookSheetType.LOCATIONS ||
    sheet === ProductionWorkbookSheetType.ARTISTS_TALENT ||
    sheet === ProductionWorkbookSheetType.CATERING
  ) return { kind: "option_candidate", status: ProductionWorkbookRowStatus.REQUESTED };
  return { kind: "task", status: ProductionWorkbookRowStatus.TODO };
}

function actionSheet(action: { title: string; description: string | null; location: string | null; actionType: ProjectActionType; startAt: Date | null; workstream?: { name: string } | null }): ProductionWorkbookSheetType {
  const text = `${action.title} ${action.description ?? ""} ${action.location ?? ""} ${action.workstream?.name ?? ""}`.toLowerCase();
  if (/\b(deliver|delivery|drop|pickup|pick up|courier|ship|shipping)\b/.test(text)) return ProductionWorkbookSheetType.DELIVERIES;
  if (/\b(equipment|kit|camera|lens|walkie|printer|prop|rail|lighting|power|vanities)\b/.test(text)) return ProductionWorkbookSheetType.EQUIPMENT;
  if (
    action.actionType === ProjectActionType.EVENT ||
    action.actionType === ProjectActionType.MEETING ||
    action.actionType === ProjectActionType.TRAVEL ||
    action.actionType === ProjectActionType.SHOOT
  ) {
    return ProductionWorkbookSheetType.RUN_OF_SHOW;
  }
  if (action.actionType === ProjectActionType.DEADLINE || action.startAt) return ProductionWorkbookSheetType.TASKS_CHASES;
  return ProductionWorkbookSheetType.TASKS_CHASES;
}

function itinerarySheet(type: CrewItineraryItemType): ProductionWorkbookSheetType {
  if (type === CrewItineraryItemType.HOTEL) return ProductionWorkbookSheetType.HOTELS;
  if (type === CrewItineraryItemType.CAR) return ProductionWorkbookSheetType.CARS;
  return ProductionWorkbookSheetType.TRAVEL;
}

async function ensureWorkbookShell(productionId: string) {
  const production = await prisma.production.findUnique({ where: { id: productionId } });
  if (!production) return null;
  if (!isActiveProduction(production.status)) return { production, workbook: null, sheets: [] };

  const workbook = await prisma.productionWorkbook.upsert({
    where: { productionId },
    update: {
      title: production.title,
      metadata: {
        jobCode: production.jobCode,
        clientName: production.clientName,
        brand: production.brand,
        status: production.status,
        source: "production",
      },
    },
    create: {
      productionId,
      title: production.title,
      metadata: {
        jobCode: production.jobCode,
        clientName: production.clientName,
        brand: production.brand,
        status: production.status,
        source: "production",
      },
    },
  });

  const sheets = await Promise.all(sheetDefinitions.map((sheet) => (
    prisma.productionSheet.upsert({
      where: { workbookId_type: { workbookId: workbook.id, type: sheet.type } },
      update: { title: sheet.title, order: sheet.order },
      create: { workbookId: workbook.id, type: sheet.type, title: sheet.title, order: sheet.order },
    })
  )));

  return { production, workbook, sheets };
}

async function upsertSourceRow(
  workbookId: string,
  sheets: Map<ProductionWorkbookSheetType, string>,
  sheetTypeValue: ProductionWorkbookSheetType,
  sourceEntityType: string,
  sourceEntityId: string,
  order: number,
  data: Prisma.ProductionSheetRowUncheckedCreateInput,
) {
  const sheetId = sheets.get(sheetTypeValue);
  if (!sheetId) return;
  await prisma.productionSheetRow.upsert({
    where: {
      workbookId_sheetType_sourceEntityType_sourceEntityId: {
        workbookId,
        sheetType: sheetTypeValue,
        sourceEntityType,
        sourceEntityId,
      },
    },
    update: {
      sheetId,
      sheetType: sheetTypeValue,
      order,
      status: data.status,
      title: data.title,
      date: data.date,
      startAt: data.startAt,
      endAt: data.endAt,
      workstream: data.workstream,
      owner: data.owner,
      location: data.location,
      notes: data.notes,
      data: data.data ?? {},
    },
    create: {
      ...data,
      workbookId,
      sheetId,
      sheetType: sheetTypeValue,
      order,
      sourceEntityType,
      sourceEntityId,
    },
  });
}

async function ensureDefaultCrewDepartments(productionId: string) {
  const existing = await prisma.projectWorkstream.findMany({
    where: { productionId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((item) => item.name.toLowerCase()));
  let order = await prisma.projectWorkstream.count({ where: { productionId } });
  for (const department of defaultCrewDepartments) {
    if (existingNames.has(department.name.toLowerCase())) continue;
    await prisma.projectWorkstream.create({
      data: {
        productionId,
        name: department.name,
        color: department.color,
        order,
      },
    });
    order += 1;
  }
}

async function bootstrapWorkbook(productionId: string) {
  const shell = await ensureWorkbookShell(productionId);
  if (!shell) return null;
  if (!shell.workbook) return { production: shell.production, workbook: null };

  const { production, workbook } = shell;
  const sheets = new Map(shell.sheets.map((sheet) => [sheet.type, sheet.id]));
  await ensureDefaultCrewDepartments(productionId);

  await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.DASHBOARD, "Production", production.id, 0, {
    workbookId: workbook.id,
    sheetId: sheets.get(ProductionWorkbookSheetType.DASHBOARD) ?? "",
    sheetType: ProductionWorkbookSheetType.DASHBOARD,
    order: 0,
    status: ProductionWorkbookRowStatus.IN_PROGRESS,
    title: production.title,
    owner: production.clientName,
    notes: production.notes,
    data: {
      jobCode: production.jobCode,
      clientName: production.clientName,
      brand: production.brand,
      jobType: production.jobType,
      status: production.status,
      quotedValue: production.value ? Number(production.value) : null,
      actualSpend: production.actualSpend,
      variance: production.variance,
      description: production.description,
    },
  });

  const actions = await prisma.projectAction.findMany({
    where: { productionId },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    include: { workstream: true },
  });
  for (const [index, action] of actions.entries()) {
    const targetSheet = actionSheet(action);
    await upsertSourceRow(workbook.id, sheets, targetSheet, "ProjectAction", action.id, index, {
      workbookId: workbook.id,
      sheetId: sheets.get(targetSheet) ?? "",
      sheetType: targetSheet,
      order: index,
      status: mapActionStatus(action.status),
      title: action.title,
      date: toDateOnly(action.startAt),
      startAt: action.startAt,
      endAt: action.endAt,
      workstream: action.workstream?.name ?? null,
      location: action.location,
      notes: action.description,
      data: {
        actionType: action.actionType,
        visibility: action.visibility,
        zoomLink: action.zoomLink,
        reminderMinutes: action.reminderMinutes,
        source: "ProjectAction",
      },
    });
  }

  const productionDates = await prisma.productionDate.findMany({
    where: { productionId },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  });
  for (const [index, date] of productionDates.entries()) {
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.SCOPE_DATES, "ProductionDate", date.id, index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.SCOPE_DATES) ?? "",
      sheetType: ProductionWorkbookSheetType.SCOPE_DATES,
      order: index,
      status: date.status === ProductionDateStatus.CONFIRMED ? ProductionWorkbookRowStatus.CONFIRMED : ProductionWorkbookRowStatus.REQUESTED,
      title: date.label ?? date.dateType.replace(/_/g, " "),
      date: date.date,
      location: date.location,
      notes: date.notes,
      data: {
        kind: "scope_date",
        dateType: date.dateType,
        time: date.time,
        zoomLink: date.zoomLink,
        productionDateStatus: date.status,
      },
    });
  }

  const workstreams = await prisma.projectWorkstream.findMany({
    where: { productionId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { optionGroups: true },
  });
  for (const [index, workstream] of workstreams.entries()) {
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.SCOPE_DATES, "ProjectWorkstream", workstream.id, productionDates.length + index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.SCOPE_DATES) ?? "",
      sheetType: ProductionWorkbookSheetType.SCOPE_DATES,
      order: productionDates.length + index,
      status: ProductionWorkbookRowStatus.IN_PROGRESS,
      title: workstream.name,
      workstream: workstream.name,
      data: {
        kind: "scope_lane",
        color: workstream.color,
        visibleOnClientTimeline: workstream.visibleOnClientTimeline,
        optionGroups: workstream.optionGroups.length,
      },
    });
  }

  const requirements = await prisma.optionRequirement.findMany({
    where: { productionId },
    orderBy: [{ group: { order: "asc" } }, { order: "asc" }, { slotNumber: "asc" }],
    include: { group: { include: { workstream: true } }, dateNeeds: { include: { date: true } }, assignments: { include: { candidate: true, date: true } } },
  });
  for (const [index, requirement] of requirements.entries()) {
    const assignedCandidateIds = new Set(requirement.assignments.map((assignment) => assignment.candidateId));
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.ROLE_PLAN, "OptionRequirement", requirement.id, index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.ROLE_PLAN) ?? "",
      sheetType: ProductionWorkbookSheetType.ROLE_PLAN,
      order: index,
      status: requirement.activeState === "RELEASED" ? ProductionWorkbookRowStatus.RELEASED : requirement.activeState === "PARKED" ? ProductionWorkbookRowStatus.PARKED : ProductionWorkbookRowStatus.REQUESTED,
      title: requirement.displayLabel || requirement.name,
      workstream: requirement.group.workstream?.name ?? requirement.group.name,
      notes: requirement.notes,
      data: {
        kind: "role_requirement",
        groupId: requirement.groupId,
        groupName: requirement.group.name,
        department: requirement.group.workstream?.name ?? null,
        groupType: requirement.group.type,
        roleRequirementState: requirement.activeState,
        slotNumber: requirement.slotNumber,
        requiredDatesSummary: requirement.dateNeeds.filter((need) => need.isRequired).map((need) => need.date.label ?? need.date.date.toISOString().slice(0, 10)).join(", "),
        assignedCount: assignedCandidateIds.size,
        datesNeeded: requirement.dateNeeds.filter((need) => need.isRequired).map((need) => ({
          id: need.dateId,
          date: need.date.date,
          label: need.date.label,
        })),
        assignments: requirement.assignments.map((assignment) => ({
          candidateId: assignment.candidateId,
          candidateName: assignment.candidate.name,
          dateId: assignment.dateId,
          date: assignment.date.date,
        })),
      },
    });
  }

  const crew = await prisma.crewMember.findMany({
    where: { productionId, hiddenFromCrewList: false },
    orderBy: { createdAt: "asc" },
    include: { role: true, roleRequirement: { include: { group: { include: { workstream: true } } } }, optionCandidate: { include: { group: { include: { workstream: true, requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } } } } } },
  });
  for (const [index, member] of crew.entries()) {
    const memberSourceRequirementState = member.roleRequirement?.activeState ?? member.optionCandidate?.group.requirements[0]?.activeState ?? null;
    if (member.status === CrewStatus.CONFIRMED) {
      await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.CONFIRMED_TEAM, "CrewMember", member.id, index, {
        workbookId: workbook.id,
        sheetId: sheets.get(ProductionWorkbookSheetType.CONFIRMED_TEAM) ?? "",
        sheetType: ProductionWorkbookSheetType.CONFIRMED_TEAM,
        order: index,
        status: ProductionWorkbookRowStatus.CONFIRMED,
        title: member.name,
        workstream: member.optionCandidate?.group?.workstream?.name ?? member.roleRequirement?.group?.workstream?.name ?? member.optionCandidate?.group?.name ?? member.roleRequirement?.displayLabel ?? member.role?.name ?? null,
        owner: member.role?.name ?? member.roleRequirement?.displayLabel ?? null,
        notes: member.notes,
        data: {
          kind: "confirmed_booking",
          email: member.email,
          phone: member.phone,
          dayRate: member.dayRate ? Number(member.dayRate) : null,
          numberOfDays: Number(member.numberOfDays),
          dietaryNotes: member.dietaryNotes,
          callTime: member.callTime,
          wrapTime: member.wrapTime,
          roleRequirementState: memberSourceRequirementState,
        },
      });
    } else if (member.status !== CrewStatus.RELEASED) {
      await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.OPTIONS_HOLDS, "CrewHold", member.id, index, {
        workbookId: workbook.id,
        sheetId: sheets.get(ProductionWorkbookSheetType.OPTIONS_HOLDS) ?? "",
        sheetType: ProductionWorkbookSheetType.OPTIONS_HOLDS,
        order: index,
        status: mapCrewStatus(member.status),
        title: member.name,
        workstream: member.optionCandidate?.group?.workstream?.name ?? member.roleRequirement?.group?.workstream?.name ?? member.optionCandidate?.group?.name ?? member.roleRequirement?.displayLabel ?? member.role?.name ?? null,
        owner: member.role?.name ?? member.roleRequirement?.displayLabel ?? null,
        notes: member.notes,
        data: { kind: "option_candidate", source: "CrewMember", email: member.email, phone: member.phone },
      });
    }
  }
  const confirmedCrewCandidateIds = new Set(crew.filter((member) => member.status === CrewStatus.CONFIRMED && member.optionCandidateId).map((member) => member.optionCandidateId));

  const itineraryItems = await prisma.crewItineraryItem.findMany({
    where: { itinerary: { productionId } },
    orderBy: [{ date: "asc" }, { order: "asc" }],
    include: { itinerary: { include: { crewMember: true } } },
  });
  for (const [index, item] of itineraryItems.entries()) {
    const targetSheet = itinerarySheet(item.type);
    const route = [item.origin, item.destination].filter(Boolean).join(" to ");
    await upsertSourceRow(workbook.id, sheets, targetSheet, "CrewItineraryItem", item.id, index, {
      workbookId: workbook.id,
      sheetId: sheets.get(targetSheet) ?? "",
      sheetType: targetSheet,
      order: index,
      status: ProductionWorkbookRowStatus.READY,
      title: route || item.provider || item.address || item.itinerary.crewMember.name,
      date: item.date,
      owner: item.passengerName ?? item.itinerary.crewMember.name,
      location: item.address ?? (route || null),
      notes: item.notes,
      data: {
        type: item.type,
        endDate: item.endDate,
        startTime: item.startTime,
        endTime: item.endTime,
        provider: item.provider,
        bookingReference: item.bookingReference,
        bookingUrl: item.bookingUrl,
        terminal: item.terminal,
        gate: item.gate,
        platform: item.platform,
        flightNumber: item.flightNumber,
        trainNumber: item.trainNumber,
        seat: item.seat,
        roomType: item.roomType,
        roomNumber: item.roomNumber,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        cost: item.cost ? Number(item.cost) : null,
      },
    });
  }

  const optionCandidates = await prisma.optionCandidate.findMany({
    where: { productionId },
    orderBy: [{ group: { order: "asc" } }, { order: "asc" }],
    include: { group: { include: { workstream: true, requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } } }, blackbookEntry: { select: { tags: true } }, dateStatuses: { include: { date: true } } },
  });
  for (const [index, candidate] of optionCandidates.entries()) {
    const targetSheet = optionSheetFor(candidate.group.type, candidate.group.name);
    const defaultRequirement = candidate.group.requirements[0] ?? null;
    const candidateData = {
      kind: statusFromCandidate(candidate) === ProductionWorkbookRowStatus.CONFIRMED ? "confirmed_booking" : "option_candidate",
      groupId: candidate.groupId,
      groupName: candidate.group.name,
      blackbookEntryId: candidate.blackbookEntryId,
      source: candidate.blackbookEntry?.tags.includes("workbook-quick-add") ? "Quick added" : candidate.blackbookEntryId ? "Blackbook" : "Unlinked",
      defaultRequirementId: defaultRequirement?.id ?? null,
      roleLabel: defaultRequirement?.displayLabel ?? defaultRequirement?.name ?? candidate.group.name,
      department: candidate.group.workstream?.name ?? null,
      groupType: candidate.group.type,
      roleRequirementState: defaultRequirement?.activeState ?? null,
      subtitle: candidate.subtitle,
      email: candidate.contactEmail,
      phone: candidate.contactPhone,
      website: candidate.website,
      rate: candidate.rate,
      rateUnit: candidate.rateUnit,
      currency: candidate.currency,
      activeState: candidate.activeState,
      datesSummary: candidate.dateStatuses.map((record) => `${record.date.label ?? record.date.date.toISOString().slice(0, 10)}: ${record.status}`).join(", "),
      dateStatuses: candidate.dateStatuses.map((record) => ({
        dateId: record.dateId,
        date: record.date.date,
        label: record.date.label,
        status: record.status,
        notes: record.notes,
      })),
    };
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.OPTIONS_HOLDS, "OptionCandidate", candidate.id, crew.length + index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.OPTIONS_HOLDS) ?? "",
      sheetType: ProductionWorkbookSheetType.OPTIONS_HOLDS,
      order: crew.length + index,
      status: statusFromCandidate(candidate),
      title: candidate.name,
      workstream: candidate.group.workstream?.name ?? candidate.group.name,
      owner: candidate.contactName,
      location: [candidate.addressLine1, candidate.city, candidate.country].filter(Boolean).join(", ") || null,
      notes: candidate.internalNotes,
      data: candidateData,
    });
    if (targetSheet !== ProductionWorkbookSheetType.OPTIONS_HOLDS) {
      await upsertSourceRow(workbook.id, sheets, targetSheet, "OptionCandidate", candidate.id, index, {
        workbookId: workbook.id,
        sheetId: sheets.get(targetSheet) ?? "",
        sheetType: targetSheet,
        order: index,
        status: statusFromCandidate(candidate),
        title: candidate.name,
        workstream: candidate.group.workstream?.name ?? candidate.group.name,
        owner: candidate.contactName,
        location: [candidate.addressLine1, candidate.city, candidate.country].filter(Boolean).join(", ") || null,
        notes: candidate.internalNotes,
        data: candidateData,
      });
    }
    if (statusFromCandidate(candidate) === ProductionWorkbookRowStatus.CONFIRMED && !confirmedCrewCandidateIds.has(candidate.id)) {
      await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.CONFIRMED_TEAM, "ConfirmedOptionCandidate", candidate.id, crew.length + index, {
        workbookId: workbook.id,
        sheetId: sheets.get(ProductionWorkbookSheetType.CONFIRMED_TEAM) ?? "",
        sheetType: ProductionWorkbookSheetType.CONFIRMED_TEAM,
        order: crew.length + index,
        status: ProductionWorkbookRowStatus.CONFIRMED,
        title: candidate.name,
        workstream: candidate.group.workstream?.name ?? candidate.group.name,
        owner: candidate.contactName,
        location: [candidate.addressLine1, candidate.city, candidate.country].filter(Boolean).join(", ") || null,
        notes: candidate.internalNotes,
        data: { ...candidateData, kind: "confirmed_booking" },
      });
    }
  }

  const files = await prisma.jobFile.findMany({ where: { productionId }, orderBy: { uploadedAt: "desc" } });
  for (const [index, file] of files.entries()) {
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.FILES_COMMS, "JobFile", file.id, index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.FILES_COMMS) ?? "",
      sheetType: ProductionWorkbookSheetType.FILES_COMMS,
      order: index,
      status: ProductionWorkbookRowStatus.INTERNAL,
      title: file.originalFilename,
      date: toDateOnly(file.uploadedAt),
      notes: file.notes,
      data: {
        kind: "file",
        folder: file.folder,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        isReceipt: file.isReceipt,
      },
    });
  }

  const emailThreads = await prisma.emailThread.findMany({ where: { linkedProductionId: productionId }, orderBy: { lastMessageAt: "desc" } });
  for (const [index, thread] of emailThreads.entries()) {
    await upsertSourceRow(workbook.id, sheets, ProductionWorkbookSheetType.FILES_COMMS, "EmailThread", thread.id, files.length + index, {
      workbookId: workbook.id,
      sheetId: sheets.get(ProductionWorkbookSheetType.FILES_COMMS) ?? "",
      sheetType: ProductionWorkbookSheetType.FILES_COMMS,
      order: files.length + index,
      status: thread.isUnread ? ProductionWorkbookRowStatus.WAITING : ProductionWorkbookRowStatus.INTERNAL,
      title: thread.subject,
      date: toDateOnly(thread.lastMessageAt),
      owner: thread.participantNames[0] ?? thread.participants[0] ?? null,
      notes: thread.snippet,
      data: {
        kind: "email",
        isRead: thread.isRead,
        isFlagged: thread.isFlagged,
        lastMessageAt: thread.lastMessageAt,
      },
    });
  }

  return getWorkbook(productionId);
}

async function getWorkbook(productionId: string) {
  const workbook = await prisma.productionWorkbook.findUnique({
    where: { productionId },
    include: {
      production: { select: { id: true, title: true, status: true, jobCode: true, clientName: true, brand: true } },
      sheets: { orderBy: { order: "asc" }, include: { rows: { orderBy: { order: "asc" } } } },
    },
  });
  if (!workbook) return null;
  const [dates, workstreams, optionGroups, crewMembers, logisticsCounts] = await Promise.all([
    prisma.productionDate.findMany({ where: { productionId }, orderBy: [{ date: "asc" }, { time: "asc" }] }),
    prisma.projectWorkstream.findMany({
      where: { productionId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { optionGroups: { orderBy: { order: "asc" }, include: { requirements: true, candidates: { include: { dateStatuses: true } } } } },
    }),
    prisma.optionGroup.findMany({
      where: { productionId },
      orderBy: { order: "asc" },
      include: {
        requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }], include: { dateNeeds: true, assignments: true } },
        candidates: { orderBy: { order: "asc" }, include: { dateStatuses: true, photos: { orderBy: { order: "asc" } } } },
      },
    }),
    prisma.crewMember.findMany({
      where: { productionId, hiddenFromCrewList: false },
      orderBy: { createdAt: "asc" },
      include: {
        role: true,
        optionCandidate: { include: { group: true } },
        roleRequirement: { include: { group: true } },
        itinerary: { select: { id: true, status: true, _count: { select: { items: true } } } },
      },
    }),
    prisma.crewItineraryItem.groupBy({
      by: ["type"],
      where: { itinerary: { productionId } },
      _count: { _all: true },
    }),
  ]);
  return {
    ...workbook,
    sheets: workbook.sheets.filter((sheet) => !legacySheetTypes.has(sheet.type)),
    context: {
      dates,
      roleAssignableDates: dates.filter((date) => isRoleAssignableDate(date.status)),
      workstreams,
      optionGroups,
      crewMembers,
      logisticsCounts,
      archiveLinks: archiveLinksFor(productionId),
    },
  };
}

async function requireWorkbookRow(productionId: string, rowId: string) {
  return prisma.productionSheetRow.findFirst({
    where: { id: rowId, workbook: { productionId } },
  });
}

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function archiveLinksFor(productionId: string) {
  return archiveLinks.map((link) => ({
    ...link,
    url: `/productions?production=${encodeURIComponent(productionId)}&tab=${encodeURIComponent(link.tab)}&legacy=true`,
  }));
}

async function confirmCandidateFromWorkbook(productionId: string, candidateId: string, body: Record<string, unknown>) {
  const candidate = await prisma.optionCandidate.findFirst({
    where: { id: candidateId, productionId },
    include: {
      blackbookEntry: true,
      group: { include: { requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } } },
      dateStatuses: true,
    },
  });
  if (!candidate) return null;

  await prisma.optionCandidate.update({
    where: { id: candidate.id },
    data: { activeState: OptionCandidateState.ACTIVE },
  });

  const explicitDateIds = Array.isArray(body.dateIds) ? body.dateIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const dateIds = explicitDateIds.length
    ? explicitDateIds
    : candidate.dateStatuses.length
      ? candidate.dateStatuses.map((record) => record.dateId)
      : (await prisma.productionDate.findMany({ where: { productionId }, select: { id: true } })).map((date) => date.id);
  for (const dateId of dateIds) {
    await prisma.candidateDateStatusRecord.upsert({
      where: { candidateId_dateId: { candidateId: candidate.id, dateId } },
      update: { status: CandidateDateHoldStatus.CONFIRMED, notes: nullableString(body.notes) },
      create: { candidateId: candidate.id, dateId, status: CandidateDateHoldStatus.CONFIRMED, notes: nullableString(body.notes) },
    });
  }

  const requestedRequirementId = nullableString(body.roleRequirementId);
  const requirement = requestedRequirementId
    ? candidate.group.requirements.find((record) => record.id === requestedRequirementId) ?? candidate.group.requirements[0]
    : candidate.group.requirements[0];
  if (!requirement) return candidate;

  const role = await prisma.crewRole.upsert({
    where: { name: requirement.displayLabel || requirement.name },
    update: {},
    create: { name: requirement.displayLabel || requirement.name },
  });
  const existing = await prisma.crewMember.findFirst({
    where: { productionId, optionCandidateId: candidate.id, roleRequirementId: requirement.id },
    select: { id: true },
  });
  const crewData = {
    roleId: role.id,
    roleRequirementId: requirement.id,
    name: candidate.blackbookEntry?.displayName ?? candidate.name,
    email: candidate.blackbookEntry?.email ?? candidate.contactEmail,
    phone: candidate.blackbookEntry?.phone ?? candidate.contactPhone,
    status: CrewStatus.CONFIRMED,
    dayRate: candidate.rate != null ? new Prisma.Decimal(candidate.rate) : null,
    notes: [requirement.notes, candidate.internalNotes, nullableString(body.notes)].filter(Boolean).join("\n") || null,
    blackbookEntryId: candidate.blackbookEntry?.id ?? null,
    optionCandidateId: candidate.id,
    dietaryNotes: candidate.blackbookEntry?.dietaryNotes ?? null,
    dietaryFlags: candidate.blackbookEntry?.dietaryFlags ?? [],
  };
  if (existing) {
    await prisma.crewMember.update({ where: { id: existing.id }, data: crewData });
  } else {
    await prisma.crewMember.create({ data: { productionId, ...crewData } });
  }
  return candidate;
}

async function ensureDepartmentWorkstream(productionId: string, departmentName: string) {
  const department = defaultCrewDepartments.find((item) => item.name.toLowerCase() === departmentName.toLowerCase());
  let workstream = await prisma.projectWorkstream.findFirst({ where: { productionId, name: departmentName } });
  if (!workstream) {
    workstream = await prisma.projectWorkstream.create({
      data: {
        productionId,
        name: departmentName,
        color: department?.color ?? "#0f8f7f",
        order: await prisma.projectWorkstream.count({ where: { productionId } }),
      },
    });
  }
  return workstream;
}

async function createRoleRequirements(productionId: string, body: Record<string, unknown>) {
  const roleName = nullableString(body.name) ?? nullableString(body.displayLabel) ?? "New role";
  const departmentName = nullableString(body.department) ?? nullableString(body.workstreamName) ?? "Production";
  const department = defaultCrewDepartments.find((item) => item.name.toLowerCase() === departmentName.toLowerCase());
  const type = optionType(body.type ?? department?.type ?? defaultTypeForName(roleName));
  const quantity = Math.max(1, Math.min(50, Math.floor(Number(body.quantity ?? body.slots ?? 1))));
  const workstream = await ensureDepartmentWorkstream(productionId, departmentName);
  let group = await prisma.optionGroup.findFirst({ where: { productionId, name: roleName, workstreamId: workstream.id } });
  if (!group) {
    group = await prisma.optionGroup.create({
      data: {
        productionId,
        name: roleName,
        type,
        workstreamId: workstream.id,
        order: await prisma.optionGroup.count({ where: { productionId } }),
      },
    });
  } else if (group.type !== type || group.workstreamId !== workstream.id) {
    group = await prisma.optionGroup.update({ where: { id: group.id }, data: { type, workstreamId: workstream.id } });
  }
  const existingCount = await prisma.optionRequirement.count({ where: { groupId: group.id } });
  const created = [];
  for (let index = 0; index < quantity; index += 1) {
    const slotNumber = existingCount + index + 1;
    created.push(await prisma.optionRequirement.create({
      data: {
        productionId,
        groupId: group.id,
        name: roleName,
        displayLabel: quantity > 1 || existingCount > 0 ? `${roleName} ${slotNumber}` : roleName,
        type,
        slotNumber,
        order: existingCount + index,
        notes: nullableString(body.notes) ?? nullableString(body.rateGuide),
      },
    }));
  }
  return created;
}

async function upsertProductionScheduleDate(productionId: string, body: Record<string, unknown>) {
  const rawDate = nullableString(body.date);
  if (!rawDate) throw new Error("date is required");
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) throw new Error("date is invalid");
  const label = nullableString(body.label);
  const data = {
    dateType: productionDateType(body.dateType),
    status: productionDateStatus(body.status),
    date,
    time: nullableString(body.time),
    location: nullableString(body.location),
    zoomLink: nullableString(body.zoomLink),
    notes: nullableString(body.notes),
    label,
  };
  const existing = await prisma.productionDate.findFirst({
    where: { productionId, date, label },
    select: { id: true },
  });
  if (existing) return prisma.productionDate.update({ where: { id: existing.id }, data });
  return prisma.productionDate.create({ data: { ...data, productionId } });
}

async function updateProductionScheduleDate(productionId: string, dateId: string, body: Record<string, unknown>) {
  const existing = await prisma.productionDate.findFirst({ where: { id: dateId, productionId }, select: { id: true } });
  if (!existing) return null;
  const data: Prisma.ProductionDateUpdateInput = {};
  if ("date" in body) {
    const rawDate = nullableString(body.date);
    if (!rawDate) throw new Error("date is required");
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) throw new Error("date is invalid");
    data.date = date;
  }
  if ("dateType" in body) data.dateType = productionDateType(body.dateType);
  if ("status" in body) data.status = productionDateStatus(body.status);
  if ("time" in body) data.time = nullableString(body.time);
  if ("location" in body) data.location = nullableString(body.location);
  if ("zoomLink" in body) data.zoomLink = nullableString(body.zoomLink);
  if ("notes" in body) data.notes = nullableString(body.notes);
  if ("label" in body) data.label = nullableString(body.label);
  return prisma.productionDate.update({ where: { id: existing.id }, data });
}

async function resolveWorkbookBlackbookEntry(body: Record<string, unknown>, fallbackType: OptionRequirementType) {
  const blackbookEntryId = nullableString(body.blackbookEntryId);
  if (blackbookEntryId) return prisma.blackbookEntry.findUnique({ where: { id: blackbookEntryId } });
  const create = body.createBlackbook && typeof body.createBlackbook === "object" && !Array.isArray(body.createBlackbook)
    ? body.createBlackbook as Record<string, unknown>
    : null;
  if (!create) return null;
  const displayName = nullableString(create.displayName);
  if (!displayName) throw new Error("createBlackbook.displayName is required");
  const fallbackCategory = blackbookCategoryFromOptionType(fallbackType);
  const category = blackbookCategory(create.category, fallbackCategory);
  const entryType = blackbookEntryType(create.entryType, blackbookEntryTypeForCategory(category));
  const email = nullableString(create.email)?.toLowerCase() ?? null;
  const forceCreate = create.forceCreate === true;
  if (!forceCreate && email) {
    const existingByEmail = await prisma.blackbookEntry.findFirst({ where: { email } });
    if (existingByEmail) return existingByEmail;
  }
  if (!forceCreate) {
    const existingByName = await prisma.blackbookEntry.findFirst({ where: { displayName, category } });
    if (existingByName) return existingByName;
  }
  return prisma.blackbookEntry.create({
    data: {
      displayName,
      entryType,
      category,
      lifecycleStatus: category === BlackbookCategory.CREW || category === BlackbookCategory.TALENT ? "IN_TOUCH" : "SUPPLIER",
      companyName: nullableString(create.companyName),
      jobTitle: nullableString(create.jobTitle),
      email,
      phone: nullableString(create.phone),
      website: nullableString(create.website),
      tags: ["workbook-quick-add"],
      city: nullableString(create.city),
      country: nullableString(create.country),
      defaultRate: nullableNumber(create.defaultRate),
      rateUnit: nullableString(create.rateUnit),
      currency: nullableString(create.currency) ?? "GBP",
      notes: nullableString(create.notes),
    },
  });
}

async function setCandidateWorkbookStatus(productionId: string, candidateId: string, status: ProductionWorkbookRowStatus, body: Record<string, unknown>) {
  const candidate = await prisma.optionCandidate.findFirst({ where: { id: candidateId, productionId }, select: { id: true } });
  if (!candidate) return null;
  await prisma.optionCandidate.update({ where: { id: candidate.id }, data: { activeState: candidateStateFromRowStatus(status) } });
  const holdStatus = candidateHoldStatus(status);
  const explicitDateIds = Array.isArray(body.dateIds) ? body.dateIds.filter((id: unknown): id is string => typeof id === "string") : [];
  const dateIds = explicitDateIds.length
    ? explicitDateIds
    : (await prisma.productionDate.findMany({ where: { productionId }, select: { id: true } })).map((date) => date.id);
  for (const dateId of dateIds) {
    await prisma.candidateDateStatusRecord.upsert({
      where: { candidateId_dateId: { candidateId: candidate.id, dateId } },
      update: { status: holdStatus, notes: nullableString(body.notes) },
      create: { candidateId: candidate.id, dateId, status: holdStatus, notes: nullableString(body.notes) },
    });
  }
  return candidate;
}

async function syncCrewListFromOptions(productionId: string) {
  const groups = await prisma.optionGroup.findMany({
    where: { productionId, hiddenFromCrewList: false },
    include: {
      requirements: {
        include: { dateNeeds: true, assignments: true },
        orderBy: [{ order: "asc" }, { slotNumber: "asc" }],
      },
      candidates: {
        include: { blackbookEntry: true, dateStatuses: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { order: "asc" },
  });

  let created = 0;
  let updated = 0;
  const seenPairs = new Set<string>();
  for (const group of groups) {
    const dateIds = Array.from(new Set([
      ...group.requirements.flatMap((requirement) => requirement.dateNeeds.map((need) => need.dateId)),
      ...group.requirements.flatMap((requirement) => requirement.assignments.map((assignment) => assignment.dateId)),
      ...group.candidates.flatMap((candidate) => candidate.dateStatuses.map((status) => status.dateId)),
    ]));
    for (const dateId of dateIds) {
      const requiredRequirements = group.requirements
        .filter((requirement) => requirement.activeState === OptionRequirementState.ACTIVE && requirement.dateNeeds.some((need) => need.dateId === dateId && need.isRequired))
        .sort((a, b) => a.order - b.order || a.slotNumber - b.slotNumber);
      const confirmedCandidates = group.candidates
        .filter((candidate) => candidate.activeState === OptionCandidateState.ACTIVE && candidate.dateStatuses.some((record) => record.dateId === dateId && record.status === CandidateDateHoldStatus.CONFIRMED))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      for (let index = 0; index < requiredRequirements.length; index += 1) {
        const requirement = requiredRequirements[index];
        const assignedCandidateId = requirement.assignments.find((assignment) => assignment.dateId === dateId)?.candidateId;
        const candidate = assignedCandidateId ? group.candidates.find((item) => item.id === assignedCandidateId) : confirmedCandidates[index];
        if (!candidate) continue;
        const pairKey = `${requirement.id}:${candidate.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const roleName = requirement.displayLabel || requirement.name;
        const role = await prisma.crewRole.upsert({
          where: { name: roleName },
          update: {},
          create: { name: roleName },
        });
        const crewData = {
          roleId: role.id,
          roleRequirementId: requirement.id,
          name: candidate.blackbookEntry?.displayName ?? candidate.name,
          email: candidate.blackbookEntry?.email ?? candidate.contactEmail,
          phone: candidate.blackbookEntry?.phone ?? candidate.contactPhone,
          status: CrewStatus.CONFIRMED,
          dayRate: candidate.rate != null ? new Prisma.Decimal(candidate.rate) : null,
          notes: [requirement.notes, candidate.internalNotes].filter(Boolean).join("\n") || null,
          blackbookEntryId: candidate.blackbookEntry?.id ?? null,
          optionCandidateId: candidate.id,
          dietaryNotes: candidate.blackbookEntry?.dietaryNotes ?? null,
          dietaryFlags: candidate.blackbookEntry?.dietaryFlags ?? [],
        };
        const existing = await prisma.crewMember.findFirst({
          where: { productionId, optionCandidateId: candidate.id, roleRequirementId: requirement.id },
          select: { id: true },
        });
        if (existing) {
          await prisma.crewMember.update({ where: { id: existing.id }, data: crewData });
          updated += 1;
        } else {
          await prisma.crewMember.create({ data: { productionId, ...crewData } });
          created += 1;
        }
      }
    }
  }
  return { created, updated, totalAssignments: seenPairs.size };
}

router.get("/:productionId", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.json({ enabled: false, workbook: null });
  await bootstrapWorkbook(req.params.productionId);
  const workbook = await getWorkbook(req.params.productionId);
  if (!workbook) return res.status(404).json({ error: "Workbook has not been bootstrapped" });
  res.json({ enabled: true, workbook });
});

router.post("/:productionId/bootstrap", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const result = await bootstrapWorkbook(req.params.productionId);
  if (!result) return res.status(404).json({ error: "Production not found" });
  if (!("sheets" in result)) return res.status(409).json({ error: "Archived productions stay in the legacy archive" });
  res.json({ enabled: true, workbook: result });
});

router.post("/:productionId/sheets/:sheetType/rows", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const targetSheetType = sheetType(req.params.sheetType);
  if (!targetSheetType) return res.status(400).json({ error: "Invalid sheet type" });

  const workbook = await prisma.productionWorkbook.findUnique({
    where: { productionId: req.params.productionId },
    include: { sheets: true },
  });
  if (!workbook) return res.status(404).json({ error: "Workbook not found" });
  const sheet = workbook.sheets.find((candidate) => candidate.type === targetSheetType);
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });

  const max = await prisma.productionSheetRow.aggregate({
    where: { workbookId: workbook.id, sheetType: targetSheetType },
    _max: { order: true },
  });

  const row = await prisma.productionSheetRow.create({
    data: {
      workbookId: workbook.id,
      sheetId: sheet.id,
      sheetType: targetSheetType,
      order: (max._max.order ?? -1) + 1,
      status: rowStatus(req.body.status) ?? ProductionWorkbookRowStatus.TODO,
      title: nullableString(req.body.title) ?? "Untitled row",
      date: req.body.date ? new Date(req.body.date) : null,
      startAt: req.body.startAt ? new Date(req.body.startAt) : null,
      endAt: req.body.endAt ? new Date(req.body.endAt) : null,
      workstream: nullableString(req.body.workstream),
      owner: nullableString(req.body.owner),
      location: nullableString(req.body.location),
      notes: nullableString(req.body.notes),
      data: typeof req.body.data === "object" && req.body.data !== null ? req.body.data : {},
    },
  });

  res.status(201).json({ row });
});

router.patch("/:productionId/rows/reorder", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const rowIds: string[] = Array.isArray(req.body.rowIds) ? req.body.rowIds.filter((id: unknown): id is string => typeof id === "string") : [];
  if (!rowIds.length) return res.status(400).json({ error: "rowIds is required" });

  const rows = await prisma.productionSheetRow.findMany({
    where: { id: { in: rowIds }, workbook: { productionId: req.params.productionId } },
    select: { id: true, sheetType: true },
  });
  if (rows.length !== rowIds.length) return res.status(400).json({ error: "One or more rows do not belong to this workbook" });
  const sheetTypes = new Set(rows.map((row) => row.sheetType));
  if (sheetTypes.size > 1) return res.status(400).json({ error: "Rows can only be reordered within one sheet" });

  await prisma.$transaction(rowIds.map((id: string, order: number) => prisma.productionSheetRow.update({ where: { id }, data: { order } })));
  res.json({ ok: true });
});

router.patch("/:productionId/rows/:rowId", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const row = await requireWorkbookRow(req.params.productionId, req.params.rowId);
  if (!row) return res.status(404).json({ error: "Row not found" });

  const data: Prisma.ProductionSheetRowUpdateInput = {};
  if ("title" in req.body) data.title = nullableString(req.body.title);
  if ("status" in req.body) {
    const status = rowStatus(req.body.status);
    if (!status && req.body.status !== null) return res.status(400).json({ error: "Invalid status" });
    data.status = status ?? null;
  }
  if ("date" in req.body) data.date = req.body.date ? new Date(req.body.date) : null;
  if ("startAt" in req.body) data.startAt = req.body.startAt ? new Date(req.body.startAt) : null;
  if ("endAt" in req.body) data.endAt = req.body.endAt ? new Date(req.body.endAt) : null;
  if ("workstream" in req.body) data.workstream = nullableString(req.body.workstream);
  if ("owner" in req.body) data.owner = nullableString(req.body.owner);
  if ("location" in req.body) data.location = nullableString(req.body.location);
  if ("notes" in req.body) data.notes = nullableString(req.body.notes);
  if ("order" in req.body && Number.isFinite(Number(req.body.order))) data.order = Number(req.body.order);
  if ("data" in req.body) {
    if (typeof req.body.data !== "object" || req.body.data === null || Array.isArray(req.body.data)) {
      return res.status(400).json({ error: "data must be an object" });
    }
    data.data = req.body.data;
  }

  let shouldRefreshWorkbook = false;
  if (row.sourceEntityType === "OptionRequirement" && row.sourceEntityId) {
    const requirement = await prisma.optionRequirement.findFirst({
      where: { id: row.sourceEntityId, productionId: req.params.productionId },
      include: { group: true },
    });
    if (requirement) {
      const rowData = "data" in req.body ? req.body.data as Prisma.JsonObject : jsonObject(row.data);
      const requirementUpdate: Prisma.OptionRequirementUpdateInput = {};
      const groupUpdate: Prisma.OptionGroupUpdateInput = {};
      if ("title" in req.body) {
        const title = nullableString(req.body.title);
        if (title) {
          requirementUpdate.displayLabel = title;
          requirementUpdate.name = title;
          groupUpdate.name = title;
        }
      }
      if ("notes" in req.body) requirementUpdate.notes = nullableString(req.body.notes);
      if ("status" in req.body) {
        const state = requirementStateFromRowStatus(rowStatus(req.body.status) ?? null);
        if (state) requirementUpdate.activeState = state;
      }
      if ("order" in req.body && Number.isFinite(Number(req.body.order))) requirementUpdate.order = Number(req.body.order);
      if ("workstream" in req.body) {
        const departmentName = nullableString(req.body.workstream);
        if (departmentName) {
          const workstream = await ensureDepartmentWorkstream(req.params.productionId, departmentName);
          groupUpdate.workstream = { connect: { id: workstream.id } };
        }
      }
      const groupType = optionType(rowData.groupType);
      if (rowData.groupType && groupType) {
        requirementUpdate.type = groupType;
        groupUpdate.type = groupType;
      }
      if (Object.keys(requirementUpdate).length) await prisma.optionRequirement.update({ where: { id: requirement.id }, data: requirementUpdate });
      if (Object.keys(groupUpdate).length) await prisma.optionGroup.update({ where: { id: requirement.groupId }, data: groupUpdate });
      shouldRefreshWorkbook = true;
    }
  }
  if ("status" in req.body && (row.sourceEntityType === "OptionCandidate" || row.sourceEntityType === "ConfirmedOptionCandidate") && row.sourceEntityId) {
    const status = rowStatus(req.body.status);
    if (status) {
      await setCandidateWorkbookStatus(req.params.productionId, row.sourceEntityId, status, req.body);
      shouldRefreshWorkbook = true;
    }
  }
  if ("status" in req.body && (row.sourceEntityType === "CrewMember" || row.sourceEntityType === "CrewHold") && row.sourceEntityId) {
    const status = rowStatus(req.body.status);
    const crewStatus = status === ProductionWorkbookRowStatus.FIRST_OPTION
      ? CrewStatus.FIRST_OPTION
      : status === ProductionWorkbookRowStatus.SECOND_OPTION
        ? CrewStatus.SECOND_OPTION
        : status === ProductionWorkbookRowStatus.CONFIRMED
          ? CrewStatus.CONFIRMED
          : status === ProductionWorkbookRowStatus.RELEASED
            ? CrewStatus.RELEASED
            : status === ProductionWorkbookRowStatus.REQUESTED
              ? CrewStatus.REQUESTED
              : null;
    if (crewStatus) {
      await prisma.crewMember.updateMany({ where: { id: row.sourceEntityId, productionId: req.params.productionId }, data: { status: crewStatus } });
      shouldRefreshWorkbook = true;
    }
  }

  const updated = await prisma.productionSheetRow.update({ where: { id: row.id }, data });
  if (shouldRefreshWorkbook) {
    const workbook = await bootstrapWorkbook(req.params.productionId);
    const refreshed = workbook && "sheets" in workbook
      ? workbook.sheets.flatMap((sheet) => sheet.rows).find((candidate) => candidate.id === updated.id)
      : null;
    if (refreshed) return res.json({ row: refreshed, workbook });
  }
  res.json({ row: updated });
});

router.post("/:productionId/setup", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });

  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  for (const raw of dates) {
    if (!raw || typeof raw !== "object" || !("date" in raw) || !raw.date) continue;
    await upsertProductionScheduleDate(production.id, raw as Record<string, unknown>);
  }

  const workstreams = Array.isArray(req.body.workstreams) ? req.body.workstreams : [];
  for (const raw of workstreams) {
    const name = raw && typeof raw === "object" ? nullableString((raw as Record<string, unknown>).name) : null;
    if (!name) continue;
    const existing = await prisma.projectWorkstream.findFirst({ where: { productionId: production.id, name }, select: { id: true } });
    if (existing) continue;
    const order = await prisma.projectWorkstream.count({ where: { productionId: production.id } });
    await prisma.projectWorkstream.create({
      data: {
        productionId: production.id,
        name,
        color: nullableString((raw as Record<string, unknown>).color) ?? "#0f8f7f",
        order,
      },
    });
  }

  const roles = Array.isArray(req.body.roles) ? req.body.roles : [];
  for (const raw of roles) {
    if (!raw || typeof raw !== "object") continue;
    const body = raw as Record<string, unknown>;
    const name = nullableString(body.name);
    if (!name) continue;
    const quantity = Math.max(1, Math.floor(Number(body.quantity ?? body.slots ?? 1)));
    const type = optionType(body.type ?? defaultTypeForName(name));
    const workstreamName = nullableString(body.workstreamName) ?? nullableString(body.workstream) ?? type.replace(/_/g, " ");
    let workstream = await prisma.projectWorkstream.findFirst({ where: { productionId: production.id, name: workstreamName } });
    if (!workstream) {
      workstream = await prisma.projectWorkstream.create({
        data: {
          productionId: production.id,
          name: workstreamName,
          color: "#0f8f7f",
          order: await prisma.projectWorkstream.count({ where: { productionId: production.id } }),
        },
      });
    }
    let group = await prisma.optionGroup.findFirst({ where: { productionId: production.id, name } });
    if (!group) {
      group = await prisma.optionGroup.create({
        data: {
          productionId: production.id,
          name,
          type,
          workstreamId: workstream.id,
          order: await prisma.optionGroup.count({ where: { productionId: production.id } }),
        },
      });
    }
    const existingRequirements = await prisma.optionRequirement.count({ where: { groupId: group.id } });
    for (let index = existingRequirements; index < quantity; index += 1) {
      await prisma.optionRequirement.create({
        data: {
          productionId: production.id,
          groupId: group.id,
          name,
          displayLabel: quantity > 1 ? `${name} ${index + 1}` : name,
          type,
          slotNumber: index + 1,
          order: index,
          notes: nullableString(body.notes),
        },
      });
    }
  }

  const workbook = await bootstrapWorkbook(production.id);
  res.status(201).json({ workbook });
});

router.post("/:productionId/role-plan/requirements", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  const created = await createRoleRequirements(production.id, req.body);
  const workbook = await bootstrapWorkbook(production.id);
  res.status(201).json({ requirements: created, workbook });
});

router.post("/:productionId/scope-dates", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  try {
    const date = await upsertProductionScheduleDate(production.id, req.body);
    const workbook = await bootstrapWorkbook(production.id);
    res.status(201).json({ date, workbook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create production date" });
  }
});

router.patch("/:productionId/scope-dates/:dateId", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  try {
    const date = await updateProductionScheduleDate(req.params.productionId, req.params.dateId, req.body);
    if (!date) return res.status(404).json({ error: "Production date not found" });
    const workbook = await bootstrapWorkbook(req.params.productionId);
    res.json({ date, workbook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not update production date" });
  }
});

router.post("/:productionId/scope-dates/bulk", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  const dates = Array.isArray(req.body.dates) ? req.body.dates : [];
  const created = [];
  try {
    for (const raw of dates) {
      if (!raw || typeof raw !== "object") continue;
      created.push(await upsertProductionScheduleDate(production.id, raw as Record<string, unknown>));
    }
    const workbook = await bootstrapWorkbook(production.id);
    res.status(201).json({ dates: created, workbook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not create production dates" });
  }
});

router.patch("/:productionId/role-plan/requirements/:requirementId", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const requirement = await prisma.optionRequirement.findFirst({
    where: { id: req.params.requirementId, productionId: req.params.productionId },
    include: { group: true },
  });
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });
  const requirementUpdate: Prisma.OptionRequirementUpdateInput = {};
  const groupUpdate: Prisma.OptionGroupUpdateInput = {};
  const label = nullableString(req.body.displayLabel) ?? nullableString(req.body.name);
  if (label) {
    requirementUpdate.displayLabel = label;
    requirementUpdate.name = label;
    groupUpdate.name = label;
  }
  if ("notes" in req.body) requirementUpdate.notes = nullableString(req.body.notes);
  if ("activeState" in req.body && typeof req.body.activeState === "string" && req.body.activeState in OptionRequirementState) {
    requirementUpdate.activeState = req.body.activeState as OptionRequirementState;
  }
  if ("status" in req.body) {
    const state = requirementStateFromRowStatus(rowStatus(req.body.status) ?? null);
    if (state) requirementUpdate.activeState = state;
  }
  if ("type" in req.body) {
    const type = optionType(req.body.type);
    requirementUpdate.type = type;
    groupUpdate.type = type;
  }
  if ("order" in req.body && Number.isFinite(Number(req.body.order))) requirementUpdate.order = Number(req.body.order);
  const department = nullableString(req.body.department) ?? nullableString(req.body.workstreamName);
  if (department) {
    const workstream = await ensureDepartmentWorkstream(req.params.productionId, department);
    groupUpdate.workstream = { connect: { id: workstream.id } };
  }
  if (Object.keys(requirementUpdate).length) await prisma.optionRequirement.update({ where: { id: requirement.id }, data: requirementUpdate });
  if (Object.keys(groupUpdate).length) await prisma.optionGroup.update({ where: { id: requirement.groupId }, data: groupUpdate });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.post("/:productionId/role-plan/requirements/:requirementId/duplicate", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const requirement = await prisma.optionRequirement.findFirst({
    where: { id: req.params.requirementId, productionId: req.params.productionId },
    include: { dateNeeds: true },
  });
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });
  const slotNumber = await prisma.optionRequirement.count({ where: { groupId: requirement.groupId } }) + 1;
  const created = await prisma.optionRequirement.create({
    data: {
      productionId: requirement.productionId,
      groupId: requirement.groupId,
      name: requirement.name,
      displayLabel: `${requirement.name} ${slotNumber}`,
      type: requirement.type,
      slotNumber,
      activeState: requirement.activeState,
      notes: requirement.notes,
      order: requirement.order + 1,
    },
  });
  if (requirement.dateNeeds.length) {
    await prisma.requirementDateNeed.createMany({
      data: requirement.dateNeeds.map((need) => ({
        requirementId: created.id,
        dateId: need.dateId,
        isRequired: need.isRequired,
        notes: need.notes,
      })),
      skipDuplicates: true,
    });
  }
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.status(201).json({ requirement: created, workbook });
});

router.patch("/:productionId/role-plan/requirements/:requirementId/dates/:dateId", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const requirement = await prisma.optionRequirement.findFirst({ where: { id: req.params.requirementId, productionId: req.params.productionId }, select: { id: true } });
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });
  const date = await prisma.productionDate.findFirst({ where: { id: req.params.dateId, productionId: req.params.productionId }, select: { id: true } });
  if (!date) return res.status(404).json({ error: "Date not found" });
  await prisma.requirementDateNeed.upsert({
    where: { requirementId_dateId: { requirementId: requirement.id, dateId: date.id } },
    update: { isRequired: req.body.isRequired ?? false, notes: nullableString(req.body.notes) },
    create: { requirementId: requirement.id, dateId: date.id, isRequired: req.body.isRequired ?? true, notes: nullableString(req.body.notes) },
  });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.patch("/:productionId/role-plan/requirements/:requirementId/dates/:dateId/assignment", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const requirement = await prisma.optionRequirement.findFirst({
    where: { id: req.params.requirementId, productionId: req.params.productionId },
    select: { id: true, groupId: true },
  });
  if (!requirement) return res.status(404).json({ error: "Requirement not found" });
  const candidateId = nullableString(req.body.candidateId);
  if (!candidateId) {
    await prisma.optionSlotAssignment.deleteMany({ where: { requirementId: requirement.id, dateId: req.params.dateId } });
    const workbook = await bootstrapWorkbook(req.params.productionId);
    return res.json({ workbook });
  }
  const candidate = await prisma.optionCandidate.findFirst({ where: { id: candidateId, productionId: req.params.productionId }, select: { id: true, groupId: true } });
  if (!candidate || candidate.groupId !== requirement.groupId) return res.status(400).json({ error: "Candidate must belong to the same role group" });
  await prisma.optionSlotAssignment.upsert({
    where: { requirementId_dateId: { requirementId: requirement.id, dateId: req.params.dateId } },
    update: { candidateId: candidate.id, notes: nullableString(req.body.notes) },
    create: { requirementId: requirement.id, dateId: req.params.dateId, candidateId: candidate.id, notes: nullableString(req.body.notes) },
  });
  await prisma.candidateDateStatusRecord.upsert({
    where: { candidateId_dateId: { candidateId: candidate.id, dateId: req.params.dateId } },
    update: { status: CandidateDateHoldStatus.CONFIRMED },
    create: { candidateId: candidate.id, dateId: req.params.dateId, status: CandidateDateHoldStatus.CONFIRMED },
  });
  await prisma.requirementDateNeed.upsert({
    where: { requirementId_dateId: { requirementId: requirement.id, dateId: req.params.dateId } },
    update: { isRequired: true },
    create: { requirementId: requirement.id, dateId: req.params.dateId, isRequired: true },
  });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.post("/:productionId/rows/from-blackbook", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const blackbookEntryId = nullableString(req.body.blackbookEntryId);
  const name = nullableString(req.body.name);
  const hasCreateBlackbook = req.body.createBlackbook && typeof req.body.createBlackbook === "object" && !Array.isArray(req.body.createBlackbook);
  const requestedRequirementId = nullableString(req.body.roleRequirementId);
  const requestedGroupId = nullableString(req.body.groupId);
  const requestedGroupName = nullableString(req.body.groupName) ?? nullableString(req.body.roleName) ?? "Options";
  if (!blackbookEntryId && !name && !hasCreateBlackbook) return res.status(400).json({ error: "blackbookEntryId, createBlackbook, or name is required" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  const targetRequirement = requestedRequirementId
    ? await prisma.optionRequirement.findFirst({
      where: { id: requestedRequirementId, productionId: production.id },
      include: { group: { include: { workstream: true, requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } } } },
    })
    : null;
  if (requestedRequirementId && !targetRequirement) return res.status(404).json({ error: "Role Plan slot not found" });
  if (targetRequirement && targetRequirement.activeState !== OptionRequirementState.ACTIVE) {
    return res.status(400).json({ error: "Options can only be added to active Role Plan slots. Reactivate the slot first." });
  }
  let group = targetRequirement?.group ?? (requestedGroupId
    ? await prisma.optionGroup.findFirst({
      where: { id: requestedGroupId, productionId: production.id },
      include: { workstream: true, requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } },
    })
    : null);
  if (requestedGroupId && !group) return res.status(404).json({ error: "Role Plan group not found" });
  if (!targetRequirement && group?.requirements.length && !group.requirements.some((requirement) => requirement.activeState === OptionRequirementState.ACTIVE)) {
    return res.status(400).json({ error: "Options can only be added to active Role Plan groups. Reactivate or create an active slot first." });
  }
  const groupName = group?.name ?? requestedGroupName;
  const type = group?.type ?? optionType(req.body.type ?? defaultTypeForName(groupName));
  const workstreamName = group?.workstream?.name ?? nullableString(req.body.workstreamName) ?? groupName;
  let workstream = group?.workstream ?? await prisma.projectWorkstream.findFirst({ where: { productionId: production.id, name: workstreamName } });
  if (!workstream) {
    workstream = await prisma.projectWorkstream.create({
      data: {
        productionId: production.id,
        name: workstreamName,
        color: "#0f8f7f",
        order: await prisma.projectWorkstream.count({ where: { productionId: production.id } }),
      },
    });
  }
  if (!group) {
    group = await prisma.optionGroup.create({
      data: {
        productionId: production.id,
        name: groupName,
        type,
        workstreamId: workstream.id,
        order: await prisma.optionGroup.count({ where: { productionId: production.id } }),
      },
      include: { workstream: true, requirements: { orderBy: [{ order: "asc" }, { slotNumber: "asc" }] } },
    });
  }
  const requirements = "requirements" in group ? group.requirements : [];
  if (!targetRequirement && requirements.length === 0) {
    await prisma.optionRequirement.create({
      data: {
        productionId: production.id,
        groupId: group.id,
        name: groupName,
        displayLabel: groupName,
        type,
        slotNumber: 1,
        order: 0,
      },
    });
  }
  let entry;
  try {
    entry = await resolveWorkbookBlackbookEntry(req.body, type);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not create Blackbook entry" });
  }
  if (blackbookEntryId && !entry) return res.status(404).json({ error: "Blackbook entry not found" });

  const existingCandidate = entry
    ? await prisma.optionCandidate.findFirst({
      where: { productionId: production.id, groupId: group.id, blackbookEntryId: entry.id },
      orderBy: { createdAt: "asc" },
    })
    : null;
  const candidate = existingCandidate ?? await prisma.optionCandidate.create({
    data: {
      productionId: production.id,
      groupId: group.id,
      blackbookEntryId: entry?.id,
      name: name ?? entry?.displayName ?? nullableString((req.body.createBlackbook as Record<string, unknown> | undefined)?.displayName) ?? "New option",
      subtitle: nullableString(req.body.subtitle) ?? entry?.companyName,
      website: nullableString(req.body.website) ?? entry?.website,
      contactName: nullableString(req.body.contactName),
      contactEmail: nullableString(req.body.contactEmail) ?? entry?.email,
      contactPhone: nullableString(req.body.contactPhone) ?? entry?.phone,
      bookUrl: nullableString(req.body.bookUrl) ?? entry?.bookUrl,
      socialUrl: nullableString(req.body.socialUrl) ?? entry?.socialUrl,
      pdfUrl: nullableString(req.body.pdfUrl) ?? entry?.polasUrl ?? entry?.selfTapeUrl,
      addressLine1: nullableString(req.body.addressLine1) ?? entry?.addressLine1,
      addressLine2: nullableString(req.body.addressLine2) ?? entry?.addressLine2,
      city: nullableString(req.body.city) ?? entry?.city,
      region: nullableString(req.body.region) ?? entry?.region,
      postcode: nullableString(req.body.postcode) ?? entry?.postcode,
      country: nullableString(req.body.country) ?? entry?.country,
      locationType: nullableString(req.body.locationType) ?? entry?.locationType,
      latitude: Number.isFinite(Number(req.body.latitude)) ? Number(req.body.latitude) : entry?.latitude,
      longitude: Number.isFinite(Number(req.body.longitude)) ? Number(req.body.longitude) : entry?.longitude,
      rate: Number.isFinite(Number(req.body.rate)) ? Number(req.body.rate) : entry?.defaultRate,
      rateUnit: nullableString(req.body.rateUnit) ?? entry?.rateUnit,
      currency: nullableString(req.body.currency) ?? entry?.currency ?? "GBP",
      internalNotes: nullableString(req.body.notes),
      order: await prisma.optionCandidate.count({ where: { groupId: group.id } }),
    },
  });

  const dateIds = Array.isArray(req.body.dateIds) ? req.body.dateIds.filter((id: unknown): id is string => typeof id === "string") : [];
  for (const dateId of dateIds) {
    await prisma.candidateDateStatusRecord.upsert({
      where: { candidateId_dateId: { candidateId: candidate.id, dateId } },
      update: { status: candidateHoldStatus(req.body.status), notes: nullableString(req.body.notes) },
      create: { candidateId: candidate.id, dateId, status: candidateHoldStatus(req.body.status), notes: nullableString(req.body.notes) },
    });
  }

  const workbook = await bootstrapWorkbook(production.id);
  res.status(201).json({ candidate, workbook });
});

router.post("/:productionId/rows/:rowId/confirm", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const row = await requireWorkbookRow(req.params.productionId, req.params.rowId);
  if (!row) return res.status(404).json({ error: "Row not found" });

  if (row.sourceEntityType === "CrewMember" || row.sourceEntityType === "CrewHold") {
    await prisma.crewMember.updateMany({
      where: { id: row.sourceEntityId ?? "", productionId: req.params.productionId },
      data: { status: CrewStatus.CONFIRMED },
    });
  } else if (row.sourceEntityType === "OptionCandidate" || row.sourceEntityType === "ConfirmedOptionCandidate") {
    const rowData = jsonObject(row.data);
    await confirmCandidateFromWorkbook(req.params.productionId, row.sourceEntityId ?? "", {
      ...req.body,
      roleRequirementId: nullableString(req.body.roleRequirementId) ?? nullableString(rowData.defaultRequirementId),
    });
  }

  await prisma.productionSheetRow.update({
    where: { id: row.id },
    data: { status: ProductionWorkbookRowStatus.CONFIRMED, data: { ...jsonObject(row.data), kind: "confirmed_booking", confirmedAt: new Date().toISOString() } },
  });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.post("/:productionId/rows/:rowId/release", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const row = await requireWorkbookRow(req.params.productionId, req.params.rowId);
  if (!row) return res.status(404).json({ error: "Row not found" });

  if (row.sourceEntityType === "CrewMember" || row.sourceEntityType === "CrewHold") {
    await prisma.crewMember.updateMany({
      where: { id: row.sourceEntityId ?? "", productionId: req.params.productionId },
      data: { status: CrewStatus.RELEASED },
    });
  } else if (row.sourceEntityType === "OptionCandidate" || row.sourceEntityType === "ConfirmedOptionCandidate") {
    await prisma.optionCandidate.updateMany({
      where: { id: row.sourceEntityId ?? "", productionId: req.params.productionId },
      data: { activeState: OptionCandidateState.RELEASED },
    });
    await prisma.candidateDateStatusRecord.updateMany({
      where: { candidateId: row.sourceEntityId ?? "" },
      data: { status: CandidateDateHoldStatus.RELEASED, notes: nullableString(req.body.notes) },
    });
  }

  await prisma.productionSheetRow.update({
    where: { id: row.id },
    data: { status: ProductionWorkbookRowStatus.RELEASED, data: { ...jsonObject(row.data), releasedAt: new Date().toISOString(), releaseNotes: nullableString(req.body.notes) } },
  });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.post("/:productionId/rows/:rowId/status", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const row = await requireWorkbookRow(req.params.productionId, req.params.rowId);
  if (!row) return res.status(404).json({ error: "Row not found" });
  const status = rowStatus(req.body.status);
  if (!status) return res.status(400).json({ error: "Invalid status" });

  if ((row.sourceEntityType === "OptionCandidate" || row.sourceEntityType === "ConfirmedOptionCandidate") && row.sourceEntityId) {
    await setCandidateWorkbookStatus(req.params.productionId, row.sourceEntityId, status, req.body);
  } else if ((row.sourceEntityType === "CrewMember" || row.sourceEntityType === "CrewHold") && row.sourceEntityId) {
    const crewStatus = status === ProductionWorkbookRowStatus.FIRST_OPTION
      ? CrewStatus.FIRST_OPTION
      : status === ProductionWorkbookRowStatus.SECOND_OPTION
        ? CrewStatus.SECOND_OPTION
        : status === ProductionWorkbookRowStatus.CONFIRMED
          ? CrewStatus.CONFIRMED
          : status === ProductionWorkbookRowStatus.RELEASED
            ? CrewStatus.RELEASED
            : CrewStatus.REQUESTED;
    await prisma.crewMember.updateMany({ where: { id: row.sourceEntityId, productionId: req.params.productionId }, data: { status: crewStatus } });
  } else if (row.sourceEntityType === "OptionRequirement" && row.sourceEntityId) {
    const state = requirementStateFromRowStatus(status);
    if (state) await prisma.optionRequirement.updateMany({ where: { id: row.sourceEntityId, productionId: req.params.productionId }, data: { activeState: state } });
  }

  await prisma.productionSheetRow.update({
    where: { id: row.id },
    data: { status, data: { ...jsonObject(row.data), statusUpdatedAt: new Date().toISOString() } },
  });
  const workbook = await bootstrapWorkbook(req.params.productionId);
  res.json({ workbook });
});

router.post("/:productionId/sync-crew-list", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  const result = await syncCrewListFromOptions(production.id);
  const workbook = await bootstrapWorkbook(production.id);
  res.json({ ...result, synced: true, workbook });
});

router.post("/:productionId/rows/:rowId/chase", async (req: Request, res: Response) => {
  if (!workbookEnabled()) return res.status(403).json({ error: "Production workbooks are disabled" });
  const row = await requireWorkbookRow(req.params.productionId, req.params.rowId);
  if (!row) return res.status(404).json({ error: "Row not found" });

  const action = await prisma.projectAction.create({
    data: {
      productionId: req.params.productionId,
      title: nullableString(req.body.title) ?? `Chase ${row.title ?? "workbook row"}`,
      description: nullableString(req.body.notes) ?? row.notes,
      status: ProjectActionStatus.TODO,
      actionType: ProjectActionType.TASK,
      visibility: "INTERNAL",
      startAt: req.body.dueDate ? new Date(String(req.body.dueDate)) : null,
      isAllDay: true,
    },
  });

  const updated = await prisma.productionSheetRow.update({
    where: { id: row.id },
    data: {
      status: ProductionWorkbookRowStatus.NEEDS_CHASE,
      data: { ...jsonObject(row.data), lastChaseActionId: action.id, lastChasedAt: new Date().toISOString() },
    },
  });
  res.status(201).json({ action, row: updated });
});

router.get("/:productionId/archive-links", async (req: Request, res: Response) => {
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) return res.status(404).json({ error: "Production not found" });
  res.json({
    links: archiveLinksFor(production.id),
  });
});

export default router;
