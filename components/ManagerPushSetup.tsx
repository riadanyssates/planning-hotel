'use client';

import { useState, useEffect, useCallback } from 'react';

type Status = 'loading' | 'hidden' | 'unsupported' | 'ios-homescreen' | 'denied' | 'off' | 'on';

const DISMISS_KEY = 'mgr-push-dismissed';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

// Bandeau de l'espace manager : active sur ce téléphone les alertes importantes
// (demandes de congé, retards, pointage un jour de congé ou de repos).
export default function ManagerPushSetup() {
  const [status, setStatus] = useState<Status>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      setStatus(isDismissed() ? 'hidden' : isIos() && !isStandalone() ? 'ios-homescreen' : 'unsupported');
      return;
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.getSubscription();
    const qs = sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : '';
    const res = await fetch(`/api/manager/push${qs}`);
    const info = res.ok ? await res.json() as { publicKey: string | null; subscribed: boolean } : null;
    if (!info?.publicKey) { setStatus('hidden'); return; }
    setPublicKey(info.publicKey);

    if (sub && info.subscribed && Notification.permission === 'granted') {
      setEndpoint(sub.endpoint);
      setStatus('on');
      return;
    }
    if (isDismissed()) { setStatus('hidden'); return; }
    setStatus(Notification.permission === 'denied' ? 'denied' : 'off');
  }, []);

  useEffect(() => { refresh().catch(() => setStatus('hidden')); }, [refresh]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Un même téléphone peut déjà être abonné (rappels de retard du lien employé) : on réutilise l'abonnement
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch('/api/manager/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Enregistrement impossible');
      try { localStorage.removeItem(DISMISS_KEY); } catch { /* sans importance */ }
      setEndpoint(sub.endpoint);
      setStatus('on');
      await test(sub.endpoint);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Activation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!endpoint) return;
    setBusy(true);
    try {
      // On retire seulement les alertes manager : l'abonnement du téléphone reste (rappels de retard employé)
      await fetch('/api/manager/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setStatus('off');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function test(ep = endpoint) {
    if (!ep) return;
    const res = await fetch('/api/manager/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: ep }),
    });
    const data = res.ok ? await res.json() : { sent: 0 };
    setMessage(data.sent ? 'Notification d\'essai envoyée.' : 'La notification d\'essai n\'a pas pu être envoyée.');
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sans importance */ }
    setStatus('hidden');
  }

  if (status === 'loading' || status === 'hidden') return null;

  if (status === 'on') {
    return (
      <div className="max-w-screen-xl mx-auto px-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-celadon-700">
          <span>🔔 Notifications activées sur ce téléphone</span>
          <button onClick={() => test()} disabled={busy} className="underline hover:no-underline">Tester</button>
          <button onClick={disable} disabled={busy} className="underline hover:no-underline text-slate-500">Désactiver</button>
          {message && <span className="text-slate-500">{message}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 pt-3">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold">🔔 Notifications sur ce téléphone</p>
          <button onClick={dismiss} className="text-xs text-amber-700 underline hover:no-underline shrink-0">Plus tard</button>
        </div>
        {status === 'off' && (
          <>
            <p className="mt-1">
              Recevez une alerte pour chaque demande de congé, chaque retard, et quand un employé pointe
              un jour de congé ou de repos. Les pointages ordinaires restent dans la cloche.
            </p>
            <button
              onClick={enable}
              disabled={busy}
              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? 'Activation…' : 'Activer les notifications'}
            </button>
          </>
        )}
        {status === 'ios-homescreen' && (
          <p className="mt-1">
            Sur iPhone, ajoutez d&apos;abord cette page à l&apos;écran d&apos;accueil : bouton Partager
            <span className="mx-1">⬆️</span>puis « Sur l&apos;écran d&apos;accueil ». Ouvrez ensuite l&apos;appli depuis la nouvelle
            icône « Planning » et activez les notifications.
          </p>
        )}
        {status === 'denied' && (
          <p className="mt-1">
            Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur
            (ou de l&apos;iPhone : Réglages → Notifications → Planning), puis rechargez la page.
          </p>
        )}
        {status === 'unsupported' && (
          <p className="mt-1">Ce navigateur ne permet pas les notifications. Ouvrez l&apos;espace manager avec Chrome (Android) ou Safari (iPhone).</p>
        )}
        {message && <p className="mt-2 text-xs">{message}</p>}
      </div>
    </div>
  );
}
