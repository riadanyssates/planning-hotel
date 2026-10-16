'use client';

// TEMPORAIRE — bouton de copie vers la nouvelle base. À supprimer après la bascule.
import { useState } from 'react';

interface Result {
  copied?: boolean;
  rows?: { table: string; old: number | null; new: number | null; match: boolean }[];
  allMatch?: boolean;
  error?: string;
}

export default function DbMigrationPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run(copy: boolean) {
    if (copy && !confirm('Copier toutes les données vers la nouvelle base ? (le contenu de la nouvelle base sera remplacé)')) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/migrate-db', { method: copy ? 'POST' : 'GET' });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 pt-4">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-amber-900">Migration de la base de données</span>
          <button
            onClick={() => run(true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? 'En cours…' : 'Copier les données vers la nouvelle base'}
          </button>
          <button
            onClick={() => run(false)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-amber-400 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Comparer seulement
          </button>
        </div>

        {result?.error && <p className="mt-3 text-red-700">Erreur : {result.error}</p>}

        {result?.rows && (
          <div className="mt-3">
            <p className={result.allMatch ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
              {result.copied ? 'Copie terminée. ' : ''}
              {result.allMatch ? 'Les deux bases ont le même nombre de lignes partout.' : 'Des tables ne correspondent pas.'}
            </p>
            <table className="mt-2 text-left">
              <thead>
                <tr className="text-amber-900">
                  <th className="pr-6 py-1">Table</th>
                  <th className="pr-6 py-1 text-right">Ancienne base</th>
                  <th className="pr-6 py-1 text-right">Nouvelle base</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(r => (
                  <tr key={r.table}>
                    <td className="pr-6 py-0.5 font-mono">{r.table}</td>
                    <td className="pr-6 py-0.5 text-right">{r.old ?? '—'}</td>
                    <td className="pr-6 py-0.5 text-right">{r.new ?? '—'}</td>
                    <td className="py-0.5">{r.match ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
