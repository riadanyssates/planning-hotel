import type { Client } from '@libsql/client';

function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/**
 * Un employé qui pointe un jour où il est en congé (payé ou maladie) travaille ce jour-là :
 * on retire ce jour de son congé.
 *   - congé d'un seul jour            → supprimé
 *   - premier / dernier jour du congé → la période est raccourcie
 *   - jour au milieu du congé         → la période est coupée en deux
 * Renvoie le nombre de congés modifiés (0 si l'employé n'était pas en congé).
 */
export async function removeLeaveDayOnPunch(db: Client, employeeId: number, date: string): Promise<number> {
  const res = await db.execute({
    sql: 'SELECT * FROM paid_leaves WHERE employee_id = ? AND start_date <= ? AND end_date >= ?',
    args: [employeeId, date, date],
  });

  for (const row of res.rows) {
    const id = Number(row.id);
    const start = String(row.start_date);
    const end = String(row.end_date);

    if (start === date && end === date) {
      await db.execute({ sql: 'DELETE FROM paid_leaves WHERE id = ?', args: [id] });
    } else if (start === date) {
      await db.execute({ sql: 'UPDATE paid_leaves SET start_date = ? WHERE id = ?', args: [shiftDay(date, 1), id] });
    } else if (end === date) {
      await db.execute({ sql: 'UPDATE paid_leaves SET end_date = ? WHERE id = ?', args: [shiftDay(date, -1), id] });
    } else {
      await db.batch([
        { sql: 'UPDATE paid_leaves SET end_date = ? WHERE id = ?', args: [shiftDay(date, -1), id] },
        {
          sql: 'INSERT INTO paid_leaves (employee_id, start_date, end_date, leave_type, note) VALUES (?, ?, ?, ?, ?)',
          args: [employeeId, shiftDay(date, 1), end, row.leave_type ?? 'cp', row.note ?? null],
        },
      ], 'write');
    }
  }
  return res.rows.length;
}

export const REST_DAY_PUNCH_NOTE = 'Travaillé sur un jour de repos (horaires des pointages)';

/**
 * Un employé qui pointe un jour de repos travaille ce jour-là : le planning de ce jour
 * reprend ses heures réelles de pointage, et se complète à chaque nouveau pointage.
 * À appeler APRÈS removeLeaveDayOnPunch (un jour de congé retiré peut être un jour de repos).
 * Renvoie 'converted' la première fois que le jour de repos devient travaillé,
 * 'updated' quand les horaires sont complétés, null si le jour était déjà prévu travaillé.
 */
export async function fillRestDayFromPunches(
  db: Client, employeeId: number, date: string,
): Promise<'converted' | 'updated' | null> {
  const [excRes, tplRes, punchRes] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM schedule_exceptions WHERE employee_id = ? AND date = ?', args: [employeeId, date] }),
    db.execute({
      sql: 'SELECT start_time FROM schedule_templates WHERE employee_id = ? AND day_of_week = ?',
      args: [employeeId, (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7],
    }),
    db.execute({ sql: 'SELECT type, clocked_at FROM timeclock WHERE employee_id = ? AND date = ?', args: [employeeId, date] }),
  ]);

  const exc = excRes.rows[0];
  const alreadyConverted = !!exc && exc.note === REST_DAY_PUNCH_NOTE;
  const isRestDay = exc ? !exc.start_time : !tplRes.rows[0]?.start_time;
  if (!alreadyConverted && !isRestDay) return null;

  const p: Record<string, string> = {};
  for (const r of punchRes.rows) p[String(r.type)] = String(r.clocked_at);
  if (!p.arrival) return null;

  // Une seule plage arrivée → départ (la pause déjeuner ne se pointe plus)
  const [s1, e1, s2, e2] = [p.arrival, p.departure2 ?? p.departure ?? null, null, null];

  await db.execute({
    sql: `INSERT INTO schedule_exceptions (employee_id, date, start_time, end_time, start_time2, end_time2, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(employee_id, date) DO UPDATE SET
            start_time = excluded.start_time, end_time = excluded.end_time,
            start_time2 = excluded.start_time2, end_time2 = excluded.end_time2, note = excluded.note`,
    args: [employeeId, date, s1, e1, s2, e2, REST_DAY_PUNCH_NOTE],
  });
  return alreadyConverted ? 'updated' : 'converted';
}
