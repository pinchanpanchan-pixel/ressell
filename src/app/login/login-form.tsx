'use client';
import { useActionState } from 'react';
import { Field, FormMessage, Input, SubmitButton } from '@/components/form';
import { signIn } from '@/lib/actions/auth';

export function LoginForm() {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <Field label="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
