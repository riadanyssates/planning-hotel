'use client';

import { useState, useEffect, FormEvent } from 'react';
import type { Employee, EmployeeRole } from '@/types';
import { EMPLOYEE_COLORS, DEPARTMENTS } from '@/types';
import TemplateEditor from './TemplateEditor';
import clsx from 'clsx';

export default function EmployeesManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(EMPLOYEE_COLORS[0]);
  const [department, setDepartment] = useState<string>(DEPARTMENTS[0]);
  const [role, setRole] = useState<EmployeeRole>('employee');
  const [hidden, setHidden] = useState(false); // « Ne pas afficher dans le planning »
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedToken, setCopiedToken] = useState<number | null>(null);

  async function fetchEmployees() {
    const res = await fetch('/api/employes');
    if (res.ok) setEmployees(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchEmployees(); }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  function isActive(emp: Employee) {
    return !emp.contract_end || emp.contract_end >= todayStr;
  }

  function openAdd() {
    setEditingEmployee(null);
    setName('');
    setColor(EMPLOYEE_COLORS[employees.length % EMPLOYEE_COLORS.length]);
    setDepartment(DEPARTMENTS[0]);
    setRole('employee');
    setHidden(false);
    setContractStart('');
    setContractEnd('');
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditingEmployee(emp);
    setName(emp.name);
    setColor(emp.color);
    setDepartment(emp.department || DEPARTMENTS[0]);
    setRole((emp.role || 'employee') as EmployeeRole);
    setHidden(!!emp.hide_in_planning);
    setContractStart(emp.contract_start || '');
    setContractEnd(emp.contract_end || '');
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = { name, color, department, role, contract_start: contractStart || null, contract_end: contractEnd || null, hide_in_planning: hidden };
    if (editingEmployee) {
      await fetch(`/api/employes/${editingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/employes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setShowForm(false);
    fetchEmployees();
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Supprimer ${emp.name} ? Tous ses plannings seront effacés.`)) return;
    await fetch(`/api/employes/${emp.id}`, { method: 'DELETE' });
    if (selectedEmployee?.id === emp.id) setSelectedEmployee(null);
    fetchEmployees();
  }

  function copyLink(emp: Employee) {
    const url = `${window.location.origin}/planning/${emp.access_token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(emp.id);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="p-4 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Employés</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(v => !v)}
            className={clsx('text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
              showInactive ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            )}
          >
            {showInactive ? 'Masquer anciens' : 'Voir anciens employés'}
          </button>
          <button onClick={openAdd} className="btn-primary text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Employee list */}
        <div className="card divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">Chargement...</div>
          ) : employees.filter(e => showInactive || isActive(e)).length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              {employees.length === 0 ? 'Aucun employé. Ajoutez le premier !' : 'Aucun employé actif.'}
            </div>
          ) : (
            employees.filter(e => showInactive || isActive(e)).map((emp) => (
              <div
                key={emp.id}
                className={clsx(
                  'p-4 flex items-center gap-3',
                  selectedEmployee?.id === emp.id && 'bg-celadon-50'
                )}
              >
                <span
                  className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-slate-800 font-semibold text-sm shadow-sm"
                  style={{ backgroundColor: emp.color }}
                >
                  {emp.name[0].toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{emp.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={clsx(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                      emp.department === 'Gestion Riad'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-celadon-100 text-celadon-700'
                    )}>
                      {emp.department === 'Gestion Riad' ? 'Riad' : 'Clientèle'}
                    </span>
                    {emp.role === 'admin' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Admin</span>
                    )}
                    {!!emp.hide_in_planning && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 whitespace-nowrap">Hors planning</span>
                    )}
                    <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      isActive(emp) ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {isActive(emp) ? 'Actif' : 'Inactif'}
                    </span>
                    <span className="text-xs text-slate-400 truncate">/planning/{emp.access_token.slice(0, 8)}…</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setSelectedEmployee(selectedEmployee?.id === emp.id ? null : emp)}
                    title="Modifier le planning type"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-celadon-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => copyLink(emp)}
                    title="Copier le lien"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-green-600 transition-colors"
                  >
                    {copiedToken === emp.id ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(emp)}
                    title="Modifier"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(emp)}
                    title="Supprimer"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Template editor */}
        {selectedEmployee ? (
          <TemplateEditor employee={selectedEmployee} />
        ) : (
          <div className="card p-6 flex flex-col items-center justify-center text-center text-slate-400 min-h-[200px]">
            <svg className="w-10 h-10 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Sélectionnez un employé pour modifier<br/>son planning type (récurrent)</p>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-5 shadow-xl">
            <h2 className="font-semibold text-slate-900 mb-4">
              {editingEmployee ? 'Modifier' : 'Nouvel employé'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Prénom Nom"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Département</label>
                <div className="flex gap-2">
                  {DEPARTMENTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDepartment(d)}
                      className={clsx(
                        'flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors',
                        department === d
                          ? d === 'Gestion Riad'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-celadon-500 text-white border-celadon-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Couleur</label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYEE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={clsx(
                        'w-8 h-8 rounded-full transition-all',
                        color === c ? 'ring-2 ring-offset-2 ring-celadon-500 scale-110' : 'hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Contract dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date d'entrée</label>
                  <input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date de sortie</label>
                  <input type="date" value={contractEnd} min={contractStart || undefined} onChange={e => setContractEnd(e.target.value)} className="input-field text-sm" />
                </div>
              </div>
              {contractEnd && contractEnd < todayStr && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                  Cet employé sera marqué "Inactif" et n'apparaîtra plus dans les plannings futurs.
                </p>
              )}

              {/* Role toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-slate-700">Accès administrateur</div>
                  <div className="text-xs text-slate-400 mt-0.5">Accès complet via lien personnel</div>
                </div>
                <button
                  type="button"
                  onClick={() => setRole(r => r === 'admin' ? 'employee' : 'admin')}
                  className={clsx(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
                    role === 'admin' ? 'bg-amber-500' : 'bg-slate-300'
                  )}
                >
                  <span className={clsx(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow',
                    role === 'admin' ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>

              {/* Hors planning */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-slate-700">Ne pas afficher dans le planning</div>
                  <div className="text-xs text-slate-400 mt-0.5">N&apos;apparaît ni dans Semaine, Timeline ou Repos, pour personne</div>
                </div>
                <button
                  type="button"
                  aria-pressed={hidden}
                  aria-label="Ne pas afficher dans le planning"
                  onClick={() => setHidden(h => !h)}
                  className={clsx(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
                    hidden ? 'bg-slate-600' : 'bg-slate-300'
                  )}
                >
                  <span className={clsx(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow',
                    hidden ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? '...' : editingEmployee ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
