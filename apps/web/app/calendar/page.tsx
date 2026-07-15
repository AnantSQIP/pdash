'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronLeft, ChevronRight, Loader, X, Trash2, Calendar } from 'lucide-react';
import {
  RiCalendarEventLine,
  RiTeamLine,
  RiCalendarCheckLine,
  RiFlag2Line,
  RiAlarmLine,
  RiTimeLine,
  RiLayoutGridLine,
  RiCalendarTodoLine,
  RiListCheck2,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiFilterLine,
  RiCalendarScheduleLine,
  RiFlightTakeoffLine,
  RiExchangeLine,
  type RemixiconComponentType,
} from '@remixicon/react';
import clsx from 'clsx';
import { api, type CalendarEvent } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useToast } from '@/components/ui/Toast';
import { DateField } from '@/components/ui/DateField';

type EventType = 'EVENT' | 'MEETING' | 'TASK_DUE' | 'MILESTONE' | 'REMINDER' | 'HOLIDAY' | 'LEAVE' | 'COMPOFF';
const TYPE_COLORS: Record<EventType, string> = {
  EVENT:     '#3d8de2',
  MEETING:   '#fe841f',
  TASK_DUE:  '#34a853',
  MILESTONE: '#9334e6',
  REMINDER:  '#ea4335',
  HOLIDAY:   '#d93025',
  LEAVE:     '#fe841f',
  COMPOFF:   '#6366f1',
};
const TYPE_LABELS: Record<EventType, string> = {
  EVENT: 'Event', MEETING: 'Meeting', TASK_DUE: 'Task Due', MILESTONE: 'Milestone', REMINDER: 'Reminder', HOLIDAY: 'Holiday', LEAVE: 'Leave', COMPOFF: 'Comp-off',
};
const TYPE_ICONS: Record<EventType, RemixiconComponentType> = {
  EVENT:     RiCalendarEventLine,
  MEETING:   RiTeamLine,
  TASK_DUE:  RiCalendarCheckLine,
  MILESTONE: RiFlag2Line,
  REMINDER:  RiAlarmLine,
  HOLIDAY:   RiCalendarEventLine,
  LEAVE:     RiFlightTakeoffLine,
  COMPOFF:   RiExchangeLine,
};

/** A synthetic calendar event is one the calendar itself does not own (a holiday). It is
 *  read-only — no edit/delete. */
const isReadOnlyEvent = (id: string) => id.startsWith('holiday-');
const ALL_TYPES = Object.keys(TYPE_LABELS) as EventType[];

function asType(t: string): EventType {
  return (ALL_TYPES.includes(t as EventType) ? t : 'EVENT') as EventType;
}
function colorOf(ev: CalendarEvent) {
  return ev.color || TYPE_COLORS[asType(ev.type)] || '#3d8de2';
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

type ViewMode = 'month' | 'week' | 'agenda';

interface AddEventModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultDate?: string;
}

