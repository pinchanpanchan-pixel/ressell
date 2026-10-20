'use client';
import { buttonClass, Card } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <Card className="mt-8 p-6 text-center">
      <h1 className="mb-2 text-lg font-semibold">{offline ? 'Sin conexión' : 'Algo ha fallado'}</h1>
      <p className="mb-5 text-sm text-muted">
        {offline ? 'Recupera la conexión para ver tus datos.' : 'No se han podido cargar los datos. Ninguna operación se ha quedado a medias.'}
        {error.digest && <span className="mt-2 block text-xs text-faint">Ref.: {error.digest}</span>}
      </p>
      <button onClick={reset} className={buttonClass('primary', 'md', true)}>Reintentar</button>
    </Card>
  );
}
