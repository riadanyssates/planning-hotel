'use client';

// Changer ponctuellement la journée d'un employé depuis « Jours de repos » :
// travail, repos, congé payé, congé maladie ou autre absence (avec un motif).
// - Travail / Repos / Autre : exception du jour (schedule_exceptions)
// - CP / CM : congé d'un jour (paid_leaves) ; si le jour fait partie d'un congé
//   plus long, ce congé est découpé pour retirer seulement ce jour.

import { useEffect, useState } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Employee, DaySchedule, PaidLeave } from '@/types';

type Choice = 'work' | 'rest' | 'cp' | 'cm' | 'other';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`);
}

const shift = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd');

function currentChoice(day: DaySchedule | undefined): Choice {
  if (day?.is_leave) return day.leave_type === 'cm' ? 'cm' : 'cp';
  if (!day || day.is_off) return day?.is_exception && day.note ? 'other' : 'rest';
  return 'work';
}

interface Props {
  employee: Employee;
  date: string;
  day: DaySchedule | undefined;
  onClose: (changed: boolean) => void;
}

export default function DayStatusModal({ employee, date, day, onClose }: Props) {
  const initial = currentChoice(day);
  const [choice, setChoice] = useState<Choice>(initial);
  const [start, setStart] = useState(day?.start_time?.slice(0, 5) || '09:00');
  const [end, setEnd] = useState(day?.end_time?.slice(0, 5) || '17:00');
  const [motif, setMotif] = useState(initial === 'other' ? day?.note || '' : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [leave, setLeave] = useState<PaidLeave | null>(null);

  // congé qui couvre ce jour (pour pouvoir le retirer ou le remplacer)
  useEffect(() => {
    if (!day?.is_leave) return;
    fetch(`/api/planning/leaves?employeeId=${employee.id}`)
      .then(r => (r.ok ? r.json() : []))
      .then((all: PaidLeave[]) => setLeave(all.find(l => l.start_date <= date && date <= l.end_date) || null))
      .catch(() => {});
  }, [day?.is_leave, employee.id, date]);

  const label = format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr });

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(String(r.status));
  }

  // retire ce seul jour du congé qui le couvre (découpe le congé si besoin)
  async function removeDayFromLeave(l: PaidLeave) {
    const s = l.start_date, e = l.end_date;
    const base = { id: l.id, leaveType: l.leave_type, note: l.note };
    if (s === date && e === date) return call(`/api/planning/leaves?id=${l.id}`, 'DELETE');
    if (s === date) return call('/api/planning/leaves', 'PATCH', { ...base, startDate: shift(date, 1), endDate: e });
    if (e === date) return call('/api/planning/leaves', 'PATCH', { ...base, startDate: s, endDate: shift(date, -1) });
    await call('/api/planning/leaves', 'PATCH', { ...base, startDate: s, endDate: shift(date, -1) });
    await call('/api/planning/leaves', 'POST', { employeeId: employee.id, startDate: shift(date, 1), endDate: e, leaveType: l.leave_type, note: l.note });
  }

  async function save() {
    if (choice === 'other' && !motif.trim()) { setError('Écris le motif (ex. : formation, absence…).'); return; }
    if (day?.is_leave && !leave) { setError('Congé introuvable, recharge la page et réessaie.'); return; }
    setSaving(true); setError('');
    try {
      const sameLeave = day?.is_leave && (choice === 'cp' || choice === 'cm') && (day.leave_type === 'cm' ? 'cm' : 'cp') === choice;
      if (day?.is_leave && leave && !sameLeave) await removeDayFromLeave(leave);

      if (choice === 'cp' || choice === 'cm') {
        if (!sameLeave) {
          await call('/api/planning/leaves', 'POST', { employeeId: employee.id, startDate: date, endDate: date, leaveType: choice, note: 'Ponctuel' });
        }
      } else {
        await call('/api/planning/exceptions', 'PUT', {
          employeeId: employee.id,
          date,
          startTime: choice === 'work' ? start : null,
          endTime: choice === 'work' ? end : null,
          startTime2: null,
          endTime2: null,
          note: choice === 'other' ? motif.trim() : null,
        });
      }
      onClose(true);
    } catch {
      setError("Pas enregistré. Vérifie la connexion et réessaie.");
      setSaving(false);
    }
  }

  // revenir au planning habituel : enlève le changement ponctuel (et le congé de ce jour)
  async function backToUsual() {
    setSaving(true); setError('');
    try {
      if (day?.is_leave && leave) await removeDayFromLeave(leave);
      await call(`/api/planning/exceptions?employeeId=${employee.id}&date=${date}`, 'DELETE');
      onClose(true);
    } catch {
      setError("Pas enregistré. Vérifie la connexion et réessaie.");
      setSaving(false);
    }
  }

  const options: { v: Choice; l: string; cls: string }[] = [
    { v: 'work', l: 'Travail', cls: 'border-slate-300' },
    { v: 'rest', l: 'Repos', cls: 'border-sky-300' },
    { v: 'cp', l: 'Congé payé (CP)', cls: 'border-green-300' },
    { v: 'cm', l: 'Congé maladie (CM)', cls: 'border-orange-300' },
    { v: 'other', l: 'Autre', cls: 'border-violet-300' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-800">{employee.name}</h3>
        <p className="text-sm text-slate-500 capitalize mb-4">{label}</p>

        <div className="grid grid-cols-2 gap-2">
          {options.map(o => (
            <button key={o.v} type="button" onClick={() => setChoice(o.v)}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-medium text-left ${o.cls} ${choice === o.v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700'}`}>
              {o.l}
            </button>
          ))}
        </div>

        {choice === 'work' && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-slate-500">De</span>
            <select value={start} onChange={e => setStart(e.target.value)} className="border rounded px-2 py-1">{TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}</select>
            <span className="text-slate-500">à</span>
            <select value={end} onChange={e => setEnd(e.target.value)} className="border rounded px-2 py-1">{TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}</select>
          </div>
        )}
        {choice === 'other' && (
          <input value={motif} onChange={e => setMotif(e.target.value)} maxLength={60} autoFocus
            placeholder="Motif (ex. : formation, absence, récupération…)"
            className="mt-4 w-full border rounded-lg px-3 py-2 text-sm" />
        )}
        {day?.is_leave && leave && (
          <p className="mt-3 text-xs text-slate-500">
            Ce jour fait partie d&apos;un congé du {format(parseISO(leave.start_date), 'd MMM', { locale: fr })} au {format(parseISO(leave.end_date), 'd MMM', { locale: fr })} : seul ce jour sera modifié.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={save} disabled={saving} className="btn-primary w-full">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          {(day?.is_exception || day?.is_leave) && (
            <button type="button" onClick={backToUsual} disabled={saving} className="btn-secondary w-full text-sm">Revenir au planning habituel</button>
          )}
          <button type="button" onClick={() => onClose(false)} disabled={saving} className="text-sm text-slate-500 py-1">Annuler</button>
        </div>
      </div>
    </div>
  );
}
