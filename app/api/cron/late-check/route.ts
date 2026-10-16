import { NextRequest, NextResponse } from 'next/server';
import { checkLateArrivals } from '@/lib/late-check';

export const dynamic = 'force-dynamic';

// GET /api/cron/late-check — appelé toutes les 5 minutes par le planificateur.
// Protégé par CRON_SECRET (envoyé par Vercel Cron dans l'en-tête Authorization).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const alerts = await checkLateArrivals();
  return NextResponse.json({ ok: true, alerts });
}
