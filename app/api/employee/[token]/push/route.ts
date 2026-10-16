import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

type Ctx = { params: Promise<{ token: string }> };

async function resolveEmployeeId(token: string): Promise<number | null> {
  const db = await getDb();
  const res = await db.execute({ sql: 'SELECT id FROM employees WHERE access_token = ?', args: [token] });
  return res.rows.length ? Number(res.rows[0].id) : null;
}

// GET /api/employee/[token]/push — clé publique VAPID + nombre d'appareils abonnés
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employeeId = await resolveEmployeeId(token);
  if (!employeeId) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT count(*) AS n FROM push_subscriptions WHERE employee_id = ?',
    args: [employeeId],
  });
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    devices: Number(res.rows[0].n),
  });
}

// POST /api/employee/[token]/push  { endpoint, keys: { p256dh, auth } } — abonne cet appareil
export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employeeId = await resolveEmployeeId(token);
  if (!employeeId) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const sub = await req.json() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 });
  }

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO push_subscriptions (employee_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET employee_id = excluded.employee_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    args: [employeeId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/employee/[token]/push  { endpoint } — désabonne cet appareil
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employeeId = await resolveEmployeeId(token);
  if (!employeeId) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  const { endpoint } = await req.json() as { endpoint?: string };
  if (endpoint) {
    const db = await getDb();
    await db.execute({
      sql: 'DELETE FROM push_subscriptions WHERE employee_id = ? AND endpoint = ?',
      args: [employeeId, endpoint],
    });
  }
  return NextResponse.json({ ok: true });
}
