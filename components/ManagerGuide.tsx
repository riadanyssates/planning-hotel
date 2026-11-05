'use client';

// Mode d'emploi des responsables : bouton dans l'en-tête du tableau de bord manager.
// S'ouvre tout seul à la première visite sur cet appareil (mémorisé dans le navigateur).

import { useEffect, useState } from 'react';

const SEEN_KEY = 'planning_guide_manager_vu';

export default function ManagerGuide() {
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
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-white/80 hover:text-white hover:bg-celadon-600 transition-colors whitespace-nowrap"
        title="Mode d'emploi"
      >
        <span className="w-4 h-4 rounded-full bg-white text-celadon-800 grid place-items-center text-[10px] font-bold">?</span>
        <span className="hidden sm:inline">Mode d&apos;emploi</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={close}>
          <div
            className="bg-white w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl p-5 text-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Mode d&apos;emploi — responsables</h2>
              <button onClick={close} className="text-2xl leading-none text-slate-400 hover:text-slate-600 -mt-1" aria-label="Fermer">×</button>
            </div>

            <Section title="1. Les employés (menu « Employés »)">
              <ul className="list-disc pl-5 space-y-1">
                <li>Ajouter un employé : nom, département (Clientèle ou Riad), couleur, dates d&apos;entrée et de sortie.</li>
                <li>Cliquer sur un employé pour régler son <b>planning type</b> : les horaires habituels de chaque jour de la semaine.</li>
                <li>Bouton <b>« Copier le lien »</b> : c&apos;est le lien personnel à envoyer à l&apos;employé (son planning et ses pointages). Il ne faut pas le partager à quelqu&apos;un d&apos;autre.</li>
                <li><b>Accès administrateur</b> : donne à cet employé l&apos;accès complet, comme un responsable, par son lien.</li>
                <li><b>Ne pas afficher dans le planning</b> : la personne n&apos;apparaît plus dans Semaine, Timeline et Repos (ni pour les employés, ni pour les responsables). Pratique pour quelqu&apos;un qui n&apos;a pas d&apos;horaires.</li>
              </ul>
            </Section>

            <Section title="2. Changer une journée ponctuellement">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Jours de repos</b> : cliquer sur une case (une personne, un jour) et choisir Travail (avec les horaires), Repos, Congé payé, Congé maladie ou Autre (avec un motif). <b>« Revenir au planning habituel »</b> annule.</li>
                <li><b>Vue semaine</b> : cliquer sur une case pour changer les horaires de ce jour seulement, ou le planning type de ce jour de la semaine.</li>
              </ul>
            </Section>

            <Section title="3. Congés et demandes">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Congés</b> : ajouter une période de congé payé (CP) ou maladie (CM) pour un employé, du … au …</li>
                <li><b>Demandes</b> : les demandes envoyées par les employés. Approuver, ou refuser avec une raison. Le certificat médical est joint pour un CM.</li>
              </ul>
            </Section>

            <Section title="4. Pointages et retards">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Pointages</b> : les 2 pointages du jour (arrivée et départ), le prévu, le temps travaillé et le total du mois avec l&apos;écart. Un pointage fait par erreur peut être supprimé.</li>
                <li>La pause déjeuner ne se pointe plus : une journée de plus de 6 h compte 50 min de déjeuner en moins sur le temps de présence (arrivée → départ). Les journées plus courtes ne perdent rien.</li>
                <li>Couleurs : <span className="text-green-600 font-medium">vert</span> à l&apos;heure, <span className="text-orange-500 font-medium">orange</span> léger retard, <span className="text-red-600 font-medium">rouge</span> retard.</li>
                <li>🔔 <b>Cloche</b> : la <span className="text-red-600 font-semibold">pastille rouge</span> donne le nombre d&apos;employés en retard aujourd&apos;hui (10 min sans pointer, ou pointage avec 10 min de retard ou plus). Toucher la cloche pour voir le détail et les autres notifications (pointages, demandes de congé).</li>
              </ul>
            </Section>

            <Section title="5. Les autres vues">
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Timeline</b> : qui travaille à quelle heure dans la journée.</li>
                <li><b>Planning</b> : le planning de la réception, par zone.</li>
                <li><b>Tous / Clientèle / Riad</b> : filtrer par équipe. Le bouton <b>PDF</b> imprime la vue affichée.</li>
              </ul>
            </Section>

            <Section title="6. Ce que voient les employés">
              <p>Avec leur lien, les employés pointent, voient leurs heures, demandent un congé et consultent le planning de l&apos;équipe. Ils ne peuvent rien modifier au planning. Ils ont leur propre mode d&apos;emploi (bouton « Aide »).</p>
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
