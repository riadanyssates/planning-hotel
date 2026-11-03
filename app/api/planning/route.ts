import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { teamAccess, hiddenFromPlanningSql } from '@/lib/team-access';
import { getWeekSchedules, getMonthStats } from '@/lib/schedule';
import { startOfWeek } from 'date-fns';
import type { Employee } from '@/types';


// GET /api/planning?startDate=YYYY-MM-DD  → week schedule for all employees
// GET /api/planning?year=2024&month=1     → monthly stats
export async function GET(req: NextRequest) {
  const access = await teamAccess(req);
  if (!access) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (year && month) {
    const { startOfMonth, endOfMonth: eom } = await import('date-fns');
    const ms = startOfMonth(new Date(Number(year), Number(month) - 1));
    const me = eom(ms);
    const { format: fmt } = await import('date-fns');
    const mStart = fmt(ms, 'yyyy-MM-dd');
    const mEnd   = fmt(me, 'yyyy-MM-dd');
    const empRes = await db.execute({
      sql: `SELECT * FROM employees WHERE (contract_start IS NULL OR contract_start <= ?) AND (contract_end IS NULL OR contract_end >= ?)${hiddenFromPlanningSql()} ORDER BY name ASC`,
      args: [mEnd, mStart],
    });
    const employees = empRes.rows as unknown as Employee[];
    const stats = await getMonthStats(Number(year), Number(month), employees);
    return NextResponse.json(stats);
  }

  const weekStart = startDate
    ? new Date(startDate + 'T00:00:00')
    : startOfWeek(new Date(), { weekStartsOn: 1 });

  const { format: fmt, addDays } = await import('date-fns');
  const wStart = fmt(weekStart, 'yyyy-MM-dd');
  const wEnd   = fmt(addDays(weekStart, 6), 'yyyy-MM-dd');
  const empRes = await db.execute({
    sql: `SELECT * FROM employees WHERE (contract_start IS NULL OR contract_start <= ?) AND (contract_end IS NULL OR contract_end >= ?)${hiddenFromPlanningSql()} ORDER BY name ASC`,
    args: [wEnd, wStart],
  });
  const employees = empRes.rows as unknown as Employee[];
  const schedules = await getWeekSchedules(weekStart, employees);
  return NextResponse.json(schedules);
}
