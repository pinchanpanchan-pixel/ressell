'use client';
import { useActionState, useState } from 'react';
import { reverseEntry } from '@/lib/actions/ledger';
import { ConfirmSubmit, FormMessage } from './form';

export function ReverseEntryButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reverseEntry, null);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-faint hover:text-danger">Anular</button>;
  return (
    <form action={action} className="mt-2 flex w-full flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="reason" placeholder="Motivo (opcional)" className="min-h-10 rounded-xl border border-line bg-graphite-deep/60 px-3 text-[16px]" />
      <ConfirmSubmit size="sm" variant="danger" confirmText="Crear asiento inverso">Anular movimiento</ConfirmSubmit>
      <FormMessage state={state} />
    </form>
  );
}
