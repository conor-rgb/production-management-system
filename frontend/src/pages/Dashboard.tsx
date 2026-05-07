import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { CalendarMiniWidget } from "../components/calendar/CalendarView";
import {
  ACTIVE_STAGES,
  DATE_TYPE_LABELS,
  PRODUCTION_STATUS_LABELS,
  STAGE_COLOURS,
  STAGE_LABELS,
  daysOverdue,
  formatCurrency,
  type Budget,
  type BudgetLineItem,
  type Production,
  type ProductionDate,
  type ProductionStatus,
  type ReceiptCapture,
} from "../lib/types";
import { AlertCircle, TrendingUp, Film, Users, Mail, Camera, Upload, X, Loader2, CheckCircle, Trash2 } from "lucide-react";

interface OverdueItem {
  id: string;
  title: string;
  clientName?: string;
  brand?: string;
  followUpDate: string;
  stage: string;
  value?: string;
}

interface DashboardData {
  opportunityCount: number;
  productionCount: number;
  contactCount: number;
  companyCount: number;
  stageCounts: Record<string, number>;
  overdueOpportunities: OverdueItem[];
  todaysAgenda: ProductionDate[];
  activeProductions: {
    id: string;
    title: string;
    jobCode?: string;
    clientName?: string;
    brand?: string;
    status: ProductionStatus;
    variance: number;
    overBudget: boolean;
    nextDate?: ProductionDate;
  }[];
}

interface OfflineReceipt {
  id: string;
  base64: string;
  mimeType: string;
  filename: string;
  capturedAt: string;
  syncAttempts: number;
}

const AICP_SECTIONS = [
  ["A", "Pre-Production & Wrap Labor"],
  ["B", "Shooting Crew Labor"],
  ["C", "Pre-Production Expenses"],
  ["D", "Location & Travel"],
  ["E", "Makeup/Wardrobe/Animals"],
  ["F", "Studio & Stage"],
  ["G", "Art Department Labor"],
  ["H", "Art Department Expenses"],
  ["I", "Equipment"],
  ["J", "Film & Digital Media"],
  ["K", "Miscellaneous"],
  ["L", "Director/Creative Fees"],
  ["M", "Talent Labor"],
  ["N", "Talent Expenses"],
  ["O", "Post Production Labor"],
  ["P", "Editorial & Finishing"],
] as const;

function receiptAmount(capture: ReceiptCapture) {
  const amount = primaryReceiptAmount(capture);
  return amount !== null ? `£${(amount / 100).toFixed(2)}` : "Amount unknown";
}

function primaryReceiptAmount(capture: ReceiptCapture): number | null {
  return capture.parsedAmountNet ?? capture.parsedAmount ?? capture.parsedAmountGross ?? null;
}

function penceToPoundsInput(value: number | null | undefined): string {
  return value !== null && value !== undefined ? (value / 100).toFixed(2) : "";
}

