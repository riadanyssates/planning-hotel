import { format } from 'date-fns';
import { getDb } from './db';
import { getWeekSchedules } from './schedule';
import { moroccoNow } from './morocco-time';
import { sendPushToEmployee } from './push';
import type { Employee } from '@/types';

// Rappel envoyé quand l'arrivée n'est pas pointée LATE_AFTER_MIN minutes après l'heure prévue.
// Au-delà de LATE_WINDOW_MIN, on n'envoie plus rien (évite des rappels tardifs si la vérification a sauté).
export const LATE_AFTER_MIN = 10;
const LATE_WINDOW_MIN = 120;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface LateAlert {
  employee: string;
  type: 'arrival' | 'arrival2';
  scheduled: string;
  pushed: number;
}

// Idempotent : un seul rappel par employé, par jour et par prise de poste (table late_alerts).
export async function checkLateArrivals(): Promise<LateAlert[]> {
  const db = await getDb();
  const now = moroccoNow();
  const today = format(now, 'yyyy-MM-dd');
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const empRes = await db.execute({
    sql: `SELECT * FROM employees
          WHERE (contract_start IS NULL OR contract_start = '' OR contract_start <= ?)
            AND (contract_end IS NULL OR contract_end = '' OR contract_end >= ?)`,
    args: [today, today],
  });
  const employees = empRes.rows as unknown as Employee[];
  if (!employees.length) return [];

  const weeks = await getWeekSchedules(new Date(today + 'T00:00:00'), employees);
  const punchRes = await db.execute({
    sql: `SELECT employee_id, type FROM timeclock WHERE date = ?`,
    args: [today],
  });
  const punched = new Set(punchRes.rows.map(r => `${r.employee_id}-${r.type}`));

  const alerts: LateAlert[] = [];
  for (const { employee, days } of weeks) {
    const day = days[today];
    if (!day || day.is_off || day.is_leave) continue;

    const starts: [LateAlert['type'], string | null][] = [
      ['arrival', day.start_time],
      ['arrival2', day.start_time2],
    ];
    for (const [type, start] of starts) {
      if (!start) continue;
      const late = nowMin - toMinutes(start);
      if (late < LATE_AFTER_MIN || late > LATE_WINDOW_MIN) continue;
      if (punched.has(`${employee.id}-${type}`)) continue;

      const claim = await db.execute({
        sql: 'INSERT OR IGNORE INTO late_alerts (employee_id, date, type) VALUES (?, ?, ?)',
        args: [employee.id, today, type],
      });
      if (claim.rowsAffected === 0) continue; // déjà prévenu

      const label = type === 'arrival' ? 'prise de poste' : 'retour de pause';
      const pushed = await sendPushToEmployee(db, employee.id, {
        title: 'Vous êtes en retard',
        body: `Votre ${label} était prévue à ${start}. Pensez à pointer votre arrivée.`,
        url: `/planning/${employee.access_token}`,
        tag: `late-${today}-${type}`,
      });
      await db.execute({
        sql: `INSERT INTO notifications (type, employee_name, message) VALUES ('late', ?, ?)`,
        args: [
          employee.name,
          `${employee.name} n'a pas pointé (${label} prévue à ${start})` +
            (pushed ? ' — rappel envoyé sur son téléphone' : ' — notifications non activées sur son téléphone'),
        ],
      });
      alerts.push({ employee: employee.name, type, scheduled: start, pushed });
    }
  }
  return alerts;
}
