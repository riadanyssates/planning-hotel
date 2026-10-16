import webpush from 'web-push';
import type { Client } from '@libsql/client';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;

export function pushConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://planning-hotel.vercel.app', publicKey, privateKey);
  configured = true;
  return true;
}

// Envoie une notification sur tous les appareils abonnés d'un employé.
// Les abonnements expirés (404/410) sont supprimés. Renvoie le nombre d'envois réussis.
export async function sendPushToEmployee(db: Client, employeeId: number, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await db.execute({
    sql: 'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE employee_id = ?',
    args: [employeeId],
  });
  let sent = 0;
  for (const s of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: 'high' }
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE id = ?', args: [s.id] });
      } else {
        console.error('push error:', status, e);
      }
    }
  }
  return sent;
}
