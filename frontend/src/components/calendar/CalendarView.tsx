import { useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as BigCalendar, dateFnsLocalizer, type SlotInfo, type View } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { enGB } from "date-fns/locale/en-GB";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, X, Trash2, Search } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { api } from "../../lib/api";
import {
  type CalendarEvent,
  type CalendarEventType,
  type Contact,
  type OpportunityListItem,
  type Production,
} from "../../lib/types";

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

type CalendarMode = "full" | "mini";
type CalendarDisplayView = "month" | "week" | "day" | "agenda";

type RbcEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEvent;
};

const EVENT_TYPES: Array<{ value: CalendarEventType; label: string }> = [
  { value: "SHOOT_DAY", label: "Shoot Day" },
  { value: "PPM", label: "PPM" },
  { value: "RECCE", label: "Recce" },
  { value: "FITTING", label: "Fitting" },
  { value: "MEETING", label: "Meeting" },
  { value: "POST_DELIVERY", label: "Post Delivery" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "STANDALONE", label: "Other" },
];

export interface CalendarViewProps {
  mode: CalendarMode;
  initialView?: CalendarDisplayView;
  productionId?: string;
}

function monthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 42);
  return { start, end };
}

function rangeForView(date: Date, view: CalendarDisplayView): { start: Date; end: Date } {
  if (view === "month" || view === "agenda") {
    const bounds = monthBounds(date);
    if (view === "agenda") {
      bounds.end.setDate(bounds.end.getDate() + 60);
    }
    return bounds;
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (view === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + (view === "week" ? 7 : 1));
  return { start, end };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function eventColor(event: CalendarEvent): string {
  return event.productionColor ?? event.color ?? (event.syncedFromGoogle ? "#9CA3AF" : "#5B8DEF");
}

function formatTime(event: CalendarEvent): string {
  if (event.isAllDay) return "All day";
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return `${format(start, "HH:mm")} — ${format(end, "HH:mm")}`;
}

function linkedLabel(event: CalendarEvent): string {
  if (event.production) return `${event.production.jobCode ?? "No code"} ${event.production.clientName ?? event.production.title}`;
  if (event.opportunity) return `Opportunity: ${event.opportunity.clientName ?? event.opportunity.title}`;
  return event.syncedFromGoogle ? "Google Calendar" : "Standalone";
}

export function CalendarMiniWidget(): ReactElement {
  return <CalendarView mode="mini" initialView="month" />;
}

export default function CalendarView({ mode, initialView = "month", productionId }: CalendarViewProps): ReactElement {
  const navigate = useNavigate();
  const [view, setView] = useState<CalendarDisplayView>(initialView);
  const [focusDate, setFocusDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | "new" | null>(null);

  const range = useMemo(() => rangeForView(focusDate, view), [focusDate, view]);

  useEffect(() => {
    const params = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    });
    if (productionId) params.set("productionId", productionId);
    api.get<CalendarEvent[]>(`/api/calendar/events?${params.toString()}`).then(setEvents).catch(console.error);
  }, [range.start.getTime(), range.end.getTime(), productionId]);

  const rbcEvents = useMemo<RbcEvent[]>(() => events.map((event) => ({
    id: event.id,
    title: `${event.icon} ${event.title}`,
    start: new Date(event.startDate),
    end: new Date(event.endDate),
    allDay: event.isAllDay,
    resource: event,
  })), [events]);

  const selectedForwardEvents = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    return events.filter((event) => new Date(event.endDate) >= start).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [events, selectedDate]);

  function navigatePeriod(direction: number) {
    const next = new Date(focusDate);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setFocusDate(next);
    setSelectedDate(next);
  }

  async function reload() {
    const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
    if (productionId) params.set("productionId", productionId);
    setEvents(await api.get<CalendarEvent[]>(`/api/calendar/events?${params.toString()}`));
  }

  if (mode === "mini") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => navigatePeriod(-1)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><ChevronLeft size={17} /></button>
            <h2 className="text-sm font-semibold text-gray-900">{format(focusDate, "MMMM yyyy")}</h2>
            <button onClick={() => navigatePeriod(1)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><ChevronRight size={17} /></button>
          </div>
          <button onClick={() => navigate("/calendar")} className="min-h-11 rounded-lg px-3 text-xs font-medium text-indigo-600">View calendar</button>
        </div>
        <MonthDotsGrid focusDate={focusDate} selectedDate={selectedDate} events={events} compact onSelect={setSelectedDate} />
        <div className="mt-4 max-h-72 overflow-auto">
          <DayList events={selectedForwardEvents.slice(0, 12)} onSelectEvent={(event) => {
            if (event.productionId) navigate(`/productions?production=${event.productionId}`);
            else if (event.opportunityId) navigate(`/opportunities?opportunity=${event.opportunityId}`);
            else setActiveEvent(event);
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2">
        <button onClick={() => navigatePeriod(-1)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-600"><ChevronLeft size={18} /></button>
        <h1 className="min-w-36 text-base font-semibold text-gray-900">{format(focusDate, view === "day" ? "d MMMM yyyy" : "MMMM yyyy")}</h1>
        <button onClick={() => navigatePeriod(1)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-600"><ChevronRight size={18} /></button>
        <div className="ml-auto flex rounded-lg bg-gray-100 p-1">
          {(["month", "week", "day", "agenda"] as const).map((item) => (
            <button key={item} onClick={() => setView(item)} className={`min-h-9 rounded-md px-3 text-xs font-medium capitalize ${view === item ? "bg-gray-900 text-white" : "text-gray-600"}`}>
              {item}
            </button>
          ))}
        </div>
        <button onClick={() => setEditingEvent("new")} className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white"><Plus size={16} /> Add event</button>
      </div>

      {view === "month" ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-col">
          <div className="h-[45vh] min-h-[320px] border-b border-gray-200 p-3">
            <MonthDotsGrid focusDate={focusDate} selectedDate={selectedDate} events={events} onSelect={setSelectedDate} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <DayList events={selectedForwardEvents} onSelectEvent={setActiveEvent} />
          </div>
        </div>
      ) : view === "agenda" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <DayList events={selectedForwardEvents} onSelectEvent={setActiveEvent} />
        </div>
      ) : (
        <div className="calendar-rbc min-h-0 flex-1 p-3">
          <BigCalendar<RbcEvent>
            localizer={localizer}
            events={rbcEvents}
            date={focusDate}
            view={view as View}
            views={["week", "day"]}
            toolbar={false}
            selectable
            onNavigate={setFocusDate}
            onSelectEvent={(event) => setActiveEvent(event.resource)}
            onSelectSlot={(slot: SlotInfo) => {
              setSelectedDate(slot.start);
              setEditingEvent("new");
            }}
            eventPropGetter={(event) => ({
              style: { backgroundColor: eventColor(event.resource), border: 0, color: "white", borderRadius: "6px", fontSize: "12px" },
            })}
          />
        </div>
      )}

      {activeEvent && <EventDetailPanel event={activeEvent} onClose={() => setActiveEvent(null)} onEdit={() => setEditingEvent(activeEvent)} onChanged={() => { setActiveEvent(null); reload().catch(console.error); }} />}
      {editingEvent && <EventEditPanel event={editingEvent === "new" ? null : editingEvent} defaultDate={selectedDate} productionId={productionId} onClose={() => setEditingEvent(null)} onSaved={() => { setEditingEvent(null); reload().catch(console.error); }} />}
    </div>
  );
}

function MonthDotsGrid({ focusDate, selectedDate, events, onSelect, compact = false }: { focusDate: Date; selectedDate: Date; events: CalendarEvent[]; onSelect: (date: Date) => void; compact?: boolean }): ReactElement {
  const bounds = monthBounds(focusDate);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(bounds.start);
    day.setDate(day.getDate() + index);
    return day;
  });
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(new Date(event.startDate));
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <div key={day} className="py-1">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const dayEvents = eventsByDay.get(dateKey(day)) ?? [];
          const isSelected = sameDay(day, selectedDate);
          const isToday = sameDay(day, new Date());
          const muted = day.getMonth() !== focusDate.getMonth();
          return (
            <button key={day.toISOString()} onClick={() => onSelect(day)} className={`min-h-11 border-b border-r border-gray-100 p-1 text-left ${compact ? "min-h-7 border-0" : ""} ${[0, 6].includes(day.getDay()) ? "bg-gray-50/60" : ""}`}>
              <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs ${isSelected ? "bg-gray-900 text-white" : isToday ? "bg-indigo-100 text-indigo-700" : muted ? "text-gray-300" : "text-gray-700"}`}>{day.getDate()}</span>
              <span className="mt-1 flex h-2 items-center gap-0.5">
                {dayEvents.slice(0, 3).map((event) => <span key={event.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: eventColor(event) }} />)}
                {dayEvents.length > 3 && <span className="text-[9px] text-gray-400">3+</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayList({ events, onSelectEvent }: { events: CalendarEvent[]; onSelectEvent: (event: CalendarEvent) => void }): ReactElement {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKey(new Date(event.startDate));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  if (events.length === 0) return <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">No events in this range.</div>;
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([key, group]) => {
        const date = new Date(`${key}T00:00:00`);
        return (
          <section key={key}>
            <h3 className={`mb-2 border-b border-gray-200 pb-2 text-sm ${sameDay(date, new Date()) ? "font-semibold text-gray-900" : "font-medium text-gray-600"}`}>{format(date, "EEEE d MMMM yyyy")}</h3>
            <div className="space-y-2">
              {group.map((event) => <EventRow key={event.id} event={event} onClick={() => onSelectEvent(event)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EventRow({ event, onClick }: { event: CalendarEvent; onClick: () => void }): ReactElement {
  return (
    <button onClick={onClick} className="flex min-h-[64px] w-full gap-3 rounded-lg bg-white p-3 text-left hover:bg-gray-50">
      <span className="w-1 rounded-full" style={{ backgroundColor: eventColor(event) }} />
      <span className="pt-0.5 text-xl">{event.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{event.title}</span>
        <span className="block text-xs text-gray-500">{formatTime(event)}</span>
        <span className="block truncate text-xs text-gray-500">→ {linkedLabel(event)}</span>
        {event.location && <span className="block truncate text-xs text-gray-400">{event.location}</span>}
        {event.zoomLink && <a href={event.zoomLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-md bg-indigo-50 px-2 text-xs font-medium text-indigo-700"><ExternalLink size={12} /> Join Zoom</a>}
      </span>
    </button>
  );
}

function EventDetailPanel({ event, onClose, onEdit, onChanged }: { event: CalendarEvent; onClose: () => void; onEdit: () => void; onChanged: () => void }): ReactElement {
  const navigate = useNavigate();
  async function remove() {
    if (!window.confirm("Delete this event?")) return;
    await api.delete(`/api/calendar/events/${event.id}`);
    onChanged();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/20 md:items-stretch md:justify-end">
      <aside className="max-h-[90vh] w-full overflow-auto rounded-t-2xl bg-white shadow-2xl md:h-full md:max-h-none md:w-[360px] md:rounded-none">
        <div className="flex items-start justify-between border-b border-gray-200 p-4">
          <div><h2 className="text-sm font-semibold text-gray-900">{event.icon} {event.title}</h2><p className="mt-1 text-xs text-gray-500">{event.formattedType}</p></div>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <DetailLine label="Date" value={`${format(new Date(event.startDate), "EEEE d MMM yyyy")} · ${formatTime(event)}`} />
          {event.location && <DetailLine label="Location" value={event.location} />}
          {event.zoomLink && <a href={event.zoomLink} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-50 px-3 text-sm font-medium text-indigo-700"><ExternalLink size={15} /> Join Zoom</a>}
          {event.production && <LinkedCard title="Linked production" body={`${event.production.jobCode ?? "No code"} ${event.production.clientName ?? event.production.title} · ${event.production.status}`} action="Open production →" onClick={() => navigate(`/productions?production=${event.productionId}`)} />}
          {event.opportunity && <LinkedCard title="Linked opportunity" body={`${event.opportunity.clientName ?? event.opportunity.title} · ${event.opportunity.stage}`} action="Open opportunity →" onClick={() => navigate(`/opportunities?opportunity=${event.opportunityId}`)} />}
          {event.notes && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Notes</p><p className="whitespace-pre-wrap text-gray-700">{event.notes}</p></div>}
          {event.googleCalendarEventId && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Synced with Google Calendar.</p>}
        </div>
        <div className="flex gap-2 border-t border-gray-200 p-4">
          <button onClick={onEdit} className="min-h-11 flex-1 rounded-lg border border-gray-200 text-sm font-medium text-gray-700">Edit</button>
          <button onClick={remove} className="min-h-11 rounded-lg px-4 text-sm font-medium text-red-600"><Trash2 size={16} /></button>
        </div>
      </aside>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }): ReactElement {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-gray-800">{value}</p></div>;
}

function LinkedCard({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }): ReactElement {
  return <div className="rounded-lg border border-gray-200 p-3"><p className="text-xs font-medium uppercase tracking-wide text-gray-400">{title}</p><p className="mt-1 text-sm text-gray-800">{body}</p><button onClick={onClick} className="mt-2 min-h-9 text-xs font-medium text-indigo-600">{action}</button></div>;
}

function EventEditPanel({ event, defaultDate, productionId, onClose, onSaved }: { event: CalendarEvent | null; defaultDate: Date; productionId?: string; onClose: () => void; onSaved: () => void }): ReactElement {
  const [productions, setProductions] = useState<Production[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [productionSearch, setProductionSearch] = useState("");
  const [opportunitySearch, setOpportunitySearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [form, setForm] = useState({
    title: event?.title ?? "",
    eventType: event?.eventType ?? "STANDALONE" as CalendarEventType,
    date: event ? event.startDate.slice(0, 10) : dateKey(defaultDate),
    isAllDay: event?.isAllDay ?? true,
    startTime: event && !event.isAllDay ? format(new Date(event.startDate), "HH:mm") : "09:00",
    endTime: event && !event.isAllDay ? format(new Date(event.endDate), "HH:mm") : "10:00",
    productionId: event?.productionId ?? productionId ?? "",
    opportunityId: event?.opportunityId ?? "",
    contactIds: event?.contactIds ?? [] as string[],
    location: event?.location ?? "",
    zoomLink: event?.zoomLink ?? "",
    notes: event?.notes ?? "",
  });

  useEffect(() => { api.get<Production[]>("/api/productions?includeWrapped=true").then(setProductions).catch(console.error); }, []);
  useEffect(() => { api.get<OpportunityListItem[]>(`/api/opportunities${opportunitySearch ? `?search=${encodeURIComponent(opportunitySearch)}` : ""}`).then(setOpportunities).catch(console.error); }, [opportunitySearch]);
  useEffect(() => { api.get<Contact[]>(`/api/contacts${contactSearch ? `?search=${encodeURIComponent(contactSearch)}` : ""}`).then(setContacts).catch(console.error); }, [contactSearch]);

  const filteredProductions = productions.filter((production) => {
    const search = productionSearch.toLowerCase();
    return !search || production.jobCode?.toLowerCase().includes(search) || production.clientName?.toLowerCase().includes(search) || production.title.toLowerCase().includes(search);
  }).slice(0, 6);

  async function save() {
    const startDate = form.isAllDay ? new Date(`${form.date}T00:00:00`) : new Date(`${form.date}T${form.startTime}:00`);
    const endDate = form.isAllDay ? new Date(`${form.date}T00:00:00`) : new Date(`${form.date}T${form.endTime}:00`);
    const payload = {
      title: form.title || (EVENT_TYPES.find((item) => item.value === form.eventType)?.label ?? "Event"),
      eventType: form.eventType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      isAllDay: form.isAllDay,
      productionId: form.productionId || null,
      opportunityId: form.opportunityId || null,
      contactIds: form.contactIds,
      location: form.location || null,
      zoomLink: form.zoomLink || null,
      notes: form.notes || null,
    };
    if (event) await api.patch(`/api/calendar/events/${event.id}`, payload);
    else await api.post("/api/calendar/events", payload);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/20 md:items-stretch md:justify-end">
      <aside className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-2xl md:h-full md:max-h-none md:w-[360px] md:rounded-none">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900">{event ? "Edit event" : "Add event"}</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-4">
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" /></Field>
          <Field label="Type"><select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value as CalendarEventType })} className="input bg-white">{EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" /></Field>
          <label className="flex min-h-11 items-center justify-between rounded-lg bg-gray-50 px-3 text-sm"><span>All day</span><input type="checkbox" checked={form.isAllDay} onChange={(e) => setForm({ ...form, isAllDay: e.target.checked })} /></label>
          {!form.isAllDay && <div className="grid grid-cols-2 gap-2"><Field label="Start"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input" /></Field><Field label="End"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input" /></Field></div>}
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Link to record</p>
            <SearchBox label="Production" value={productionSearch} onChange={setProductionSearch} placeholder="Search jobs..." />
            <div className="max-h-32 overflow-auto rounded-lg border border-gray-100">
              {filteredProductions.map((production) => <button key={production.id} onClick={() => setForm({ ...form, productionId: production.id, opportunityId: "" })} className={`block min-h-10 w-full px-3 text-left text-xs ${form.productionId === production.id ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>{production.jobCode ?? "No code"} · {production.clientName ?? production.title}</button>)}
            </div>
            <SearchBox label="Opportunity" value={opportunitySearch} onChange={setOpportunitySearch} placeholder="Search opportunities..." />
            <div className="max-h-24 overflow-auto rounded-lg border border-gray-100">
              {opportunities.slice(0, 5).map((opportunity) => <button key={opportunity.id} onClick={() => setForm({ ...form, opportunityId: opportunity.id, productionId: "" })} className={`block min-h-10 w-full px-3 text-left text-xs ${form.opportunityId === opportunity.id ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>{opportunity.clientName ?? opportunity.title}</button>)}
            </div>
          </div>
          <SearchBox label="Add contacts" value={contactSearch} onChange={setContactSearch} placeholder="Search contacts..." />
          <div className="max-h-28 overflow-auto rounded-lg border border-gray-100">
            {contacts.slice(0, 6).map((contact) => {
              const selected = form.contactIds.includes(contact.id);
              const name = `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
              return <button key={contact.id} onClick={() => setForm({ ...form, contactIds: selected ? form.contactIds.filter((id) => id !== contact.id) : [...form.contactIds, contact.id] })} className={`block min-h-10 w-full px-3 text-left text-xs ${selected ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>{name}{contact.company ? ` · ${contact.company.name}` : ""}</button>;
            })}
          </div>
          <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" /></Field>
          <Field label="Zoom link"><input value={form.zoomLink} onChange={(e) => setForm({ ...form, zoomLink: e.target.value })} className="input" /></Field>
          <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="input min-h-24 py-2" /></Field>
        </div>
        <div className="flex gap-2 border-t border-gray-200 p-4"><button onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-gray-200 text-sm">Cancel</button><button onClick={save} className="min-h-11 flex-1 rounded-lg bg-gray-900 text-sm font-medium text-white">Save →</button></div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return <label className="block text-xs font-medium text-gray-500">{label}<div className="mt-1">{children}</div></label>;
}

function SearchBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }): ReactElement {
  return <label className="mt-2 block text-xs font-medium text-gray-500">{label}<span className="mt-1 flex min-h-11 items-center rounded-lg border border-gray-200 px-3"><Search size={14} className="text-gray-400" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-10 flex-1 border-0 px-2 text-sm outline-none" /></span></label>;
}
