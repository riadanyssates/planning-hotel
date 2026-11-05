import { getDb } from './db';
import type { Client } from '@libsql/client';
import type { Employee, EmployeeWeek, DaySchedule, MonthStats, LeaveType } from '@/types';
import { format, addDays, getDay, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
 
export interface EmployeeMonthRow {
  employee: Employee;
  days: Record<string, DaySchedule>;
  totalHours: number;
  restDays: number;  // repos normaux
  leaveDays: number; // congés payés (CP)
  sickDays: number;  // congés maladie (CM)
  workDays: number;
}
 
export function calcHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  const diff = endMins >= startMins
    ? endMins - startMins
    : 24 * 60 - startMins + endMins;
  return diff / 60;
}
 
export function calcTotalHours(
  s1: string | null, e1: string | null,
  s2: string | null, e2: string | null
): number {
  // deux créneaux = la coupure est déjà le déjeuner ; un seul créneau = on retire le déjeuner
  if (s2 && e2) return calcHours(s1, e1) + calcHours(s2, e2);
  return withLunchBreak(calcHours(s1, e1));
}

// Journée de plus de 6 h : 50 min de déjeuner retirées (les journées courtes, 5 h par exemple, ne perdent rien).
export const LUNCH_BREAK_HOURS = 50 / 60;
export const LUNCH_BREAK_MIN_SESSION_HOURS = 6;
export function withLunchBreak(span: number): number {
  return span > LUNCH_BREAK_MIN_SESSION_HOURS ? span - LUNCH_BREAK_HOURS : span;
}
 
// Temps travaillé d'une journée : présence de l'arrivée (arrival) au départ (departure2),
// moins 50 min de déjeuner au-delà de 6 h (withLunchBreak). La pause déjeuner n'est plus
// pointée ; les anciens pointages de pause (departure / arrival2) sont ignorés, sauf
// « departure » qui sert de départ quand le départ du soir manque (anciennes journées).
// Tant que le départ n'est pas pointé, renvoie 0.
export function computeWorkedHours(
  arrival: string | null,
  departure: string | null,
  _arrival2: string | null,
  departure2: string | null
): number {
  const end = departure2 || departure;
  if (arrival && end) {
    const span = calcHours(arrival, end);
    return withLunchBreak(span);
  }
  return 0;
}
 
