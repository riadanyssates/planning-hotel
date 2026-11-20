import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getManagerSession } from '@/lib/auth';

// GET /api/manager/push?endpoint=… — clé publique VAPID + cet appareil est-il abonné ?
export async function GET(req: NextRequest) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const endpoint = new URL(req.url).searchParams.get('endpoint');
  let subscribed = false;
  if (endpoint) {
    const db = await getDb();
    const res = await db.execute({ sql: 'SELECT 1 FROM manager_push_subscriptions WHERE endpoint = ?', args: [endpoint] });
    subscribed = res.rows.length > 0;
  }
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, subscribed });
}

// POST /api/manager/push  { endpoint, keys: { p256dh, auth } } — abonne ce téléphone aux alertes manager
export async function POST(req: NextRequest) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const sub = await req.json() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 });
  }

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO manager_push_subscriptions (endpoint, p256dh, auth, account) VALUES (?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, account = excluded.account`,
    args: [sub.endpoint, sub.keys.p256dh, sub.keys.auth, session.employeeToken ?? session.role],
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/manager/push  { endpoint } — ce téléphone ne reçoit plus les alertes manager
export async function DELETE(req: NextRequest) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { endpoint } = await req.json() as { endpoint?: string };
  if (endpoint) {
    const db = await getDb();
    await db.execute({ sql: 'DELETE FROM manager_push_subscriptions WHERE endpoint = ?', args: [endpoint] });
  }
  return NextResponse.json({ ok: true });
}
