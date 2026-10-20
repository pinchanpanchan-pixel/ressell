'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/actions/result';
import { FormMessage } from './form';
import { useRequestId } from './request-id';

/** Formulario genérico para acciones con mensaje de resultado y campos ocultos. */
export function ActionForm({ action, hidden, children, requestId, className }: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  children: ReactNode;
  requestId?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const rid = useRequestId(state, requestId ?? '');
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-3'}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {requestId && <input type="hidden" name="client_request_id" value={rid} />}
      {children}
      <FormMessage state={state} />
    </form>
  );
}
