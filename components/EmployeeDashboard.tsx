'use client';

import { useState, useEffect } from 'react';
import WeekCalendar from './WeekCalendar';
import DayTimeline from './DayTimeline';
import RestDaysCalendar from './RestDaysCalendar';
import EmployeePlanning from './EmployeePlanning';
import ReceptionPlanning from './ReceptionPlanning';
import LateAlertsSetup from './LateAlertsSetup';
import type { Employee } from '@/types';
import clsx from 'clsx';
import { moroccoNow } from '@/lib/morocco-time';

type EmpView = 'week' | 'day' | 'rest' | 'myplan' | 'planning';

const DEPT_TABS = [
  { value: '', label: 'Tous' },
  { value: 'Gestion Clientèle', label: 'Clientèle' },
  { value: 'Gestion Riad', label: 'Riad' },
] as const;

export default function EmployeeDashboard({ token }: { token: string }) {
  const [view, setView] = useState<EmpView>('week');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [department, setDepartment] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const now = moroccoNow();
    fetch(`/api/employee/${token}?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then(r => {
        if (!r.ok) { setLoadError(true); return null; }
        return r.json();
      })
      .then(d => d && setEmployee(d.employee))
      .catch(() => setLoadError(true));
  }, [token]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="card p-6 text-center max-w-sm">
          <div className="text-red-500 text-lg mb-2">Lien invalide</div>
          <p className="text-slate-500 text-sm">Ce lien de planning n'existe pas ou a expiré.</p>
        </div>
      </div>
    );
  }

  const showDeptBar = view !== 'myplan' && view !== 'planning';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* Header */}
      <header className="bg-celadon-500 text-white shadow-lg flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-riad.png" alt="Riad Anyssates" className="w-7 h-7 object-contain flex-shrink-0" style={{ filter: 'brightness(0) saturate(100%) invert(22%) sepia(24%) saturate(609%) hue-rotate(122deg) brightness(88%) contrast(92%)' }} />
          <span className="font-semibold text-white">Riad Anyssates</span>
          {employee && (
            <>
              <span className="text-slate-600 mx-1">·</span>
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-800 text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: employee.color }}
              >
                {employee.name[0].toUpperCase()}
              </span>
              <span className="text-sm text-slate-300">{employee.name}</span>
            </>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-slate-200 bg-white px-4 flex-shrink-0">
        <div className="flex gap-1 max-w-screen-xl mx-auto overflow-x-auto">
          <Tab label="Semaine"      icon={<WeekIcon />}       active={view === 'week'}      onClick={() => setView('week')} />
          <Tab label="Timeline"     icon={<DayIcon />}        active={view === 'day'}       onClick={() => setView('day')} />
          <Tab label="Repos"        icon={<RestIcon />}       active={view === 'rest'}      onClick={() => setView('rest')} />
          <Tab label="Planning"     icon={<ReceptionIcon />}  active={view === 'planning'} onClick={() => setView('planning')} />
          <Tab label="Mon planning" icon={<UserIcon />}       active={view === 'myplan'}    onClick={() => setView('myplan')} />
        </div>
      </div>

      {/* Department filter (for team views) */}
      {showDeptBar && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 flex-shrink-0">
          <div className="flex items-center gap-2 max-w-screen-xl mx-auto py-2">
            <span className="text-xs text-slate-400 font-medium mr-1 hidden sm:block">Département :</span>
            {DEPT_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setDepartment(tab.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                  department === tab.value
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1">
        <LateAlertsSetup token={token} />
        {view === 'week'      && <WeekCalendar    readOnly fetchToken={token} department={department || undefined} />}
        {view === 'day'       && <DayTimeline              fetchToken={token} department={department || undefined} />}
        {view === 'rest'      && <RestDaysCalendar         fetchToken={token} department={department || undefined} />}
        {view === 'planning' && <ReceptionPlanning readOnly />}
        {view === 'myplan'    && <EmployeePlanning token={token} embedded />}
      </div>
    </div>
  );
}

function Tab({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        active
          ? 'border-taupe text-taupe'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function WeekIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RestIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function ReceptionIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
