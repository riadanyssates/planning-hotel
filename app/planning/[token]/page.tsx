import { getDb } from '@/lib/db';
import EmployeeDashboard from '@/components/EmployeeDashboard';
import AdminLoginRedirect from '@/components/AdminLoginRedirect';
import type { Metadata } from 'next';

// Manifeste par employé : « Ajouter à l'écran d'accueil » ouvre son planning (requis pour les notifications sur iPhone)
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/api/employee/${token}/manifest`,
    appleWebApp: { capable: true, title: 'Anyssates', statusBarStyle: 'default' },
  };
}

export default async function PlanningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const db = await getDb();
  const empRes = await db.execute({
    sql: "SELECT role FROM employees WHERE access_token = ?",
    args: [token],
  });

  // Admin employee → auto-login then redirect to full dashboard
  if (empRes.rows.length > 0 && empRes.rows[0].role === 'admin') {
    return <AdminLoginRedirect token={token} />;
  }

  return <EmployeeDashboard token={token} />;
}