function AddEventModal({ onClose, onSuccess, defaultDate }: AddEventModalProps) {
  const { org, currentUser } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EventType>('EVENT');
  const [startDate, setStartDate] = useState(defaultDate ?? new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(defaultDate ?? new Date().toISOString().split('T')[0]);
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !currentUser) return;
    setLoading(true);
    setError('');
    try {
      await api.events.create({
        organizationId: org.id,
        title,
        description: description.trim() || undefined,
        type,
        startDate: allDay ? startDate : `${startDate}T${startTime}:00`,
        endDate: allDay ? endDate : `${endDate}T${endTime}:00`,
        allDay,
        color: TYPE_COLORS[type],
        createdBy: currentUser.id,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Calendar size={18} className="text-brand-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Add Event</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select value={type} onChange={e => setType(e.target.value as EventType)}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 bg-white">
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">All day</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start date</label>
              <DateField type="date" required value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            {!allDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Start time</label>
                <DateField type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">End date</label>
              <DateField type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
            </div>
            {!allDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">End time</label>
                <DateField type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="Optional description"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 resize-none" />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading || !title}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Compact chip rendered inside a day cell / week column.
function EventChip({ ev, onSelect }: { ev: CalendarEvent; onSelect: (ev: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onSelect(ev); }}
      className="group/chip w-full flex items-center gap-1 text-left text-xs px-1.5 py-0.5 rounded truncate text-white font-medium transition-all hover:brightness-110 hover:shadow-sm"
      style={{ backgroundColor: colorOf(ev) }}
      title={ev.title}
    >
      {!ev.allDay && <span className="opacity-90 tabular-nums text-[10px] shrink-0">{fmtTime(ev.startDate)}</span>}
      <span className="truncate">{ev.title}</span>
    </button>
  );
}

export default function CalendarPage() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date();

  const [view, setView] = useState<ViewMode>('month');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [clickedDate, setClickedDate] = useState<string | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<EventType>>(new Set());

  // Fetch a generous window so month, week and agenda all have data without re-fetching constantly.
  const rangeFrom = useMemo(() => {
    if (view === 'week') return addDays(weekStart, -7);
    return new Date(year, month - 1, 1);
  }, [view, weekStart, year, month]);
  const rangeTo = useMemo(() => {
    if (view === 'week') return addDays(weekStart, 21);
    return new Date(year, month + 2, 0, 23, 59, 59);
  }, [view, weekStart, year, month]);

  const fromISO = rangeFrom.toISOString();
  const toISO = rangeTo.toISOString();

  const { data: rawEvents = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['events', org?.id, fromISO, toISO],
    queryFn: () => api.events.list(org!.id, fromISO, toISO),
    enabled: !!org?.id,
  });

  // Company holidays belong on the calendar too. They live in their own store, so fetch them
  // for every year the visible range touches (a Dec view shows into Jan) and adapt them to the
  // event shape so all the existing rendering, filtering and "upcoming" logic just works.
  const holidayYears = useMemo(() => {
    const ys = new Set<number>([rangeFrom.getUTCFullYear(), rangeTo.getUTCFullYear()]);
    return [...ys];
  }, [rangeFrom, rangeTo]);
  const { data: holidays = [] } = useQuery({
    queryKey: ['calendar-holidays', org?.id, holidayYears.join(',')],
    queryFn: async () => {
      const lists = await Promise.all(holidayYears.map(y => api.leave.holidays(org!.id, y)));
      return lists.flat();
    },
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  });

  const holidayEvents = useMemo<CalendarEvent[]>(() =>
    holidays.map(h => ({
      id: `holiday-${h.id}`,
      organizationId: org?.id ?? '',
      title: h.name,
      description: h.type ? `${h.type.charAt(0)}${h.type.slice(1).toLowerCase()} holiday` : 'Holiday',
      type: 'HOLIDAY',
      startDate: h.date,
      endDate: h.date,
      allDay: true,
      color: TYPE_COLORS.HOLIDAY,
      createdBy: 'system',
      createdAt: h.date,
    })),
    [holidays, org?.id],
  );

  // Live type filtering applied to every view.
  const events = useMemo(
    () => [...rawEvents, ...holidayEvents].filter(e => !hiddenTypes.has(asType(e.type))),
    [rawEvents, holidayEvents, hiddenTypes],
  );

  function invalidate() { qc.invalidateQueries({ queryKey: ['events', org?.id] }); }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event?')) return;
    setDeletingId(id);
    try {
      await api.events.delete(id);
      invalidate();
      setSelectedEvent(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete event', 'error');
    } finally { setDeletingId(null); }
  }

  function toggleType(t: EventType) {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekStart(startOfWeek(new Date()));
  }

  function goPrev() {
    if (view === 'week') { setWeekStart(w => addDays(w, -7)); return; }
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  }
  function goNext() {
    if (view === 'week') { setWeekStart(w => addDays(w, 7)); return; }
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  }

  function openAdd(date?: string) {
    setClickedDate(date);
    setShowAdd(true);
  }

  // ---- Derived data --------------------------------------------------------
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = dateKey(new Date(ev.startDate));
      const arr = map.get(key);
      if (arr) arr.push(ev); else map.set(key, [ev]);
    }
    for (const arr of map.values()) arr.sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
    return map;
  }, [events]);

  function dayEvents(d: Date) {
    return eventsByDay.get(dateKey(d)) ?? [];
  }

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter(e => +new Date(e.endDate ?? e.startDate) >= now)
      .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
      .slice(0, 5);
  }, [events]);

  // Stats for the events currently on screen (the active month, after filtering).
  const monthStats = useMemo(() => {
    const inMonth = events.filter(e => {
      const d = new Date(e.startDate);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const count = (t: EventType) => inMonth.filter(e => asType(e.type) === t).length;
    return {
      total: inMonth.length,
      meetings: count('MEETING'),
      milestones: count('MILESTONE'),
    };
  }, [events, year, month]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Agenda: upcoming events grouped chronologically by date.
  const agendaGroups = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const groups = new Map<string, { date: Date; items: CalendarEvent[] }>();
    [...events]
      .filter(e => +new Date(e.startDate) >= +now)
      .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
      .forEach(ev => {
        const d = new Date(ev.startDate);
        const key = dateKey(d);
        const g = groups.get(key);
        if (g) g.items.push(ev);
        else groups.set(key, { date: d, items: [ev] });
      });
    return [...groups.values()];
  }, [events]);

  // ---- Month grid ----------------------------------------------------------
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const periodLabel = view === 'week'
    ? (() => {
        const end = addDays(weekStart, 6);
        const sameMonth = weekStart.getMonth() === end.getMonth();
        return sameMonth
          ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}–${end.getDate()}, ${end.getFullYear()}`
          : `${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} – ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
      })()
    : `${MONTH_NAMES[month]} ${year}`;

  const VIEW_TABS: { id: ViewMode; label: string; Icon: RemixiconComponentType }[] = [
    { id: 'month', label: 'Month', Icon: RiLayoutGridLine },
    { id: 'week', label: 'Week', Icon: RiCalendarTodoLine },
    { id: 'agenda', label: 'Agenda', Icon: RiListCheck2 },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors" aria-label="Previous">
              <RiArrowLeftSLine size={18} />
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">{periodLabel}</span>
            <button onClick={goNext} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors" aria-label="Next">
              <RiArrowRightSLine size={18} />
            </button>
          </div>
          <button onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
            Today
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* View switcher */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {VIEW_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                  view === id ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {isLoading && <Loader size={16} className="animate-spin text-gray-400" />}
          <button
            onClick={() => openAdd(undefined)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Plus size={14} />
            Add Event
          </button>
        </div>
      </div>

      {/* Stats strip + type filter */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 font-medium">
            <RiCalendarScheduleLine size={13} /> {monthStats.total} this month
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 font-medium">
            <RiTeamLine size={13} /> {monthStats.meetings} meetings
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
            <RiFlag2Line size={13} /> {monthStats.milestones} milestones
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 mr-0.5">
            <RiFilterLine size={13} /> Filter
          </span>
          {ALL_TYPES.map(t => {
            const active = !hiddenTypes.has(t);
            const Icon = TYPE_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  active ? 'border-transparent text-white' : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50',
                )}
                style={active ? { backgroundColor: TYPE_COLORS[t] } : undefined}
              >
                <Icon size={12} />
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
        {/* Main view region */}
        <div className="lg:flex-1 overflow-auto p-4">
          {view === 'month' && (
            <div className="overflow-x-auto lg:overflow-visible">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[640px] lg:min-w-0">
              <div className="grid grid-cols-7 border-b border-gray-200">
                {DAY_NAMES.map(d => (
                  <div key={d} className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="h-28 border-b border-r border-gray-100 bg-gray-50/50" />;
                  const cellDate = new Date(year, month, day);
                  const evs = dayEvents(cellDate);
                  const isToday = sameDay(cellDate, today);
                  const dateStr = dateKey(cellDate);
                  return (
                    <div
                      key={day}
                      className={clsx(
                        'group h-28 border-b border-r border-gray-100 p-1.5 overflow-hidden cursor-pointer transition-colors',
                        isToday ? 'bg-brand-50/40' : 'hover:bg-gray-50/80',
                      )}
                      onClick={() => openAdd(dateStr)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className={clsx(
                          'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
                          isToday ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-700',
                        )}>
                          {day}
                        </div>
                        {evs.length > 0 && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                            {evs.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {evs.slice(0, 3).map(ev => (
                          <EventChip key={ev.id} ev={ev} onSelect={setSelectedEvent} />
                        ))}
                        {evs.length > 3 && (
                          <div className="text-xs text-gray-400 pl-1">+{evs.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}

          {view === 'week' && (
            <div className="overflow-x-auto lg:overflow-visible">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-w-[640px] lg:min-w-0">
              <div className="grid grid-cols-7 divide-x divide-gray-100">
                {weekDays.map(d => {
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={d.toISOString()}
                      className={clsx('px-2 py-2 text-center', isToday ? 'bg-brand-50/60' : 'bg-gray-50')}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{DAY_NAMES[d.getDay()]}</div>
                      <div className={clsx(
                        'mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold',
                        isToday ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-700',
                      )}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[60vh]">
                {weekDays.map(d => {
                  const evs = dayEvents(d);
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={d.toISOString()}
                      onClick={() => openAdd(dateKey(d))}
                      className={clsx(
                        'p-2 space-y-1 cursor-pointer transition-colors',
                        isToday ? 'bg-brand-50/20' : 'hover:bg-gray-50/80',
                      )}
                    >
                      {evs.length === 0 ? (
                        <div className="h-full min-h-[40px] flex items-center justify-center text-[11px] text-gray-300 select-none">—</div>
                      ) : (
                        evs.map(ev => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                            className="w-full text-left rounded-lg p-1.5 text-white transition-all hover:brightness-110 hover:shadow-sm"
                            style={{ backgroundColor: colorOf(ev) }}
                          >
                            <div className="text-xs font-semibold leading-tight truncate">{ev.title}</div>
                            <div className="flex items-center gap-1 text-[10px] opacity-90 mt-0.5">
                              <RiTimeLine size={10} />
                              {ev.allDay ? 'All day' : fmtTime(ev.startDate)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}

          {view === 'agenda' && (
            <div className="max-w-2xl mx-auto">
              {agendaGroups.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                    <RiCalendarEventLine size={24} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">No upcoming events</p>
                  <p className="text-xs text-gray-400 mt-1">Create one to see it on your agenda.</p>
                  <button
                    onClick={() => openAdd(undefined)}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                  >
                    <Plus size={14} /> Add Event
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {agendaGroups.map(group => {
                    const isToday = sameDay(group.date, today);
                    return (
                      <div key={dateKey(group.date)}>
                        <div className="flex items-baseline gap-2 mb-2 px-1">
                          <span className={clsx('text-sm font-semibold', isToday ? 'text-brand-600' : 'text-gray-900')}>
                            {isToday ? 'Today' : DAY_NAMES_FULL[group.date.getDay()]}
                          </span>
                          <span className="text-xs text-gray-400">
                            {MONTH_NAMES[group.date.getMonth()]} {group.date.getDate()}, {group.date.getFullYear()}
                          </span>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                          {group.items.map(ev => {
                            const Icon = TYPE_ICONS[asType(ev.type)];
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setSelectedEvent(ev)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                              >
                                <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: colorOf(ev) }} />
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${colorOf(ev)}1a` }}>
                                  <Icon size={18} style={{ color: colorOf(ev) }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-gray-900 truncate">{ev.title}</div>
                                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                    <span className="inline-flex items-center gap-1">
                                      <RiTimeLine size={12} />
                                      {ev.allDay ? 'All day' : fmtTime(ev.startDate)}
                                    </span>
                                    <span>·</span>
                                    <span>{TYPE_LABELS[asType(ev.type)]}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail: event detail OR upcoming events */}
        {selectedEvent ? (
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Event Details</span>
              <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-gray-100 rounded transition-colors"><X size={14} /></button>
            </div>
            <div className="w-full h-1.5 rounded-full mb-4" style={{ backgroundColor: colorOf(selectedEvent) }} />
            <div className="flex items-start gap-2.5 mb-3">
              {(() => {
                const Icon = TYPE_ICONS[asType(selectedEvent.type)];
                return (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${colorOf(selectedEvent)}1a` }}>
                    <Icon size={16} style={{ color: colorOf(selectedEvent) }} />
                  </div>
                );
              })()}
              <h3 className="text-base font-semibold text-gray-900 leading-snug">{selectedEvent.title}</h3>
            </div>
            <div className="space-y-2.5 text-sm text-gray-600 mb-4">
              <div>
                <span className="px-1.5 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: colorOf(selectedEvent) }}>
                  {TYPE_LABELS[asType(selectedEvent.type)]}
                </span>
                {selectedEvent.allDay && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">All day</span>
                )}
              </div>
              <div className="flex items-start gap-2">
                <RiTimeLine size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div>{new Date(selectedEvent.startDate).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: selectedEvent.allDay ? undefined : 'numeric', minute: selectedEvent.allDay ? undefined : '2-digit' })}</div>
                  {selectedEvent.endDate && (
                    <div className="text-gray-400 text-xs mt-0.5">
                      until {new Date(selectedEvent.endDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: selectedEvent.allDay ? undefined : 'numeric', minute: selectedEvent.allDay ? undefined : '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
              {selectedEvent.description && (
                <div className="pt-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Description</span>
                  <p className="mt-1 text-gray-600">{selectedEvent.description}</p>
                </div>
              )}
            </div>
            {isReadOnlyEvent(selectedEvent.id) ? (
              <p className="text-xs text-gray-400 px-1">Company holiday — managed under Attendance &rsaquo; Holidays.</p>
            ) : (
              <button
                onClick={() => deleteEvent(selectedEvent.id)}
                disabled={deletingId === selectedEvent.id}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors disabled:opacity-50"
              >
                {deletingId === selectedEvent.id ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete event
              </button>
            )}
          </div>
        ) : (
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white p-5 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <RiCalendarScheduleLine size={16} className="text-brand-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="text-center py-10">
                <RiCalendarEventLine size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">Nothing coming up</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcoming.map(ev => {
                  const d = new Date(ev.startDate);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors group"
                    >
                      <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: colorOf(ev) }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">{ev.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {!ev.allDay && ` · ${fmtTime(ev.startDate)}`}
                          {ev.allDay && ' · All day'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-gray-200 bg-white px-4 sm:px-6 py-2 flex items-center gap-4 flex-wrap">
        {ALL_TYPES.map(t => (
          <div key={t} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[t] }} />
            <span className="text-xs text-gray-500">{TYPE_LABELS[t]}</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddEventModal
          defaultDate={clickedDate}
          onClose={() => { setShowAdd(false); setClickedDate(undefined); }}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
