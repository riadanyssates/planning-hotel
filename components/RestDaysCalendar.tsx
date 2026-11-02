'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, getDaysInMonth, getDay, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DaySchedule, Employee } from '@/types';
import type { EmployeeMonthRow } from '@/lib/schedule';
import clsx from 'clsx';
import { openPrintWindow } from '@/lib/print';
import { moroccoNow } from '@/lib/morocco-time';
import DayStatusModal from './DayStatusModal';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// 0=Mon…6=Sun → short label
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// JS getDay (0=Sun) → Mon-based index
function toMon0(jsDay: number) {
  return (jsDay + 6) % 7;
}

// Append alpha hex to a #rrggbb color
function withAlpha(hex: string, alpha: number) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}

// Increase saturation + darken slightly (for rest-day display)
function saturate(hex: string, boost = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const ns = Math.min(1, s + boost);
  const nl = Math.max(0, l - boost * 0.25);
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  let nr, ng, nb;
  if (ns === 0) { nr = ng = nb = nl; } else {
    const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns;
    const p = 2 * nl - q;
    nr = hue2rgb(p, q, h + 1/3); ng = hue2rgb(p, q, h); nb = hue2rgb(p, q, h - 1/3);
  }
  const hex2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${hex2(nr)}${hex2(ng)}${hex2(nb)}`;
}

export default function RestDaysCalendar({ department, fetchToken }: { department?: string; fetchToken?: string }) {
  const now = moroccoNow();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [rows, setRows] = useState<EmployeeMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  // responsables : une case cliquée ouvre la fenêtre pour changer ce jour (pas dans la vue employé)
  const canEdit = !fetchToken;
  const [editing, setEditing] = useState<{ employee: Employee; date: string; day: DaySchedule | undefined } | null>(null);

  const fetchMonth = useCallback(async (y: number, m: number, silent = false) => {
    if (!silent) setLoading(true);
    const tp = fetchToken ? `&employeeToken=${fetchToken}` : '';
    const res = await fetch(`/api/planning/month?year=${y}&month=${m}${tp}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [fetchToken]);

  useEffect(() => { fetchMonth(year, month); }, [year, month, fetchMonth]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  const visible = department
    ? rows.filter(r => r.employee.department === department)
    : rows;

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const todayStr = format(now, 'yyyy-MM-dd');
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // Build day info array: { num, dayOfWeek, dateStr, isWeekend, isToday }
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    const dow = toMon0(getDay(d));   // 0=Mon…6=Sun
    const dateStr = format(d, 'yyyy-MM-dd');
    return {
      num: i + 1,
      dow,
      dateStr,
      isWeekend: dow >= 5,           // Sat(5) or Sun(6)
      isToday: dateStr === todayStr,
    };
  });

  // Summary stats
  const totalRestSlots  = visible.reduce((s, r) => s + r.restDays,  0);
  const totalLeaveSlots = visible.reduce((s, r) => s + r.leaveDays, 0);
  const totalSickSlots  = visible.reduce((s, r) => s + r.sickDays,  0);

  function handleExportPDF() {
    const headerCells = days.map(({ num, dow, isWeekend, isToday }) =>
      `<th class="${isToday ? 'th-today' : isWeekend ? 'th-weekend' : ''}">${num}<br/><span style="font-size:7px;font-weight:400">${DAY_LETTERS[dow]}</span></th>`
    ).join('');

    const bodyRows = visible.map((row) => {
      const dayCells = days.map(({ dateStr }) => {
        const day = row.days[dateStr];
        if (day?.is_leave) {
          const isCM = day.leave_type === 'cm';
          return `<td style="background-color:${isCM ? '#ffedd5' : '#dcfce7'};color:${isCM ? '#c2410c' : '#15803d'};font-size:8px;font-weight:700;text-align:center">${isCM ? 'CM' : 'CP'}</td>`;
        }
        const isRest = !day || day.is_off;
        if (isRest) {
          return `<td style="background-color:${saturate(row.employee.color)}"></td>`;
        }
        return `<td></td>`;
      }).join('');

      return `<tr>
        <td class="td-name"><span style="color:${row.employee.color};margin-right:4px">●</span>${row.employee.name}</td>
        ${dayCells}
        <td class="cell-count" style="color:#15803d;font-weight:700">${row.leaveDays > 0 ? row.leaveDays : ''}</td>
        <td class="cell-count" style="color:#c2410c;font-weight:700">${row.sickDays > 0 ? row.sickDays : ''}</td>
        <td class="cell-total" style="color:${row.employee.color}">${row.restDays}</td>
        <td class="cell-count">${row.workDays}</td>
      </tr>`;
    }).join('');

    const footerCells = days.map(({ dateStr, isWeekend }) => {
      const count = visible.filter(r => !r.days[dateStr] || r.days[dateStr].is_off).length;
      const ratio = visible.length > 0 ? count / visible.length : 0;
      const color = ratio >= 0.5 ? '#b91c1c' : ratio >= 0.3 ? '#b45309' : '#64748b';
      return `<td style="${isWeekend ? 'background:#f1f5f9;' : ''}color:${color};font-weight:${count > 0 ? 700 : 400}">${count > 0 ? count : ''}</td>`;
    }).join('');

    const html = `<table>
      <thead><tr>
        <th class="th-name">Employé</th>${headerCells}<th style="color:#15803d">CP</th><th style="color:#c2410c">CM</th><th>Repos</th><th>Travail</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      ${visible.length > 1 ? `<tfoot><tr>
        <td class="td-name">En repos</td>${footerCells}<td style="color:#15803d;font-weight:700">${totalLeaveSlots || ''}</td><td style="color:#c2410c;font-weight:700">${totalSickSlots || ''}</td><td>${totalRestSlots}</td><td></td>
      </tr></tfoot>` : ''}
    </table>`;

    openPrintWindow(
      `Jours de repos — ${MONTHS_FR[month - 1]} ${year}`,
      department || 'Tous les départements',
      html
    );
  }

  return (
    <div className="p-4 max-w-screen-xl mx-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn-secondary p-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goToday} className="btn-secondary px-3 py-2 text-sm">
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

        <div className="flex items-center gap-3">
          {!loading && visible.length > 0 && (
            <span className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{totalRestSlots}</span> repos ·{' '}
            <span className="font-semibold text-green-700">{totalLeaveSlots}</span> CP ·{' '}
            <span className="font-semibold text-orange-600">{totalSickSlots}</span> CM
            </span>
          )}
          <button onClick={handleExportPDF} disabled={loading || visible.length === 0} className="btn-secondary text-sm flex items-center gap-1.5">
            <PdfIcon />
            PDF
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-slate-200 border border-slate-300 inline-block" />
          Repos
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-green-100 border border-green-300 inline-flex items-center justify-center">
            <span className="text-[7px] font-bold text-green-700">CP</span>
          </span>
          Congés payés
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-orange-100 border border-orange-300 inline-flex items-center justify-center">
            <span className="text-[7px] font-bold text-orange-700">CM</span>
          </span>
          Congé maladie
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-white border border-slate-200 inline-block" />
          Travail
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-slate-50 border border-slate-200 inline-block" />
          Week-end (colonne)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded border-2 border-celadon-400 inline-block" />
          Aujourd'hui
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: `${140 + daysInMonth * 28}px` }}>
            {/* Header: day numbers + day letters */}
            <thead>
              <tr className="bg-celadon-500 text-white">
                {/* Employee name column */}
                <th className="sticky left-0 z-20 bg-celadon-500 px-3 py-2 text-left text-xs font-medium w-36 min-w-36">
                  Employé
                </th>

                {days.map(({ num, dow, dateStr, isWeekend, isToday }) => (
                  <th
                    key={num}
                    className={clsx(
                      'text-center py-1 select-none w-7 bg-celadon-500',
                      isToday && '!bg-taupe',
                      dow === 5 && 'border-l-2 border-slate-300'
                    )}
                    style={dow === 5 ? { borderRight: 'none' } : dow === 6 ? { borderRight: '2px solid #cbd5e1' } : undefined}
                  >
                    <div className={clsx('text-xs font-bold', isToday ? 'text-white' : 'text-white')}>
                      {num}
                    </div>
                    <div className={clsx(
                      'text-[9px] font-medium',
                      isWeekend ? 'text-slate-400' : 'text-slate-400',
                      isToday && '!text-white'
                    )}>
                      {DAY_LETTERS[dow]}
                    </div>
                  </th>
                ))}

                {/* Summary columns */}
                <th className="px-2 py-2 text-center text-xs font-medium text-green-600 w-12 whitespace-nowrap">
                  CP
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-orange-500 w-12 whitespace-nowrap">
                  CM
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-slate-400 w-14 whitespace-nowrap">
                  Repos
                </th>
                <th className="px-2 py-2 text-center text-xs font-medium text-slate-400 w-14 whitespace-nowrap">
                  Travail
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={daysInMonth + 3} className="py-16 text-center text-slate-400 text-sm">
                    Chargement...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 3} className="py-16 text-center text-slate-400 text-sm">
                    {rows.length === 0
                      ? <>Aucun employé. <a href="/manager/dashboard/employes" className="text-celadon-600 underline">Ajouter des employés</a></>
                      : 'Aucun employé dans ce département.'}
                  </td>
                </tr>
              ) : (
                visible.map((row, rowIdx) => (
                  <tr
                    key={row.employee.id}
                    className={clsx(
                      'border-t border-slate-100',
                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    )}
                  >
                    {/* Employee name */}
                    <td className={clsx(
                      'sticky left-0 z-10 px-3 py-1.5',
                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    )}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-slate-800 text-[10px] font-bold"
                          style={{ backgroundColor: row.employee.color }}
                        >
                          {row.employee.name[0].toUpperCase()}
                        </span>
                        <span className="text-xs font-medium text-slate-800 truncate max-w-[90px]">
                          {row.employee.name}
                        </span>
                      </div>
                    </td>

                    {/* Day cells */}
                    {days.map(({ num, dow, dateStr, isWeekend, isToday }) => {
                      const day: DaySchedule | undefined = row.days[dateStr];
                      const isLeave = day?.is_leave ?? false;
                      const isRest = !isLeave && (!day || day.is_off);
                      const isOther = isRest && !!day?.is_exception && !!day?.note;

                      return (
                        <td
                          key={num}
                          className={clsx(
                            'p-0 h-8',
                            canEdit && 'cursor-pointer hover:outline hover:outline-2 hover:outline-slate-400 hover:-outline-offset-2',
                            isToday && 'ring-1 ring-inset ring-taupe-light',
                            dow === 5 && 'border-l-2 border-slate-300'
                          )}
                          style={dow === 5 ? { borderRight: 'none' } : dow === 6 ? { borderRight: '2px solid #cbd5e1' } : undefined}
                          onClick={canEdit ? () => setEditing({ employee: row.employee, date: dateStr, day }) : undefined}
                          title={isLeave
                            ? `${row.employee.name} — ${day?.leave_type === 'cm' ? 'congé maladie' : 'congés payés'}`
                            : isOther
                            ? `${row.employee.name} — ${day?.note}`
                            : isRest
                            ? `${row.employee.name} — repos`
                            : `${row.employee.name} — ${day?.start_time?.slice(0, 5)}–${day?.end_time?.slice(0, 5)}`}
                        >
                          {isLeave ? (
                            <div className={`w-full h-full flex items-center justify-center ${
                              day?.leave_type === 'cm' ? 'bg-orange-100' : 'bg-green-100'
                            }`}>
                              <span className={`text-[8px] font-bold ${
                                day?.leave_type === 'cm' ? 'text-orange-700' : 'text-green-700'
                              }`}>
                                {day?.leave_type === 'cm' ? 'CM' : 'CP'}
                              </span>
                            </div>
                          ) : isRest ? (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ backgroundColor: saturate(row.employee.color) }}
                            >
                              {isOther && <span className="text-[8px] font-bold text-slate-700">{(day?.note || '').slice(0, 3)}</span>}
                            </div>
                          ) : (
                            <div className="w-full h-full" />
                          )}
                        </td>
                      );
                    })}

                    {/* CP days count */}
                    <td className="px-2 text-center">
                      {row.leaveDays > 0 ? (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          {row.leaveDays}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* CM days count */}
                    <td className="px-2 text-center">
                      {row.sickDays > 0 ? (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                          {row.sickDays}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    {/* Rest days count */}
                    <td className="px-2 text-center">
                      <span className={clsx(
                        'text-xs font-bold px-1.5 py-0.5 rounded',
                        row.restDays > 0 ? 'text-slate-800' : 'text-slate-300'
                      )}
                        style={row.restDays > 0 ? { backgroundColor: withAlpha(row.employee.color, 0.8) } : undefined}
                      >
                        {row.restDays}
                      </span>
                    </td>

                    {/* Work days count */}
                    <td className="px-2 text-center">
                      <span className="text-xs text-slate-500 font-medium">
                        {row.workDays}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Footer: rest count per day */}
            {!loading && visible.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 sticky bottom-0">
                  <td className="sticky left-0 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                    En repos
                  </td>
                  {days.map(({ num, dow, dateStr, isWeekend }) => {
                    const count = visible.filter(r => !r.days[dateStr] || r.days[dateStr].is_off).length;
                    const ratio = count / visible.length;
                    return (
                      <td
                        key={num}
                        className={clsx('text-center py-1', dow === 5 && 'border-l-2 border-slate-300')}
                        style={dow === 5 ? { borderRight: 'none' } : dow === 6 ? { borderRight: '2px solid #cbd5e1' } : undefined}
                      >
                        {count > 0 && (
                          <span
                            className="text-[10px] font-bold"
                            style={{
                              color: ratio >= 0.5 ? '#b91c1c' : ratio >= 0.3 ? '#b45309' : '#64748b'
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 text-center text-xs font-semibold text-green-700">
                    {totalLeaveSlots > 0 ? totalLeaveSlots : '—'}
                  </td>
                  <td className="px-2 text-center text-xs font-semibold text-orange-600">
                    {totalSickSlots > 0 ? totalSickSlots : '—'}
                  </td>
                  <td className="px-2 text-center text-xs font-semibold text-slate-500">
                    {totalRestSlots}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {editing && (
        <DayStatusModal
          employee={editing.employee}
          date={editing.date}
          day={editing.day}
          onClose={changed => { setEditing(null); if (changed) fetchMonth(year, month, true); }}
        />
      )}
    </div>
  );
}

function PdfIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
