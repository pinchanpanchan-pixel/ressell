import Link from 'next/link';
import { buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">No encontrado</h1>
      <p className="text-sm text-muted">Esta página o registro no existe.</p>
      <Link href="/" className={buttonClass('secondary', 'md')}>Ir al inicio</Link>
    </main>
  );
}
