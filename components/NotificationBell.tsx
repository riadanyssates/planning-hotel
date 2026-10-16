'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Notification {
  id: number;
  type: 'leave_request' | 'timeclock' | 'late';
  employee_name: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchNotifs() {
    const res = await fetch('/api/notifications?all=1');
    if (res.ok) setNotifs(await res.json());
  }

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unread = notifs.filter(n => !n.read_at);

  async function handleOpen() {
    setOpen(o => !o);
    if (!open && unread.length > 0) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unread.map(n => n.id) }),
      });
      setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    }
  }

  function fmtTime(iso: string) {
    try { return format(new Date(iso), 'd MMM HH:mm', { locale: fr }); } catch { return ''; }
  }

  const icon = (type: string) => type === 'leave_request' ? '📋' : type === 'late' ? '⏰' : '🕐';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg hover:bg-celadon-600 transition-colors text-white/80 hover:text-white"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute top-24 sm:top-full left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 sm:right-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Notifications</span>
            {notifs.length > 0 && (
              <span className="text-xs text-slate-400">{notifs.length} au total</span>
            )}
          </div>
          {notifs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">Aucune notification</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifs.map(n => (
                <div key={n.id} className={`px-4 py-3 ${!n.read_at ? 'bg-celadon-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0 mt-0.5">{icon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtTime(n.created_at)}</p>
                    </div>
                    {!n.read_at && (
                      <span className="w-2 h-2 rounded-full bg-celadon-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
