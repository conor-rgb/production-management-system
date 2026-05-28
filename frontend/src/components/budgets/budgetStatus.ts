import type { BudgetLineItem, SubCostLineType } from "../../lib/types";

export type DotState = "YELLOW" | "PURPLE" | "BLUE" | "LIGHT_GREEN" | "DARK_GREEN" | "GRAY";

export const DOT_COLORS: Record<DotState, string> = {
  YELLOW: "#f59e0b",
  PURPLE: "#8b5cf6",
  BLUE: "#3b82f6",
  LIGHT_GREEN: "#86efac",
  DARK_GREEN: "#16a34a",
  GRAY: "#9ca3af",
};

export const STATE_BADGES: Record<DotState, { text: string; bg: string; color: string; border: string }> = {
  YELLOW: { text: "no cost lines", bg: "#fff8ec", color: "#d97706", border: "#fde68a" },
  PURPLE: { text: "PO raised", bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
  BLUE: { text: "invoice in", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  LIGHT_GREEN: { text: "paid · unreconciled", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  DARK_GREEN: { text: "reconciled", bg: "#dcfce7", color: "#15803d", border: "#86efac" },
  GRAY: { text: "closed", bg: "var(--color-background-secondary)", color: "var(--color-text-tertiary)", border: "var(--color-border-tertiary)" },
};

export const COST_LINE_BACKGROUNDS: Record<SubCostLineType, string> = {
  PO: "#fbf8ff",
  BILL: "#f5f9ff",
  RECEIPT: "#f5fcf7",
};

export function getDotState(lineItem: BudgetLineItem): DotState {
  if (lineItem.isClosed) return "GRAY";
  const costLines = lineItem.subCosts ?? [];
  if (costLines.length === 0) return "YELLOW";
  if (costLines.some((costLine) => costLine.lineType === "PO")) return "PURPLE";
  if (costLines.some((costLine) => costLine.lineType === "BILL" && !costLine.isPaid)) return "BLUE";
  if (costLines.every((costLine) => costLine.isPaid)) {
    return costLines.every((costLine) => costLine.freeAgentTransactionId !== null && costLine.freeAgentTransactionId !== undefined) ? "DARK_GREEN" : "LIGHT_GREEN";
  }
  return "BLUE";
}
