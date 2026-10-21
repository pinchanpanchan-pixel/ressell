'use client';
import { useState } from 'react';
import { Notice } from './ui';

/**
 * Control de cambios simultáneos entre dispositivos.
 * Guarda la versión (updated_at) que había al abrir el formulario y la envía al servidor,
 * que solo guarda si sigue siendo la misma. Si la sincronización en tiempo real trae una
 * versión más nueva mientras se edita, se avisa antes de guardar.
 */
export function useVersionGuard(current: string | undefined, saved?: string) {
  const [opened] = useState(current);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved && saved !== lastSaved) setLastSaved(saved);
  const base = saved ?? lastSaved ?? opened;
  const stale = !!current && !!base && new Date(current).getTime() !== new Date(base).getTime();
  return { base, stale };
}

export function VersionFields({ base, stale }: { base: string | undefined; stale: boolean }) {
  return (
    <>
      {base && <input type="hidden" name="expected_updated_at" value={base} />}
      {stale && (
        <Notice tone="warn">
          Este registro se ha modificado en otro dispositivo. Si guardas ahora, el cambio será rechazado para no
          sobrescribirlo: recarga la página para editar la versión más reciente.
        </Notice>
      )}
    </>
  );
}
