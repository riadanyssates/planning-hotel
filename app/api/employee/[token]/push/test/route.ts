import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sendPushToEmployee } from '@/lib/push';

type Ctx = { params: Promise<{ token: string }> };

// POST /api/employee/[token]/push/test — envoie une notification d'essai sur les appareils de l'employé
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const db = await getDb();
  const res = await db.execute({ sql: 'SELECT id FROM employees WHERE access_token = ?', args: [token] });
  if (!res.rows.length) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const sent = await sendPushToEmployee(db, Number(res.rows[0].id), {
    title: 'Riad Anyssates',
    body: 'Les rappels de retard sont bien activés sur ce téléphone.',
    url: `/planning/${token}`,
    tag: 'test',
  });
  return NextResponse.json({ sent });
}
