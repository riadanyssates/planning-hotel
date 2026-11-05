'use client';

// Mode d'emploi du salarié : bouton dans l'en-tête de sa page planning.
// S'ouvre tout seul à la première visite sur ce téléphone (mémorisé dans le navigateur).

import { useEffect, useState } from 'react';

const SEEN_KEY = 'planning_guide_vu';

export default function EmployeeGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch { /* navigateur sans stockage : pas d'ouverture automatique */ }
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* rien */ }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-auto flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/30 border border-white/40 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
        title="Mode d'emploi"
      >
        <span className="w-4 h-4 rounded-full bg-white text-celadon-800 grid place-items-center text-[10px] font-bold">?</span>
        <span className="hidden sm:inline">Mode d&apos;emploi</span>
        <span className="sm:hidden">Aide</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
          <div
            className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl p-5 text-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Mode d&apos;emploi</h2>
              <button onClick={close} className="text-2xl leading-none text-slate-400 hover:text-slate-600 -mt-1" aria-label="Fermer">×</button>
            </div>

            <Section title="1. Pointer chaque jour (onglet « Mon planning »)">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Arrivée</b> : en arrivant au travail.</li>
                <li><b>Départ</b> : en partant à la fin de ta journée.</li>
              </ul>
              <p className="mt-1">L&apos;heure est prise automatiquement. Un pointage ne peut pas être modifié : en cas d&apos;erreur, préviens un responsable.</p>
              <p className="mt-1">La pause déjeuner ne se pointe pas : 50 minutes de déjeuner sont retirées des journées de plus de 6 heures. Les journées plus courtes (5 heures par exemple) ne perdent rien.</p>
            </Section>

            <Section title="2. Les retards">
              <p>Si tu n&apos;as pas pointé <b>10 minutes</b> après ton heure prévue, ou si tu pointes avec 10 minutes de retard ou plus, les responsables sont prévenus.</p>
              <p className="mt-1">Touche <b>« Activer les rappels »</b> dans le bandeau jaune pour recevoir une alerte sur ton téléphone si tu oublies de pointer. Sur iPhone, ajoute d&apos;abord la page à l&apos;écran d&apos;accueil (bouton Partager ⬆️ puis « Sur l&apos;écran d&apos;accueil »).</p>
            </Section>

            <Section title="3. Voir mes heures et mes pointages">
              <p>Dans « Mon planning » : tes heures <b>de la semaine</b> et <b>du mois</b>, puis <b>« Mes pointages »</b> jour par jour, avec le temps travaillé.</p>
            </Section>

            <Section title="4. Demander un congé">
              <p>En bas de « Mon planning », touche <b>« Faire une demande de congé »</b> : choisis les dates, le type, ajoute un certificat pour un congé maladie si besoin, puis <b>« Envoyer la demande »</b>.</p>
              <p className="mt-1">La réponse apparaît dans <b>« Mes demandes »</b> : <span className="text-amber-700 font-medium">En attente</span>, <span className="text-green-700 font-medium">Approuvé</span> ou <span className="text-red-700 font-medium">Refusé</span>.</p>
            </Section>

            <Section title="5. Le planning de l'équipe">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Semaine</b> : les horaires de toute l&apos;équipe, jour par jour.</li>
                <li><b>Timeline</b> : qui travaille à quelle heure dans la journée.</li>
                <li><b>Repos</b> : les jours de repos et de congé du mois (CP = congé payé, CM = congé maladie).</li>
                <li><b>Planning</b> : le planning de la réception.</li>
              </ul>
              <p className="mt-1">Les boutons <b>Tous / Clientèle / Riad</b> filtrent par équipe.</p>
            </Section>

            <Section title="6. Garder l'appli sur mon téléphone">
              <p>Ce lien est personnel : ne le partage pas. Pour l&apos;avoir comme une appli : sur iPhone, Safari → Partager ⬆️ → « Sur l&apos;écran d&apos;accueil » ; sur Android, Chrome → menu ⋮ → « Ajouter à l&apos;écran d&apos;accueil ».</p>
            </Section>

            <button onClick={close} className="btn-primary w-full mt-2">J&apos;ai compris</button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 text-sm leading-relaxed">
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      {children}
    </div>
  );
}