function formatPence(value: number | null | undefined): string {
  return value !== null && value !== undefined ? formatCurrency(value / 100) : "—";
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read receipt file"));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(item: OfflineReceipt): File {
  const [header, data] = item.base64.split(",");
  const binary = atob(data ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], item.filename, { type: item.mimeType || header?.match(/data:(.*);base64/)?.[1] || "image/jpeg" });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [emailUnread, setEmailUnread] = useState(0);
  const [pendingReceipts, setPendingReceipts] = useState<ReceiptCapture[]>([]);
  const [reviewReceipt, setReviewReceipt] = useState<ReceiptCapture | null>(null);
  const [receiptPanelOpen, setReceiptPanelOpen] = useState(false);
  const [draggingReceipt, setDraggingReceipt] = useState(false);
  const [offlineReceipts, setOfflineReceipts] = useState<OfflineReceipt[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("offlineReceipts") ?? "[]") as OfflineReceipt[];
    } catch {
      return [];
    }
  });
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<DashboardData>("/api/dashboard").then(setData).catch(console.error);
    async function loadUnread() {
      const unread = await api.get<{ count: number }>("/api/email/unread-count");
      setEmailUnread(unread.count);
    }
    loadUnread().catch(console.error);
    const timer = window.setInterval(() => loadUnread().catch(console.error), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadPendingReceipts() {
    const [parsed, failed] = await Promise.all([
      api.get<ReceiptCapture[]>("/api/receipts?status=PARSED"),
      api.get<ReceiptCapture[]>("/api/receipts?status=FAILED"),
    ]);
    setPendingReceipts([...parsed, ...failed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }

  useEffect(() => {
    loadPendingReceipts().catch(console.error);
    const timer = window.setInterval(() => loadPendingReceipts().catch(console.error), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("offlineReceipts", JSON.stringify(offlineReceipts));
  }, [offlineReceipts]);

  async function uploadReceipt(file: File, capturedOffline = false) {
    const form = new FormData();
    form.append("file", file);
    if (capturedOffline) form.append("capturedOffline", "true");
    const response = await fetch("/api/receipts/capture", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({} as { error?: string }));
      throw new Error(body.error ?? "Receipt upload failed");
    }
    const created = await response.json() as { id: string };
    const capture = await api.get<ReceiptCapture>(`/api/receipts/${created.id}`);
    setReviewReceipt(capture);
    setReceiptPanelOpen(true);
    return capture;
  }

  async function handleReceiptFile(file?: File) {
    if (!file) return;
    try {
      await uploadReceipt(file);
    } catch (err) {
      const base64 = await toBase64(file);
      if (file.size > 5 * 1024 * 1024) {
        window.alert("Receipt saved offline, but the image is over 5MB. Retake smaller if sync struggles.");
      }
      setOfflineReceipts((items) => [...items, {
        id: crypto.randomUUID(),
        base64,
        mimeType: file.type,
        filename: file.name || `receipt-${Date.now()}.jpg`,
        capturedAt: new Date().toISOString(),
        syncAttempts: 0,
      }]);
      console.error(err);
    }
  }

  async function syncOfflineReceipts() {
    const remaining: OfflineReceipt[] = [];
    for (const item of offlineReceipts) {
      try {
        await uploadReceipt(base64ToFile(item), true);
      } catch {
        remaining.push({ ...item, syncAttempts: item.syncAttempts + 1 });
      }
    }
    setOfflineReceipts(remaining);
  }

  useEffect(() => {
    function online() { syncOfflineReceipts().catch(console.error); }
    window.addEventListener("online", online);
    if (navigator.onLine && offlineReceipts.length) online();
    return () => window.removeEventListener("online", online);
  }, [offlineReceipts.length]);

  const statCards = [
    { label: "Active opportunities", value: data?.opportunityCount, icon: <TrendingUp size={18} />, onClick: () => navigate("/opportunities") },
    { label: "Productions", value: data?.productionCount, icon: <Film size={18} />, onClick: () => navigate("/productions") },
    { label: "Contacts", value: data?.contactCount, icon: <Users size={18} />, onClick: () => navigate("/contacts") },
    { label: "Unread email", value: emailUnread, icon: <Mail size={18} />, onClick: () => navigate("/email") },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <button onClick={() => desktopInputRef.current?.click()} className="hidden min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white md:flex">
          <Camera size={16} /> Capture receipt
        </button>
      </div>

      {offlineReceipts.length > 0 && (
        <button onClick={() => syncOfflineReceipts().catch(console.error)} className="mb-3 flex min-h-11 w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 text-left text-sm text-amber-800">
          <span>{offlineReceipts.length} receipt{offlineReceipts.length === 1 ? "" : "s"} waiting to sync</span>
          <Upload size={16} />
        </button>
      )}

      <input ref={desktopInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" className="hidden" onChange={(event) => { handleReceiptFile(event.target.files?.[0]).catch(console.error); event.currentTarget.value = ""; }} />
      <input ref={mobileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { handleReceiptFile(event.target.files?.[0]).catch(console.error); event.currentTarget.value = ""; }} />

      <div
        onDragOver={(event) => { event.preventDefault(); setDraggingReceipt(true); }}
        onDragLeave={() => setDraggingReceipt(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDraggingReceipt(false);
          handleReceiptFile(event.dataTransfer.files[0]).catch(console.error);
        }}
        onClick={() => desktopInputRef.current?.click()}
        className={`mb-5 hidden min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 transition-colors md:flex ${draggingReceipt ? "border-gray-900 bg-gray-100" : "border-gray-300 bg-gray-50"}`}
      >
        <Camera size={20} className="text-gray-500" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">Drop a receipt here or click to upload</p>
          <p className="text-xs text-gray-500">Drag from desktop or take a photo on mobile</p>
        </div>
        {pendingReceipts.length > 0 && (
          <button
            onClick={(event) => { event.stopPropagation(); setReviewReceipt(pendingReceipts[0]); setReceiptPanelOpen(true); }}
            className="ml-auto min-h-9 rounded-full bg-amber-100 px-3 text-xs font-medium text-amber-800"
          >
            {pendingReceipts.length} receipt{pendingReceipts.length === 1 ? "" : "s"} need attention
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((c) => (
          <button
            key={c.label}
            onClick={c.onClick}
            className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-gray-400 mb-2">{c.icon}</div>
            <p className="text-2xl font-semibold text-gray-900">{c.value ?? "—"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CalendarMiniWidget />

        {/* Pipeline by stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Pipeline</h2>
            <button
              onClick={() => navigate("/opportunities")}
              className="text-xs text-indigo-600 hover:underline"
            >
              View all
            </button>
          </div>
          {data ? (
            <div className="space-y-2">
              {ACTIVE_STAGES.map((stage) => {
                const count = data.stageCounts[stage] ?? 0;
                const total = ACTIVE_STAGES.reduce((s, st) => s + (data.stageCounts[st] ?? 0), 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium px-2 py-0.5 rounded-full ${STAGE_COLOURS[stage]}`}>
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-gray-500 font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {ACTIVE_STAGES.every((s) => (data.stageCounts[s] ?? 0) === 0) && (
                <p className="text-sm text-gray-400 text-center py-3">No active opportunities</p>
              )}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Active productions</h2>
            <button onClick={() => navigate("/productions")} className="text-xs text-indigo-600 hover:underline">View all</button>
          </div>
          {data ? (
            data.activeProductions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active productions</p>
            ) : (
              <div className="space-y-2">
                {data.activeProductions.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/productions?production=${item.id}`)}
                    className="w-full rounded-xl p-2.5 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        <span className="font-mono text-xs text-indigo-700">{item.jobCode}</span> {item.clientName ?? item.title}
                      </p>
                      <span className="shrink-0 text-xs text-gray-500">{PRODUCTION_STATUS_LABELS[item.status]}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-500">{item.nextDate ? `${DATE_TYPE_LABELS[item.nextDate.dateType]} · ${new Date(item.nextDate.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "No next date"}</span>
                      <span className={`font-semibold ${item.overBudget ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(item.variance)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>

        {/* Overdue follow-ups */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              Overdue follow-ups
              {data && data.overdueOpportunities.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 font-semibold rounded-full px-1.5 py-0.5">
                  {data.overdueOpportunities.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => navigate("/opportunities")}
              className="text-xs text-indigo-600 hover:underline"
            >
              View all
            </button>
          </div>
          {data ? (
            data.overdueOpportunities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">All follow-ups up to date</p>
            ) : (
              <div className="space-y-2">
                {data.overdueOpportunities.slice(0, 5).map((item) => {
                  const days = daysOverdue(item.followUpDate);
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/opportunities?opportunity=${item.id}`)}
                      className="w-full flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors"
                    >
                      <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {item.clientName ?? item.brand ?? ""}
                        </p>
                      </div>
                      <span className="text-xs text-red-600 font-medium shrink-0">
                        {days === 1 ? "1 day" : `${days} days`}
                      </span>
                    </button>
                  );
                })}
                {data.overdueOpportunities.length > 5 && (
                  <button
                    onClick={() => navigate("/opportunities")}
                    className="w-full text-xs text-center text-indigo-600 hover:underline pt-1"
                  >
                    +{data.overdueOpportunities.length - 5} more
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>
      </div>
      <button
        onClick={() => mobileInputRef.current?.click()}
        className="fixed bottom-24 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#1a1a1f] text-white shadow-xl md:hidden"
        aria-label="Capture receipt"
      >
        <Camera size={22} />
      </button>
      {pendingReceipts.length > 0 && (
        <button
          onClick={() => { setReviewReceipt(pendingReceipts[0]); setReceiptPanelOpen(true); }}
          className="fixed bottom-40 right-5 z-40 rounded-full bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800 shadow md:hidden"
        >
          {pendingReceipts.length} pending
        </button>
      )}
      {receiptPanelOpen && reviewReceipt && (
        <ReceiptReviewPanel
          capture={reviewReceipt}
          pendingReceipts={pendingReceipts}
          onClose={() => { setReceiptPanelOpen(false); setReviewReceipt(null); loadPendingReceipts().catch(console.error); }}
          onChange={setReviewReceipt}
          onAssigned={() => { loadPendingReceipts().catch(console.error); }}
        />
      )}
    </div>
  );
}

function ReceiptReviewPanel({ capture, pendingReceipts, onClose, onChange, onAssigned }: {
  capture: ReceiptCapture;
  pendingReceipts: ReceiptCapture[];
  onClose: () => void;
  onChange: (capture: ReceiptCapture) => void;
  onAssigned: () => void;
}) {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(capture.parsedVendor ?? "");
  const [amount, setAmount] = useState(penceToPoundsInput(primaryReceiptAmount(capture)));
  const [date, setDate] = useState(capture.parsedDate ? capture.parsedDate.slice(0, 10) : "");
  const [section, setSection] = useState(capture.parsedAicpSection ?? "");
  const [productions, setProductions] = useState<Production[]>([]);
  const [productionSearch, setProductionSearch] = useState("");
  const [selectedProductionId, setSelectedProductionId] = useState(capture.productionId ?? "");
  const [lineOptions, setLineOptions] = useState<Array<{ sectionCode: string; line: BudgetLineItem }>>([]);
  const [lineItemId, setLineItemId] = useState(capture.lineItemId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredProductions = useMemo(() => {
    const search = productionSearch.toLowerCase();
    return productions.filter((production) => (
      !search ||
      production.jobCode?.toLowerCase().includes(search) ||
      production.clientName?.toLowerCase().includes(search) ||
      production.brand?.toLowerCase().includes(search) ||
      production.title.toLowerCase().includes(search)
    )).slice(0, 8);
  }, [productionSearch, productions]);

  const sortedLines = useMemo(() => {
    if (!section) return lineOptions;
    return [...lineOptions].sort((a, b) => {
      if (a.sectionCode === section && b.sectionCode !== section) return -1;
      if (a.sectionCode !== section && b.sectionCode === section) return 1;
      return `${a.sectionCode}${a.line.lineCode}`.localeCompare(`${b.sectionCode}${b.line.lineCode}`);
    });
  }, [lineOptions, section]);

  useEffect(() => {
    setVendor(capture.parsedVendor ?? "");
    setAmount(penceToPoundsInput(primaryReceiptAmount(capture)));
    setDate(capture.parsedDate ? capture.parsedDate.slice(0, 10) : "");
    setSection(capture.parsedAicpSection ?? "");
    setSelectedProductionId(capture.productionId ?? "");
    setLineItemId(capture.lineItemId ?? "");
  }, [capture.id]);

  useEffect(() => {
    api.get<Production[]>("/api/productions?includeWrapped=true").then(setProductions).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedProductionId) {
      setLineOptions([]);
      return;
    }
    api.get<Budget>(`/api/budgets/production/${selectedProductionId}`)
      .then((budget) => {
        const lines = budget.currentRevision?.sections.flatMap((budgetSection) => (
          budgetSection.lineItems.map((line) => ({ sectionCode: budgetSection.code, line }))
        )) ?? [];
        setLineOptions(lines);
      })
      .catch(console.error);
  }, [selectedProductionId]);

  useEffect(() => {
    if (capture.status !== "PENDING" && capture.status !== "PARSING") return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const next = await api.get<ReceiptCapture>(`/api/receipts/${capture.id}`);
      onChange(next);
      if (next.status !== "PENDING" && next.status !== "PARSING") window.clearInterval(timer);
      if (Date.now() - started > 30_000) window.clearInterval(timer);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [capture.id, capture.status, onChange]);

  async function saveParsedFields() {
    const amountPence = amount ? Math.round(Number(amount) * 100) : null;
    const hasVatBreakdown = capture.parsedVatAmount !== null && capture.parsedVatAmount !== undefined;
    return api.patch<ReceiptCapture>(`/api/receipts/${capture.id}`, {
      parsedVendor: vendor.trim() || null,
      parsedAmount: amountPence,
      parsedAmountNet: hasVatBreakdown ? amountPence : capture.parsedAmountNet ?? null,
      parsedAmountGross: hasVatBreakdown ? capture.parsedAmountGross ?? null : amountPence,
      parsedVatAmount: capture.parsedVatAmount ?? null,
      parsedVatRate: capture.parsedVatRate ?? null,
      parsedDate: date || null,
      parsedAicpSection: section || null,
    });
  }

  async function assign() {
    if (!selectedProductionId || !lineItemId) {
      setError("Choose a job and budget line.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveParsedFields();
      const assigned = await api.patch<ReceiptCapture>(`/api/receipts/${capture.id}/assign`, {
        productionId: selectedProductionId,
        lineItemId,
      });
      onChange(assigned);
      onAssigned();
      window.setTimeout(() => onClose(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign receipt");
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (!window.confirm("Discard this receipt?")) return;
    await api.delete(`/api/receipts/${capture.id}`);
    onClose();
  }

  async function retry() {
    setError("");
    const next = await api.post<ReceiptCapture>(`/api/receipts/${capture.id}/parse`, {});
    onChange(next);
  }

  const confidence = capture.parseConfidence ?? "low";
  const confidenceClass = confidence === "high" ? "bg-emerald-500" : confidence === "medium" ? "bg-amber-500" : "bg-red-500";
  const selectedProduction = productions.find((production) => production.id === selectedProductionId);
  const selectedLine = lineOptions.find((entry) => entry.line.id === lineItemId);
  const hasVatBreakdown = capture.parsedVatAmount !== null && capture.parsedVatAmount !== undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/20 md:items-stretch md:justify-end">
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl md:h-full md:max-h-none md:w-[380px] md:rounded-none">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${confidenceClass}`} />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{capture.status === "ASSIGNED" ? "Receipt saved" : "Receipt"}</h2>
              {confidence !== "high" && capture.status === "PARSED" && <p className="text-xs text-gray-500">{confidence === "medium" ? "Please verify details" : "Could not read clearly"}</p>}
            </div>
          </div>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {capture.mimeType === "application/pdf" ? (
              <iframe title="Receipt" src={`/api/receipts/${capture.id}/file`} className="h-56 w-full" />
            ) : (
              <img src={`/api/receipts/${capture.id}/file`} alt="Receipt" className="max-h-64 w-full object-contain" />
            )}
          </div>

          {(capture.status === "PENDING" || capture.status === "PARSING") && (
            <div className="rounded-xl bg-gray-50 p-4 text-center">
              <Loader2 size={22} className="mx-auto mb-2 animate-spin text-gray-500" />
              <p className="text-sm font-medium text-gray-800">Analysing receipt...</p>
              <p className="text-xs text-gray-500">Claude is reading your receipt</p>
            </div>
          )}

          {capture.status === "ASSIGNED" && (
            <div className="rounded-xl bg-emerald-50 p-4 text-center">
              <CheckCircle size={28} className="mx-auto mb-2 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-900">{receiptAmount(capture)} added to</p>
              <p className="mt-1 text-xs text-emerald-800">{capture.production?.jobCode ?? selectedProduction?.jobCode} {capture.production?.clientName ?? selectedProduction?.clientName} — {capture.lineItem?.lineCode ?? selectedLine?.line.lineCode} {capture.lineItem?.description ?? selectedLine?.line.description}</p>
              <button onClick={() => navigate(`/productions?production=${capture.productionId ?? selectedProductionId}&view=budget`)} className="mt-4 min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">View in budget</button>
            </div>
          )}

          {(capture.status === "PARSED" || capture.status === "FAILED") && (
            <div className="space-y-3">
              {capture.status === "FAILED" && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  Could not read receipt. Fill manually or retry.
                  <button onClick={() => retry().catch(console.error)} className="ml-2 min-h-8 underline">Retry</button>
                </div>
              )}
              <label className="block text-xs text-gray-500">Vendor
                <input value={vendor} onChange={(event) => setVendor(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900" />
              </label>
              <label className="block text-xs text-gray-500">{hasVatBreakdown ? "Amount (ex-VAT)" : "Amount"}
                <div className="mt-1 flex min-h-11 items-center rounded-lg border border-gray-200 px-3">
                  <span className="text-sm text-gray-500">£</span>
                  <input value={amount} type="number" step="0.01" onChange={(event) => setAmount(event.target.value)} className="min-h-10 flex-1 border-0 px-2 text-sm outline-none" />
                </div>
              </label>
              {hasVatBreakdown && (
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                  <div className="flex justify-between gap-3">
                    <span>VAT{capture.parsedVatRate !== null && capture.parsedVatRate !== undefined ? ` (${capture.parsedVatRate}%)` : ""}</span>
                    <span>{formatPence(capture.parsedVatAmount)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <span>Total inc. VAT</span>
                    <span>{formatPence(capture.parsedAmountGross)}</span>
                  </div>
                </div>
              )}
              <label className="block text-xs text-gray-500">Date
                <input value={date} type="date" onChange={(event) => setDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900" />
              </label>
              <label className="block text-xs text-gray-500">Category
                <select value={section} onChange={(event) => setSection(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900">
                  <option value="">Choose section</option>
                  {AICP_SECTIONS.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                </select>
              </label>

              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Assign to job</p>
                <label className="block text-xs text-gray-500">Job
                  <input value={productionSearch} onChange={(event) => setProductionSearch(event.target.value)} placeholder={selectedProduction ? `${selectedProduction.jobCode ?? "No code"} · ${selectedProduction.clientName ?? selectedProduction.title}` : "Search jobs..."} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900" />
                </label>
                <div className="mt-1 max-h-36 overflow-auto rounded-lg border border-gray-100">
                  {filteredProductions.map((production) => (
                    <button key={production.id} onClick={() => { setSelectedProductionId(production.id); setProductionSearch(`${production.jobCode ?? "No code"} · ${production.clientName ?? production.title}`); }} className={`block min-h-10 w-full px-3 text-left text-xs ${selectedProductionId === production.id ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
                      {production.jobCode ?? "No code"} · {production.clientName ?? production.title}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block text-xs text-gray-500">Line item
                  <select value={lineItemId} onChange={(event) => setLineItemId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900">
                    <option value="">{selectedProductionId ? "Choose line item" : "Choose job first"}</option>
                    {sortedLines.map(({ sectionCode, line }) => <option key={line.id} value={line.id}>{sectionCode} — {line.lineCode} — {line.description}</option>)}
                  </select>
                </label>
              </div>
              {pendingReceipts.length > 1 && (
                <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{pendingReceipts.length} receipts need attention.</div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {(capture.status === "PARSED" || capture.status === "FAILED") && (
          <div className="flex items-center gap-2 border-t border-gray-200 p-3">
            <button onClick={() => discard().catch(console.error)} className="flex min-h-11 items-center gap-2 px-3 text-sm text-red-600"><Trash2 size={15} /> Discard</button>
            <button onClick={assign} disabled={saving} className="ml-auto min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving..." : "Save →"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
