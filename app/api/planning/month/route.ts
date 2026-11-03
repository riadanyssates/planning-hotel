import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { teamAccess, hiddenFromPlanningSql } from '@/lib/team-access';
import { getAllEmployeesMonthSchedule } from '@/lib/schedule';
import type { Employee } from '@/types';


export async function GET(req: NextRequest) {
  const access = await teamAccess(req);
  if (!access) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = Number(searchParams.get('year') || now.getFullYear());
  const month = Number(searchParams.get('month') || now.getMonth() + 1);

  const { startOfMonth, endOfMonth, format } = await import('date-fns');
  const ms = startOfMonth(new Date(year, month - 1));
  const me = endOfMonth(ms);
  const mStart = format(ms, 'yyyy-MM-dd');
  const mEnd   = format(me, 'yyyy-MM-dd');

  const db = await getDb();
  const employeesRes = await db.execute({
    sql: `SELECT * FROM employees WHERE (contract_start IS NULL OR contract_start <= ?) AND (contract_end IS NULL OR contract_end >= ?)${hiddenFromPlanningSql()} ORDER BY name ASC`,
    args: [mEnd, mStart],
  });
  const employees = employeesRes.rows as unknown as Employee[];

  const data = await getAllEmployeesMonthSchedule(year, month, employees);
  return NextResponse.json(data);
}
