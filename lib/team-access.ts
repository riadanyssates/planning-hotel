import type { NextRequest } from 'next/server';
import { getDb } from './db';
import { getManagerSession } from './auth';

// Accès aux vues d'équipe (Semaine, Timeline, Repos, pointages de l'équipe) :
// session responsable, ou lien personnel d'un employé (?employeeToken=…). null = pas d'accès.
export async function teamAccess(req: NextRequest): Promise<{ manager: boolean } | null> {
  const session = await getManagerSession();
  if (session) return { manager: true };
  const empToken = new URL(req.url).searchParams.get('employeeToken');
  if (!empToken) return null;
  const db = await getDb();
  const r = await db.execute({ sql: 'SELECT id FROM employees WHERE access_token = ?', args: [empToken] });
  return r.rows.length > 0 ? { manager: false } : null;
}

// Condition SQL : retire des vues d'équipe les personnes cochées « Ne pas afficher dans le planning »
export function hiddenFromPlanningSql(alias = ''): string {
  const col = alias ? `${alias}.hide_in_planning` : 'hide_in_planning';
  return ` AND COALESCE(${col}, 0) = 0`;
}
