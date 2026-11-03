import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { teamAccess, hiddenFromPlanningSql } from '@/lib/team-access';
 
 
// GET /api/planning/timeclock/range?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns all timeclock entries between start and end (inclusive) with employee info.
// Accessible to a manager session OR any valid employeeToken (team-wide, read-only —
// same access level as /api/planning, used by WeekCalendar/DayTimeline to flag
// clock-ins that happen on a scheduled rest day).
export async function GET(req: NextRequest) {
  const access = await teamAccess(req);
  if (!access) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
 
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start et end requis' }, { status: 400 });
 
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT t.*, e.name as employee_name, e.color as employee_color
          FROM timeclock t
          JOIN employees e ON e.id = t.employee_id
          WHERE t.date BETWEEN ? AND ?${hiddenFromPlanningSql('e')}
          ORDER BY e.name, t.date, t.type`,
    args: [start, end],
  });
 
  return NextResponse.json(res.rows);
}
 

