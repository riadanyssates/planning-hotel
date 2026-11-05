'use client';
 
import { useState, useEffect, useCallback } from 'react';
import { format, addDays, subDays, startOfWeek, getDaysInMonth, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { EmployeeWeek } from '@/types';
import type { EmployeeMonthRow } from '@/lib/schedule';
import { computeWorkedHours, formatHoursMinutes } from '@/lib/schedule';
import clsx from 'clsx';
import { openPrintWindow } from '@/lib/print';
import { moroccoNow } from '@/lib/morocco-time';
 
interface TimeclockRow {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_color: string;
  date: string;
  type: 'arrival' | 'departure' | 'arrival2' | 'departure2';
  clocked_at: string;
}
 
interface EmployeeTimeclock {
  employee_id: number;
  employee_name: string;
  employee_color: string;
  arrival:    string | null;
  departure:  string | null;
  arrival2:   string | null;
  departure2: string | null;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  arrivalDiff:   number | null;
  departureDiff: number | null;
}
 
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
 
// JS getDay (0=Sun) → Mon-based index
function toMon0(jsDay: number) {
  return (jsDay + 6) % 7;
}
 
function toMins(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
 
function diffLabel(planned: string | null, actual: string | null): { text: string; cls: string } | null {
  const p = toMins(planned), a = toMins(actual);
  if (p === null || a === null) return null;
  const diff = a - p;
  const abs = Math.abs(diff);
  const text = diff === 0 ? 'À l\'heure' : diff > 0 ? `+${diff} min` : `${diff} min`;
  const cls = abs <= 5 ? 'text-green-600' : abs <= 15 ? 'text-orange-500' : 'text-red-600';
  return { text, cls };
}
 
// Same thresholds as diffLabel, but returning hex colors (for inline styles / PDF export)
function diffColor(planned: string | null, actual: string | null): string {
  const p = toMins(planned), a = toMins(actual);
  if (p === null || a === null) return '#94a3b8'; // slate-400 (pas d'info)
  const abs = Math.abs(a - p);
  return abs <= 5 ? '#16a34a' : abs <= 15 ? '#f97316' : '#dc2626';
}
 
function fmtDate(d: Date) {
  return format(d, 'EEEE d MMMM yyyy', { locale: fr });
}
 
function fmtHours(h: number): string {
  return formatHoursMinutes(h);
}
 
function PdfIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
 
export default function TimeclockManager() {
  const now = moroccoNow();
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
 
  // ── Vue Jour ──────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(() => format(now, 'yyyy-MM-dd'));
  const [entries, setEntries] = useState<TimeclockRow[]>([]);
  const [schedules, setSchedules] = useState<EmployeeWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
 
  const load = useCallback(async (date: string) => {
    setLoading(true);
    const weekStart = startOfWeek(new Date(date + 'T00:00:00'), { weekStartsOn: 1 });
    const [tcRes, schedRes] = await Promise.all([
      fetch(`/api/planning/timeclock?date=${date}`),
      fetch(`/api/planning?startDate=${format(weekStart, 'yyyy-MM-dd')}`),
    ]);
    if (tcRes.ok) setEntries(await tcRes.json());
    if (schedRes.ok) setSchedules(await schedRes.json());
    setLoading(false);
  }, []);
 
  useEffect(() => { if (viewMode === 'day') load(selectedDate); }, [selectedDate, load, viewMode]);
 
  async function handleDelete(id: number) {
    setDeletingId(id);
    await fetch(`/api/planning/timeclock?id=${id}`, { method: 'DELETE' });
    setDeletingId(null);
    load(selectedDate);
  }
 
  // ── Vue Mois ──────────────────────────────────────────────────────────
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [monthEntries, setMonthEntries] = useState<TimeclockRow[]>([]);
  const [monthSchedule, setMonthSchedule] = useState<EmployeeMonthRow[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
 
  const loadMonth = useCallback(async (y: number, m: number) => {
    setMonthLoading(true);
    const [tcRes, schedRes] = await Promise.all([
      fetch(`/api/planning/timeclock/month?year=${y}&month=${m}`),
      fetch(`/api/planning/month?year=${y}&month=${m}`),
    ]);
    if (tcRes.ok) setMonthEntries(await tcRes.json());
    if (schedRes.ok) setMonthSchedule(await schedRes.json());
    setMonthLoading(false);
  }, []);
 
  useEffect(() => { if (viewMode === 'month') loadMonth(year, month); }, [year, month, loadMonth, viewMode]);
 
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  function goCurrentMonth() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }
 
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const todayStr = format(now, 'yyyy-MM-dd');
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    const dow = toMon0(getDay(d));
    const dateStr = format(d, 'yyyy-MM-dd');
    return { num: i + 1, dow, dateStr, isWeekend: dow >= 5, isToday: dateStr === todayStr };
  });
 
  // Pointage du matin (arrivée) par employé + par jour, avec statut ponctualité
  function monthArrivalFor(employeeId: number, dateStr: string) {
    return monthEntries.find(e => e.employee_id === employeeId && e.date === dateStr && e.type === 'arrival') || null;
  }
 
  // Total des heures réellement pointées sur le mois pour un employé (somme jour par jour
  // des 4 pointages possibles), utilisé pour la colonne "Pointé" et l'écart heures supp/moins.
  function monthWorkedHoursFor(employeeId: number): number {
    const byDate = new Map<string, { arrival: string | null; departure: string | null; arrival2: string | null; departure2: string | null }>();
    for (const e of monthEntries) {
      if (e.employee_id !== employeeId) continue;
      if (!byDate.has(e.date)) byDate.set(e.date, { arrival: null, departure: null, arrival2: null, departure2: null });
      const d = byDate.get(e.date)!;
      d[e.type] = e.clocked_at;
    }
    let total = 0;
    byDate.forEach((d, date) => {
      total += computeWorkedHours(d.arrival, d.departure, d.arrival2, d.departure2, date);
    });
    return total;
  }
 
  function handleExportMonthPDF() {
    const headerCells = monthDays.map(({ num, dow, isWeekend, isToday }) =>
      `<th class="${isToday ? 'th-today' : isWeekend ? 'th-weekend' : ''}">${num}<br/><span style="font-size:7px;font-weight:400">${DAY_LETTERS[dow]}</span></th>`
    ).join('');
 
    const bodyRows = monthSchedule.map((row) => {
      let lateCount = 0;
      const dayCells = monthDays.map(({ dateStr }) => {
        const day = row.days[dateStr];
        const scheduled = day && !day.is_off && !day.is_leave;
        if (!scheduled) {
          return `<td style="background-color:#f1f5f9;"></td>`;
        }
        const arrivalEntry = monthArrivalFor(row.employee.id, dateStr);
        if (!arrivalEntry) {
          return `<td style="background-color:#fee2e2;color:#dc2626;font-size:7px;font-weight:700;">Absent</td>`;
        }
        const diff = diffLabel(day.start_time, arrivalEntry.clocked_at);
        if (diff && diff.cls !== 'text-green-600') lateCount++;
        const color = diffColor(day.start_time, arrivalEntry.clocked_at);
        return `<td style="color:${color};font-weight:700;">${arrivalEntry.clocked_at.slice(0, 5)}</td>`;
      }).join('');
 
      return `<tr>
        <td class="td-name"><span style="color:${row.employee.color};margin-right:4px">●</span>${row.employee.name}</td>
        ${dayCells}
        <td class="cell-count" style="color:${lateCount > 0 ? '#dc2626' : '#16a34a'}">${lateCount}</td>
      </tr>`;
    }).join('');
 
    const html = `<table>
      <thead><tr>
        <th class="th-name">Employé</th>${headerCells}<th>Retards</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
 
    openPrintWindow(
      `Pointage — ${MONTHS_FR[month - 1]} ${year}`,
      'Heure d\'arrivée du matin — vert = à l\'heure, orange = léger retard, rouge = retard',
      html
    );
  }
 
  const date = new Date(selectedDate + 'T00:00:00');
 
  return (
    <div className="p-4 max-w-screen-xl mx-auto">
 
      {/* Toggle Jour / Mois */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setViewMode('day')}
          className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium', viewMode === 'day' ? 'bg-celadon-500 text-white' : 'bg-slate-100 text-slate-600')}
        >
          Jour
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={clsx('px-3 py-1.5 rounded-lg text-sm font-medium', viewMode === 'month' ? 'bg-celadon-500 text-white' : 'bg-slate-100 text-slate-600')}
        >
          Mois
        </button>
      </div>
 
      {viewMode === 'day' ? (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => setSelectedDate(format(subDays(date, 1), 'yyyy-MM-dd'))} className="btn-secondary p-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => setSelectedDate(format(moroccoNow(), 'yyyy-MM-dd'))} className="btn-secondary px-3 py-2 text-sm">
              Aujourd'hui
            </button>
            <button onClick={() => setSelectedDate(format(addDays(date, 1), 'yyyy-MM-dd'))} className="btn-secondary p-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-slate-700 ml-1 capitalize">{fmtDate(date)}</span>
            <div className="ml-auto">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
 
          {/* Table jour */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="bg-celadon-500 text-white text-sm">
                    <th className="py-3 px-4 text-left font-medium sticky left-0 bg-celadon-500 w-36">Employé</th>
                    <th className="py-3 px-3 text-center font-medium text-white/70 w-20" title="Horaire prévu">Prévu</th>
                    <th className="py-3 px-3 text-center font-medium w-20">Arrivée</th>
                    <th className="py-3 px-3 text-center font-medium text-white/70 w-16">Écart</th>
                    <th className="py-3 px-3 text-center font-medium w-20">Départ</th>
                    <th className="py-3 px-3 text-center font-medium w-20">Total</th>
                    <th className="py-3 px-3 text-center font-medium text-white/60 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const map = new Map<number, EmployeeTimeclock>();
                    for (const row of schedules) {
                      const day = row.days[selectedDate];
                      if (!day || day.is_off) continue;
                      map.set(row.employee.id, {
                        employee_id: row.employee.id,
                        employee_name: row.employee.name,
                        employee_color: row.employee.color,
                        arrival: null, departure: null, arrival2: null, departure2: null,
                        scheduledStart: day.start_time,
                        scheduledEnd: day.end_time,
                        arrivalDiff: null,
                        departureDiff: null,
                      });
                    }
                    for (const e of entries) {
                      if (!map.has(e.employee_id)) {
                        map.set(e.employee_id, {
                          employee_id: e.employee_id,
                          employee_name: e.employee_name,
                          employee_color: e.employee_color,
                          arrival: null, departure: null, arrival2: null, departure2: null,
                          scheduledStart: null, scheduledEnd: null,
                          arrivalDiff: null, departureDiff: null,
                        });
                      }
                      const m = map.get(e.employee_id)!;
                      if (e.type === 'arrival')    m.arrival    = e.clocked_at;
                      if (e.type === 'departure')  m.departure  = e.clocked_at;
                      if (e.type === 'arrival2')   m.arrival2   = e.clocked_at;
                      if (e.type === 'departure2') m.departure2 = e.clocked_at;
                    }
                    const merged = Array.from(map.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
 
                    if (loading) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">Chargement...</td>
                        </tr>
                      );
                    }
                    if (merged.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                            Aucun pointage ni planning ce jour.
                          </td>
                        </tr>
                      );
                    }
                    return merged.map((row, i) => {
                      const arrDiff = diffLabel(row.scheduledStart, row.arrival);
                      const e1 = entries.find(e => e.employee_id === row.employee_id && e.type === 'arrival');
                      const e2 = entries.find(e => e.employee_id === row.employee_id && e.type === 'departure');
                      const e3 = entries.find(e => e.employee_id === row.employee_id && e.type === 'arrival2');
                      const e4 = entries.find(e => e.employee_id === row.employee_id && e.type === 'departure2');
                      const bg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                      const bgSticky = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                      function ClockCell({ time }: { time: string | null }) {
                        return time
                          ? <span className="text-sm font-semibold text-slate-800">{time}</span>
                          : <span className="text-xs text-slate-200">—</span>;
                      }
                      function DelBtn({ entry }: { entry: typeof e1 }) {
                        if (!entry) return null;
                        return (
                          <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id}
                            className="text-[10px] text-slate-300 hover:text-red-500 px-0.5"
                            title={`Supprimer ${entry.type}`}>
                            {deletingId === entry.id ? '…' : '✕'}
                          </button>
                        );
                      }
                      return (
                        <tr key={row.employee_id} className={clsx('border-t border-slate-100', bg)}>
                          <td className={clsx('py-3 px-4 sticky left-0', bgSticky)}>
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-slate-800 text-[10px] font-bold"
                                style={{ backgroundColor: row.employee_color }}>
                                {row.employee_name[0].toUpperCase()}
                              </span>
                              <span className="text-sm font-medium text-slate-800 truncate max-w-[100px]">{row.employee_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center text-xs text-slate-400 whitespace-nowrap">
                            {row.scheduledStart && row.scheduledEnd
                              ? <>{row.scheduledStart}<br/><span className="text-slate-300">→</span><br/>{row.scheduledEnd}</>
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <ClockCell time={row.arrival} />
                            {arrDiff && <div className={clsx('text-[10px] mt-0.5', arrDiff.cls)}>{arrDiff.text}</div>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {arrDiff
                              ? <span className={clsx('text-xs font-semibold', arrDiff.cls)}>{arrDiff.text}</span>
                              : <span className="text-slate-200 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <ClockCell time={row.departure2 || row.departure} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const worked = computeWorkedHours(row.arrival, row.departure, row.arrival2, row.departure2, selectedDate);
                              return worked > 0
                                ? <span className="text-sm font-bold text-slate-800">{fmtHours(worked)}</span>
                                : <span className="text-xs text-slate-200">—</span>;
                            })()}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-0.5 flex-wrap">
                              <DelBtn entry={e1} /><DelBtn entry={e2} />
                              <DelBtn entry={e3} /><DelBtn entry={e4} />
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
 
            {!loading && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex flex-wrap gap-4">
                <span className="text-green-600 font-medium">À l'heure (≤5 min)</span>
                <span className="text-orange-500 font-medium">Léger retard (5–15 min)</span>
                <span className="text-red-600 font-medium">Retard (&gt;15 min)</span>
                <span>Négatif = en avance</span>
                <span className="text-slate-400">Deux pointages par jour : arrivée et départ (la pause déjeuner ne se pointe plus)</span>
                <span className="text-slate-400">Total : temps de présence moins 50 min de déjeuner pour les journées de plus de 6 h</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Toolbar mois */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="btn-secondary p-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goCurrentMonth} className="btn-secondary px-3 py-2 text-sm">
                Ce mois
              </button>
              <button onClick={nextMonth} className="btn-secondary p-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-slate-700 ml-1">
                {MONTHS_FR[month - 1]} {year}
              </span>
            </div>
 
            <button onClick={handleExportMonthPDF} disabled={monthLoading || monthSchedule.length === 0} className="btn-secondary text-sm flex items-center gap-1.5">
              <PdfIcon />
              Exporter en PDF
            </button>
          </div>
 
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
              À l'heure (≤5 min)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
              Léger retard (5–15 min)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
              Retard (&gt;15 min)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-100 border border-red-200 inline-block" />
              Absent (prévu mais non pointé)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-100 border border-slate-200 inline-block" />
              Non prévu / repos
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-600 font-bold">+</span>
              Écart = heures pointées − heures prévues (vert = heures supp, rouge = heures en moins)
            </div>
          </div>
 
          {/* Grille mois */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: `${140 + daysInMonth * 32}px` }}>
                <thead>
                  <tr className="bg-celadon-500 text-white">
                    <th className="sticky left-0 z-20 bg-celadon-500 px-3 py-2 text-left text-xs font-medium w-36 min-w-36">
                      Employé
                    </th>
                    {monthDays.map(({ num, dow, isWeekend, isToday }) => (
                      <th
                        key={num}
                        className={clsx(
                          'text-center py-1 select-none w-8 bg-celadon-500',
                          isToday && '!bg-taupe',
                          dow === 5 && 'border-l-2 border-slate-300'
                        )}
                        style={dow === 6 ? { borderRight: '2px solid #cbd5e1' } : undefined}
                      >
                        <div className="text-xs font-bold text-white">{num}</div>
                        <div className={clsx('text-[9px] font-medium text-slate-400', isToday && '!text-white')}>
                          {DAY_LETTERS[dow]}
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center text-xs font-medium text-white/80 w-16 whitespace-nowrap">
                      Retards
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-white/80 w-16 whitespace-nowrap">
                      Pointé
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-white/80 w-20 whitespace-nowrap" title="Heures pointées − heures prévues au planning">
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthLoading ? (
                    <tr>
                      <td colSpan={daysInMonth + 4} className="py-16 text-center text-slate-400 text-sm">Chargement...</td>
                    </tr>
                  ) : monthSchedule.length === 0 ? (
                    <tr>
                      <td colSpan={daysInMonth + 4} className="py-16 text-center text-slate-400 text-sm">
                        Aucun employé.
                      </td>
                    </tr>
                  ) : (
                    monthSchedule.map((row, rowIdx) => {
                      let lateCount = 0;
                      const cells = monthDays.map(({ num, dow, dateStr, isToday }) => {
                        const day = row.days[dateStr];
                        const scheduled = day && !day.is_off && !day.is_leave;
                        const arrivalEntry = scheduled ? monthArrivalFor(row.employee.id, dateStr) : null;
                        const diff = scheduled && arrivalEntry ? diffLabel(day.start_time, arrivalEntry.clocked_at) : null;
                        if (diff && diff.cls !== 'text-green-600') lateCount++;
 
                        return (
                          <td
                            key={num}
                            className={clsx('p-0 h-9 text-center', isToday && 'ring-1 ring-inset ring-taupe-light', dow === 5 && 'border-l-2 border-slate-300')}
                            style={dow === 6 ? { borderRight: '2px solid #cbd5e1' } : undefined}
                            title={!scheduled
                              ? `${row.employee.name} — non prévu / repos`
                              : arrivalEntry
                              ? `${row.employee.name} — arrivée ${arrivalEntry.clocked_at.slice(0, 5)} (prévu ${day!.start_time?.slice(0, 5)})`
                              : `${row.employee.name} — absent, prévu ${day!.start_time?.slice(0, 5)}`}
                          >
                            {!scheduled ? (
                              <div className="w-full h-full bg-slate-50" />
                            ) : arrivalEntry ? (
                              <span className={clsx('text-[10px] font-semibold', diffLabel(day!.start_time, arrivalEntry.clocked_at)?.cls || 'text-slate-600')}>
                                {arrivalEntry.clocked_at.slice(0, 5)}
                              </span>
                            ) : (
                              <div className="w-full h-full bg-red-50 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-red-500">✕</span>
                              </div>
                            )}
                          </td>
                        );
                      });
 
                      return (
                        <tr key={row.employee.id} className={clsx('border-t border-slate-100', rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
                          <td className={clsx('sticky left-0 z-10 px-3 py-1.5', rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-slate-800 text-[10px] font-bold"
                                style={{ backgroundColor: row.employee.color }}>
                                {row.employee.name[0].toUpperCase()}
                              </span>
                              <span className="text-xs font-medium text-slate-800 truncate max-w-[90px]">{row.employee.name}</span>
                            </div>
                          </td>
                          {cells}
                          <td className={clsx('text-center text-xs font-bold', lateCount > 0 ? 'text-red-600' : 'text-green-600')}>
                            {lateCount > 0 ? lateCount : '—'}
                          </td>
                          {(() => {
                            const worked = monthWorkedHoursFor(row.employee.id);
                            const gap = worked - row.totalHours;
                            const gapRounded = Math.round(gap * 10) / 10;
                            return (
                              <>
                                <td className="text-center text-xs font-bold text-slate-700">
                                  {worked > 0 ? fmtHours(worked) : '—'}
                                </td>
                                <td className={clsx(
                                  'text-center text-xs font-bold',
                                  gapRounded === 0 ? 'text-slate-400' : gapRounded > 0 ? 'text-green-600' : 'text-red-600'
                                )}>
                                  {worked === 0 ? '—' : `${gapRounded > 0 ? '+' : ''}${fmtHours(gapRounded)}`}
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
 
 
 

