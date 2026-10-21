'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { cx } from './ui';

/**
 * Sincronización entre dispositivos.
 * - La fuente de verdad es siempre Supabase: las pantallas se renderizan en el servidor con datos de la base de datos.
 * - Supabase Realtime avisa de cualquier cambio (hecho desde este u otro dispositivo) y se recargan los datos.
 * - Al volver a la app (cambio de pestaña, PWA en segundo plano, reconexión) se recargan los datos.
 * - Si Realtime no está disponible, se consulta periódicamente mientras la app está visible.
 */
const TABLES = [
  'products', 'suppliers', 'purchase_orders', 'purchase_order_lines', 'stock_lots', 'sales',
  'sale_returns', 'stock_write_offs', 'inventory_movements', 'ledger_entries', 'planner_settings', 'attachments',
] as const;

const FALLBACK_POLL_MS = 30_000;
const DEBOUNCE_MS = 400;

type Status = 'connecting' | 'live' | 'polling' | 'offline';

export function LiveSync() {
  const router = useRouter();
  const [status, setStatusState] = useState<Status>('connecting');
  const statusRef = useRef<Status>('connecting');
  const [syncing, startTransition] = useTransition();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    let disposed = false;
    const setStatus = (next: Status | ((s: Status) => Status)) => {
      statusRef.current = typeof next === 'function' ? next(statusRef.current) : next;
      setStatusState(statusRef.current);
    };

    const refresh = () => {
      if (disposed || !navigator.onLine) return;
      lastRefresh.current = Date.now();
      startTransition(() => {
        router.refresh();
        setLastSync(new Date());
      });
    };
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    };
    // Al volver a la app: recarga si han pasado más de 2 s desde la última recarga.
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh.current > 2000) scheduleRefresh();
    };
    const onOnline = () => { setStatus((s) => (s === 'offline' ? 'connecting' : s)); scheduleRefresh(); };
    const onOffline = () => setStatus('offline');
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) scheduleRefresh(); };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pageshow', onPageShow);
    if (!navigator.onLine) setStatus('offline');

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let subscribedOnce = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase.channel(`mls-sync-${Math.random().toString(36).slice(2)}`);
      // RLS de Supabase garantiza que solo llegan los cambios de las filas del propietario.
      for (const table of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
      }
      channel.subscribe((s) => {
        if (disposed) return;
        if (s === 'SUBSCRIBED') {
          setStatus('live');
          // Tras una reconexión se recarga para recoger lo que haya cambiado mientras tanto.
          if (subscribedOnce) scheduleRefresh();
          subscribedOnce = true;
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus(navigator.onLine ? 'polling' : 'offline');
        }
      });
    })();

    // Mantiene el token de Realtime al día cuando Supabase renueva la sesión.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    // Respaldo: consulta periódica si Realtime no está disponible.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > FALLBACK_POLL_MS - 1000) {
        if (statusRef.current === 'polling') refresh();
      }
    }, FALLBACK_POLL_MS);

    return () => {
      disposed = true;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      authSub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pageshow', onPageShow);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  const view = syncing
    ? { dot: 'bg-sage animate-pulse', text: 'Sincronizando…' }
    : status === 'live'
      ? { dot: 'bg-sage', text: 'Sincronizado' }
      : status === 'polling'
        ? { dot: 'bg-warn', text: 'Sincronización periódica' }
        : status === 'offline'
          ? { dot: 'bg-danger', text: 'Sin conexión' }
          : { dot: 'bg-faint animate-pulse', text: 'Conectando…' };
  const title = lastSync ? `${view.text} · última actualización ${lastSync.toLocaleTimeString('es-ES')}` : view.text;

  return (
    <span role="status" aria-live="polite" title={title} data-sync-status={syncing ? 'syncing' : status}
      className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-faint">
      <span aria-hidden className={cx('size-1.5 rounded-full', view.dot)} />
      {view.text}
    </span>
  );
}
