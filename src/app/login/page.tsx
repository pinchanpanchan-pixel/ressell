import type { Metadata } from 'next';
import Image from 'next/image';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Acceso' };

export default function LoginPage() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="fade-in mb-10 flex flex-col items-center text-center">
        <Image src="/icons/icon-192.png" alt="" width={72} height={72} className="mb-5 rounded-[20px]" priority />
        <h1 className="text-3xl font-semibold tracking-tight">ML Supply</h1>
        <p className="mt-2 text-sm text-muted">Acceso privado</p>
      </div>
      <LoginForm />
      <p className="mt-8 text-center text-xs leading-relaxed text-faint">
        Solo la cuenta autorizada puede acceder. El registro de nuevas cuentas está desactivado.
      </p>
    </main>
  );
}