// Formats a decimal number of hours as "XhYY" (e.g. 7.5 -> "7h30", 8 -> "8h",
// -1.25 -> "-1h15"). Rounds to the nearest minute.
export function formatHoursMinutes(hours: number): string {
  const sign = hours < 0 ? '-' : '';
  const abs = Math.abs(hours);
  let h = Math.floor(abs);
  let m = Math.round((abs - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h${String(m).padStart(2, '0')}`;
}
 
export function isOvernightShift(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em < sh * 60 + sm;
}
 
// Convert JS getDay() (0=Sun) to Mon=0 format
function toMon0(jsDay: number): number {
  return (jsDay + 6) % 7;
}
 
// Ensure slot1 is always the earlier start time.
// HH:MM lexicographic comparison equals chronological order for same-day times.
function sortedSlots(
  s1: string | null, e1: string | null,
  s2: string | null, e2: string | null,
): [string | null, string | null, string | null, string | null] {
  if (!s1 || !s2) return [s1, e1, s2, e2];
  return s1 <= s2 ? [s1, e1, s2, e2] : [s2, e2, s1, e1];
}
 
// Build a Map<"employeeId-YYYY-MM-DD", LeaveType> for all leave days in the range
async function buildLeaveMap(db: Client, startStr: string, endStr: string): Promise<Map<string, LeaveType>> {
  const res = await db.execute({
    sql: 'SELECT employee_id, start_date, end_date, leave_type FROM paid_leaves WHERE start_date <= ? AND end_date >= ?',
    args: [endStr, startStr],
  });
  const map = new Map<string, LeaveType>();
  const rangeStart = new Date(startStr + 'T00:00:00');
  const rangeEnd   = new Date(endStr   + 'T00:00:00');
  for (const row of res.rows) {
    const leaveType = ((row.leave_type as string) || 'cp') as LeaveType;
    let d = new Date((row.start_date as string) + 'T00:00:00');
    const dEnd = new Date((row.end_date as string) + 'T00:00:00');
    while (d <= dEnd) {
      if (d >= rangeStart && d <= rangeEnd) {
        map.set(`${row.employee_id}-${format(d, 'yyyy-MM-dd')}`, leaveType);
      }
      d = addDays(d, 1);
    }
  }
  return map;
}
 
function makeLeaveDay(leaveType: LeaveType): DaySchedule {
  return {
    start_time: null, end_time: null,
    start_time2: null, end_time2: null,
    is_off: true, is_exception: false, is_leave: true, leave_type: leaveType, hours: 0,
  };
}
 
export async function getWeekSchedules(
  startDate: Date,
  employees: Employee[]
): Promise<EmployeeWeek[]> {
  const db = await getDb();
 
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(format(addDays(startDate, i), 'yyyy-MM-dd'));
  }
 
  const [exceptionsRes, templatesRes, leaveMap] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM schedule_exceptions WHERE date >= ? AND date <= ?',
      args: [dates[0], dates[6]],
    }),
    db.execute('SELECT * FROM schedule_templates'),
    buildLeaveMap(db, dates[0], dates[6]),
  ]);
 
  const exceptions = new Map<string, typeof exceptionsRes.rows[0]>();
  for (const row of exceptionsRes.rows) {
    exceptions.set(`${row.employee_id}-${row.date}`, row);
  }
 
  const templates = new Map<string, typeof templatesRes.rows[0]>();
  for (const row of templatesRes.rows) {
    templates.set(`${row.employee_id}-${row.day_of_week}`, row);
  }
 
  return employees.map((employee) => {
    const days: Record<string, DaySchedule> = {};
    let totalHours = 0;
 
    for (const date of dates) {
      const lt = leaveMap.get(`${employee.id}-${date}`);
      if (lt) {
        days[date] = makeLeaveDay(lt);
        continue;
      }
      const dayOfWeek = toMon0(getDay(new Date(date + 'T00:00:00')));
      const exc = exceptions.get(`${employee.id}-${date}`);
      const tpl = templates.get(`${employee.id}-${dayOfWeek}`);
 
      if (exc) {
        const [s1, e1, s2, e2] = sortedSlots(
          exc.start_time as string | null, exc.end_time as string | null,
          exc.start_time2 as string | null, exc.end_time2 as string | null,
        );
        const hours = calcTotalHours(s1, e1, s2, e2);
        totalHours += hours;
        days[date] = {
          start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
          is_off: !s1, is_exception: true,
          is_leave: false, leave_type: null,
          note: exc.note as string | null, hours,
        };
      } else if (tpl) {
        const [s1, e1, s2, e2] = sortedSlots(
          tpl.start_time as string | null, tpl.end_time as string | null,
          tpl.start_time2 as string | null, tpl.end_time2 as string | null,
        );
        const hours = calcTotalHours(s1, e1, s2, e2);
        totalHours += hours;
        days[date] = {
          start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
          is_off: !s1, is_exception: false,
          is_leave: false, leave_type: null, hours,
        };
      } else {
        days[date] = {
          start_time: null, end_time: null, start_time2: null, end_time2: null,
          is_off: true, is_exception: false, is_leave: false, leave_type: null, hours: 0,
        };
      }
    }
 
    return { employee, days, totalHours };
  });
}
 
export async function getMonthStats(
  year: number,
  month: number,
  employees: Employee[]
): Promise<MonthStats[]> {
  const db = await getDb();
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const startStr = format(monthStart, 'yyyy-MM-dd');
  const endStr = format(monthEnd, 'yyyy-MM-dd');
 
  const [exceptionsRes, templatesRes, leaveMap] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM schedule_exceptions WHERE date >= ? AND date <= ?',
      args: [startStr, endStr],
    }),
    db.execute('SELECT * FROM schedule_templates'),
    buildLeaveMap(db, startStr, endStr),
  ]);
 
  const exceptions = new Map<string, typeof exceptionsRes.rows[0]>();
  for (const row of exceptionsRes.rows) {
    exceptions.set(`${row.employee_id}-${row.date}`, row);
  }
 
  const templates = new Map<string, typeof templatesRes.rows[0]>();
  for (const row of templatesRes.rows) {
    templates.set(`${row.employee_id}-${row.day_of_week}`, row);
  }
 
  return employees.map((employee) => {
    let totalHours = 0;
    const weeklyBreakdown: Record<string, number> = {};
 
    let current = monthStart;
    while (current <= monthEnd) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const weekKey = format(startOfWeek(current, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const dayOfWeek = toMon0(getDay(current));
 
      let hours = 0;
      if (!leaveMap.get(`${employee.id}-${dateStr}`)) {
        const exc = exceptions.get(`${employee.id}-${dateStr}`);
        const tpl = templates.get(`${employee.id}-${dayOfWeek}`);
        if (exc) {
          hours = calcTotalHours(
            exc.start_time as string | null, exc.end_time as string | null,
            exc.start_time2 as string | null, exc.end_time2 as string | null,
          );
        } else if (tpl) {
          hours = calcTotalHours(
            tpl.start_time as string | null, tpl.end_time as string | null,
            tpl.start_time2 as string | null, tpl.end_time2 as string | null,
          );
        }
      }
 
      totalHours += hours;
      weeklyBreakdown[weekKey] = (weeklyBreakdown[weekKey] || 0) + hours;
      current = addDays(current, 1);
    }
 
    return { employee, totalHours, weeklyBreakdown };
  });
}
 
export async function getEmployeeMonthSchedule(
  employeeId: number,
  year: number,
  month: number
) {
  const db = await getDb();
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const startStr = format(monthStart, 'yyyy-MM-dd');
  const endStr = format(monthEnd, 'yyyy-MM-dd');
 
  const [exceptionsRes, templatesRes, leaveMap] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM schedule_exceptions WHERE employee_id = ? AND date >= ? AND date <= ?',
      args: [employeeId, startStr, endStr],
    }),
    db.execute({
      sql: 'SELECT * FROM schedule_templates WHERE employee_id = ?',
      args: [employeeId],
    }),
    buildLeaveMap(db, startStr, endStr),
  ]);
 
  const exceptions = new Map<string, typeof exceptionsRes.rows[0]>();
  for (const row of exceptionsRes.rows) {
    exceptions.set(row.date as string, row);
  }
 
  const templates = new Map<number, typeof templatesRes.rows[0]>();
  for (const row of templatesRes.rows) {
    templates.set(row.day_of_week as number, row);
  }
 
  const schedule: Record<string, DaySchedule> = {};
  let totalHours = 0;
 
  let current = monthStart;
  while (current <= monthEnd) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayOfWeek = toMon0(getDay(current));
 
    const lt = leaveMap.get(`${employeeId}-${dateStr}`);
    if (lt) {
      schedule[dateStr] = makeLeaveDay(lt);
      current = addDays(current, 1);
      continue;
    }
 
    const exc = exceptions.get(dateStr);
    const tpl = templates.get(dayOfWeek);
 
    if (exc) {
      const [s1, e1, s2, e2] = sortedSlots(
        exc.start_time as string | null, exc.end_time as string | null,
        exc.start_time2 as string | null, exc.end_time2 as string | null,
      );
      const hours = calcTotalHours(s1, e1, s2, e2);
      totalHours += hours;
      schedule[dateStr] = {
        start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
        is_off: !s1, is_exception: true,
        is_leave: false, leave_type: null,
        note: exc.note as string | null, hours,
      };
    } else if (tpl) {
      const [s1, e1, s2, e2] = sortedSlots(
        tpl.start_time as string | null, tpl.end_time as string | null,
        tpl.start_time2 as string | null, tpl.end_time2 as string | null,
      );
      const hours = calcTotalHours(s1, e1, s2, e2);
      totalHours += hours;
      schedule[dateStr] = {
        start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
        is_off: !s1, is_exception: false,
        is_leave: false, leave_type: null, hours,
      };
    } else {
      schedule[dateStr] = {
        start_time: null, end_time: null, start_time2: null, end_time2: null,
        is_off: true, is_exception: false, is_leave: false, leave_type: null, hours: 0,
      };
    }
 
    current = addDays(current, 1);
  }
 
  return { schedule, totalHours };
}
 
export async function getAllEmployeesMonthSchedule(
  year: number,
  month: number,
  employees: Employee[]
): Promise<EmployeeMonthRow[]> {
  const db = await getDb();
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const startStr = format(monthStart, 'yyyy-MM-dd');
  const endStr = format(monthEnd, 'yyyy-MM-dd');
 
  const [exceptionsRes, templatesRes, leaveMap] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM schedule_exceptions WHERE date >= ? AND date <= ?',
      args: [startStr, endStr],
    }),
    db.execute('SELECT * FROM schedule_templates'),
    buildLeaveMap(db, startStr, endStr),
  ]);
 
  const exceptions = new Map<string, typeof exceptionsRes.rows[0]>();
  for (const row of exceptionsRes.rows) {
    exceptions.set(`${row.employee_id}-${row.date}`, row);
  }
  const templates = new Map<string, typeof templatesRes.rows[0]>();
  for (const row of templatesRes.rows) {
    templates.set(`${row.employee_id}-${row.day_of_week}`, row);
  }
 
  return employees.map((employee) => {
    const days: Record<string, DaySchedule> = {};
    let totalHours = 0;
    let restDays = 0;
    let leaveDays = 0;
    let sickDays = 0;
    let workDays = 0;
 
    let current = monthStart;
    while (current <= monthEnd) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const dayOfWeek = toMon0(getDay(current));
 
      let entry: DaySchedule;
      const lt = leaveMap.get(`${employee.id}-${dateStr}`);
      if (lt) {
        entry = makeLeaveDay(lt);
      } else {
        const exc = exceptions.get(`${employee.id}-${dateStr}`);
        const tpl = templates.get(`${employee.id}-${dayOfWeek}`);
        if (exc) {
          const [s1, e1, s2, e2] = sortedSlots(
            exc.start_time as string | null, exc.end_time as string | null,
            exc.start_time2 as string | null, exc.end_time2 as string | null,
          );
          const hours = calcTotalHours(s1, e1, s2, e2);
          totalHours += hours;
          entry = {
            start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
            is_off: !s1, is_exception: true,
            is_leave: false, leave_type: null,
            note: exc.note as string | null, hours,
          };
        } else if (tpl) {
          const [s1, e1, s2, e2] = sortedSlots(
            tpl.start_time as string | null, tpl.end_time as string | null,
            tpl.start_time2 as string | null, tpl.end_time2 as string | null,
          );
          const hours = calcTotalHours(s1, e1, s2, e2);
          totalHours += hours;
          entry = {
            start_time: s1, end_time: e1, start_time2: s2, end_time2: e2,
            is_off: !s1, is_exception: false,
            is_leave: false, leave_type: null, hours,
          };
        } else {
          entry = {
            start_time: null, end_time: null, start_time2: null, end_time2: null,
            is_off: true, is_exception: false, is_leave: false, leave_type: null, hours: 0,
          };
        }
      }
 
      if (entry.leave_type === 'cm') sickDays++;
      else if (entry.is_leave) leaveDays++;
      else if (entry.is_off) restDays++;
      else workDays++;
      days[dateStr] = entry;
      current = addDays(current, 1);
    }
 
    return { employee, days, totalHours, restDays, leaveDays, sickDays, workDays };
  });
}
 
 
 

