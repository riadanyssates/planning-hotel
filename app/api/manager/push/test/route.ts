import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getDb } from '@/lib/db';
import { getManagerSession } from '@/lib/auth';
import { pushConfigured } from '@/lib/push';

// POST /api/manager/push/test  { endpoint } — notification d'essai sur ce téléphone uniquement
export async function POST(req: NextRequest) {
  const session = await getManagerSession();
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ sent: 0 });

  const { endpoint } = await req.json() as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ sent: 0 });

  const db = await getDb();
  const res = await db.execute({
    sql: 'SELECT endpoint, p256dh, auth FROM manager_push_subscriptions WHERE endpoint = ?',
    args: [endpoint],
  });
  const s = res.rows[0];
  if (!s) return NextResponse.json({ sent: 0 });
  try {
    await webpush.sendNotification(
      { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
      JSON.stringify({
        title: 'Riad Anyssates',
        body: 'Les notifications du planning sont bien activées sur ce téléphone.',
        url: '/manager/dashboard',
        tag: 'mgr-test',
      }),
      { TTL: 60 * 60 },
    );
    return NextResponse.json({ sent: 1 });
  } catch {
    return NextResponse.json({ sent: 0 });
  }
}
