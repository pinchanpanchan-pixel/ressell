'use client';
import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function OnlineStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="safe-top fixed inset-x-0 top-0 z-50 bg-warn px-4 py-2 text-center text-sm font-medium text-graphite">
      Sin conexión · No se pueden guardar operaciones hasta recuperarla
    </div>
  );
}
