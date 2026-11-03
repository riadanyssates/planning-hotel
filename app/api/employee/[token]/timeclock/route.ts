import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Employee } from '@/types';
import { removeLeaveDayOnPunch, fillRestDayFromPunches } from '@/lib/leave-punch';
import { getWeekSchedules } from '@/lib/schedule';
import { LATE_AFTER_MIN } from '@/lib/late-check';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
 
type Ctx = { params: Promise<{ token: string }> };
 
async function resolveEmployee(token: string): Promise<Employee | null> {
  const db = await getDb();
  const res = await db.execute({ sql: 'SELECT * FROM employees WHERE access_token = ?', args: [token] });
  return res.rows.length > 0 ? (res.rows[0] as unknown as Employee) : null;
}
 
// GET /api/employee/[token]/timeclock?date=YYYY-MM-DD
// GET /api/employee/[token]/timeclock?year=YYYY&month=M   → tous les pointages du mois (pour "Mes pointages")
export async function GET(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });
 
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  const db = await getDb();
 
  if (year && month) {
    const { startOfMonth, endOfMonth, format } = await import('date-fns');
    const ms = startOfMonth(new Date(Number(year), Number(month) - 1));
    const me = endOfMonth(ms);
    const res = await db.execute({
      sql: 'SELECT * FROM timeclock WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date, type',
      args: [employee.id, format(ms, 'yyyy-MM-dd'), format(me, 'yyyy-MM-dd')],
    });
    return NextResponse.json(res.rows);
  }
 
  const res = date
    ? await db.execute({
        sql: 'SELECT * FROM timeclock WHERE employee_id = ? AND date = ? ORDER BY created_at',
        args: [employee.id, date],
      })
    : await db.execute({
        sql: 'SELECT * FROM timeclock WHERE employee_id = ? ORDER BY date DESC, created_at DESC LIMIT 30',
        args: [employee.id],
      });
 
  return NextResponse.json(res.rows);
}
 
// POST /api/employee/[token]/timeclock  { type: 'arrival'|'departure', clockedAt: 'HH:MM', date: 'YYYY-MM-DD' }
export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });
 
  const { type, clockedAt, date } = await req.json();
  if (!type || !clockedAt || !date) return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  const validTypes = ['arrival', 'departure', 'arrival2', 'departure2'];
  if (!validTypes.includes(type)) return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
 
  const db = await getDb();
 
  // Check if already clocked for this type today
  const existing = await db.execute({
    sql: 'SELECT id FROM timeclock WHERE employee_id = ? AND date = ? AND type = ?',
    args: [employee.id, date, type],
  });
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Pointage déjà enregistré pour aujourd\'hui' }, { status: 409 });
  }
 
  const result = await db.execute({
    sql: 'INSERT INTO timeclock (employee_id, date, type, clocked_at) VALUES (?, ?, ?, ?) RETURNING *',
    args: [employee.id, date, type, clockedAt],
  });
 
  const typeLabel = type === 'arrival' ? 'arrivée matin' : type === 'departure' ? 'départ déjeuner' : type === 'arrival2' ? 'retour déjeuner' : 'départ soir';
  await db.execute({
    sql: `INSERT INTO notifications (type, employee_name, message) VALUES ('timeclock', ?, ?)`,
    args: [employee.name, `${employee.name} a pointé son ${typeLabel} à ${clockedAt}`],
  }).catch(() => {});

  // Arrivée (ou retour de pause) pointée avec LATE_AFTER_MIN minutes de retard ou plus : alerte pour les responsables
  if (type === 'arrival' || type === 'arrival2') {
    try {
      const weeks = await getWeekSchedules(new Date(date + 'T00:00:00'), [employee]);
      const day = weeks[0]?.days[date];
      const start = type === 'arrival' ? day?.start_time : day?.start_time2;
      if (day && !day.is_off && !day.is_leave && start) {
        const late = toMin(String(clockedAt).slice(0, 5)) - toMin(start.slice(0, 5));
        if (late >= LATE_AFTER_MIN && late <= 12 * 60) {
          const label = type === 'arrival' ? 'arrivée' : 'retour de pause';
          await db.execute({
            sql: `INSERT INTO notifications (type, employee_name, message) VALUES ('late', ?, ?)`,
            args: [employee.name, `${employee.name} a pointé son ${label} à ${clockedAt} au lieu de ${start.slice(0, 5)} — ${late} min de retard`],
          });
        }
      }
    } catch { /* le pointage reste enregistré même si le contrôle du retard échoue */ }
  }

  // Pointer un jour de congé = le congé de ce jour est annulé automatiquement
  try {
    const removed = await removeLeaveDayOnPunch(db, Number(employee.id), date);
    if (removed > 0) {
      const [y, m, d] = String(date).split('-');
      await db.execute({
        sql: `INSERT INTO notifications (type, employee_name, message) VALUES ('timeclock', ?, ?)`,
        args: [employee.name, `${employee.name} a pointé le ${d}/${m}/${y} alors qu'il était en congé : ce jour a été retiré de ses congés`],
      }).catch(() => {});
    }
  } catch { /* le pointage reste enregistré même si la mise à jour du congé échoue */ }

  // Pointer un jour de repos = le jour devient travaillé, avec les heures des pointages
  try {
    const rest = await fillRestDayFromPunches(db, Number(employee.id), date);
    if (rest === 'converted') {
      const [y, m, d] = String(date).split('-');
      await db.execute({
        sql: `INSERT INTO notifications (type, employee_name, message) VALUES ('timeclock', ?, ?)`,
        args: [employee.name, `${employee.name} a pointé le ${d}/${m}/${y}, jour de repos : ce jour passe en jour travaillé au planning`],
      }).catch(() => {});
    }
  } catch { /* le pointage reste enregistré même si la mise à jour du planning échoue */ }

  return NextResponse.json(result.rows[0], { status: 201 });
}
 

