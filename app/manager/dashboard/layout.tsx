import Link from 'next/link';
import Image from 'next/image';
import { getManagerSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import NotificationBell from '@/components/NotificationBell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getManagerSession();
  if (!session) redirect('/manager');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-celadon-500 text-white shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4">
          {/* Ligne 1 : logo + nav (desktop) + actions */}
          <div className="h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <div className="flex items-center gap-2 font-semibold text-white select-none shrink-0">
                <Image src="/logo-riad.png" alt="Riad Anyssates" width={28} height={28} className="object-contain" style={{ filter: 'brightness(0) saturate(100%) invert(22%) sepia(24%) saturate(609%) hue-rotate(122deg) brightness(88%) contrast(92%)' }} />
                Riad Anyssates
              </div>
              <nav className="hidden sm:flex items-center gap-1">
                <Link href="/manager/dashboard" className="px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-celadon-600 transition-colors">
                  Calendrier
                </Link>
                <Link href="/manager/dashboard/employes" className="px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-celadon-600 transition-colors">
                  Employés
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <NotificationBell />
              <LogoutButton />
            </div>
          </div>
          {/* Ligne 2 : nav mobile uniquement */}
          <nav className="flex sm:hidden items-center gap-1 pb-1.5">
            <Link href="/manager/dashboard" className="px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-celadon-600 transition-colors">
              Calendrier
            </Link>
            <Link href="/manager/dashboard/employes" className="px-3 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-celadon-600 transition-colors">
              Employés
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
