import type { Client } from '@libsql/client';
import { sendPushToManagers } from './push';

export type NotificationType = 'leave_request' | 'timeclock' | 'late';

const PUSH_TITLES: Record<NotificationType, string> = {
  leave_request: 'Demande de congé',
  late: 'Retard',
  timeclock: 'Planning',
};

/**
 * Ajoute une notification dans la cloche de l'espace manager.
 * Avec push: true, elle est aussi envoyée sur les téléphones des responsables
 * qui ont activé les notifications (les pointages ordinaires restent dans la cloche seulement).
 * Ne lève jamais d'erreur : une notification ratée ne doit pas bloquer l'action de l'employé.
 */
export async function notifyManagers(
  db: Client,
  type: NotificationType,
  employeeName: string,
  message: string,
  opts: { push?: boolean } = {},
): Promise<void> {
  try {
    await db.execute({
      sql: 'INSERT INTO notifications (type, employee_name, message) VALUES (?, ?, ?)',
      args: [type, employeeName, message],
    });
  } catch { /* la cloche est facultative */ }

  if (!opts.push) return;
  try {
    await sendPushToManagers(db, {
      title: PUSH_TITLES[type],
      body: message,
      url: '/manager/dashboard',
      tag: `mgr-${type}-${Date.now()}`,
    });
  } catch { /* l'envoi sur téléphone est facultatif */ }
}
