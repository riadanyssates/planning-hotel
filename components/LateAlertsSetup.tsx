'use client';

import { useState, useEffect, useCallback } from 'react';

type Status = 'loading' | 'unsupported' | 'ios-homescreen' | 'unavailable' | 'denied' | 'off' | 'on';

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

// Bandeau « Rappels de retard » sur la page personnelle de l'employé :
// active les notifications push sur ce téléphone.
export default function LateAlertsSetup({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      setStatus(isIos() && !isStandalone() ? 'ios-homescreen' : 'unsupported');
      return;
    }
    const res = await fetch(`/api/employee/${token}/push`);
    const info = res.ok ? await res.json() : null;
    if (!info?.publicKey) { setStatus('unavailable'); return; }
    setPublicKey(info.publicKey);
    if (Notification.permission === 'denied') { setStatus('denied'); return; }

    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      // Ré-enregistre l'abonnement (au cas où il aurait été purgé côté serveur)
      await fetch(`/api/employee/${token}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      setStatus('on');
    } else {
      setStatus('off');
    }
  }, [token]);

  useEffect(() => { refresh().catch(() => setStatus('unsupported')); }, [refresh]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch(`/api/employee/${token}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Enregistrement impossible');
      setStatus('on');
      await test();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Activation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/employee/${token}/push`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus('off');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const res = await fetch(`/api/employee/${token}/push/test`, { method: 'POST' });
    const data = res.ok ? await res.json() : { sent: 0 };
    setMessage(data.sent ? 'Notification d\'essai envoyée.' : 'La notification d\'essai n\'a pas pu être envoyée.');
  }

  if (status === 'loading' || status === 'unavailable') return null;

  if (status === 'on') {
    return (
      <div className="max-w-screen-xl mx-auto px-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-celadon-700">
          <span>🔔 Rappels de retard activés sur ce téléphone</span>
          <button onClick={test} disabled={busy} className="underline hover:no-underline">Tester</button>
          <button onClick={disable} disabled={busy} className="underline hover:no-underline text-slate-500">Désactiver</button>
          {message && <span className="text-slate-500">{message}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 pt-3">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">🔔 Rappels de retard</p>
        {status === 'off' && (
          <>
            <p className="mt-1">Recevez une alerte sur ce téléphone si vous n'avez pas pointé 10 minutes après votre heure prévue.</p>
            <button
              onClick={enable}
              disabled={busy}
              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? 'Activation…' : 'Activer les rappels'}
            </button>
          </>
        )}
        {status === 'ios-homescreen' && (
          <p className="mt-1">
            Sur iPhone, ajoutez d'abord cette page à l'écran d'accueil : bouton Partager
            <span className="mx-1">⬆️</span>puis « Sur l'écran d'accueil ». Ouvrez ensuite l'appli depuis la nouvelle icône
            et activez les rappels.
          </p>
        )}
        {status === 'denied' && (
          <p className="mt-1">
            Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur
            (ou de l'iPhone : Réglages → Notifications → Anyssates), puis rechargez la page.
          </p>
        )}
        {status === 'unsupported' && (
          <p className="mt-1">Ce navigateur ne permet pas les notifications. Ouvrez votre lien avec Chrome (Android) ou Safari (iPhone).</p>
        )}
        {message && <p className="mt-2 text-xs">{message}</p>}
      </div>
    </div>
  );
}
