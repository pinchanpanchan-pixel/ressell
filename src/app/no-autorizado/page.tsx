import { signOut } from '@/lib/actions/auth';
import { buttonClass, Card } from '@/components/ui';

export default function NotAuthorized() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <Card className="p-6 text-center">
        <h1 className="mb-2 text-xl font-semibold">Cuenta no autorizada</h1>
        <p className="mb-6 text-sm text-muted">
          Has iniciado sesión con una cuenta que no tiene acceso a ML Supply. No se muestra ningún dato.
        </p>
        <form action={signOut}>
          <button className={buttonClass('secondary', 'md', true)}>Cerrar sesión</button>
        </form>
      </Card>
    </main>
  );
}
