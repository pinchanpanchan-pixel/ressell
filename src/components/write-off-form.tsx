'use client';
import { useActionState } from 'react';
import { writeOffStock } from '@/lib/actions/products';
import { Field, FormMessage, Input, SubmitButton } from './form';
import { useRequestId } from './request-id';

export function WriteOffForm({ productId, max, requestId, today }: { productId: string; max: number; requestId: string; today: string }) {
  const [state, action] = useActionState(writeOffStock, null);
  const rid = useRequestId(state, requestId);
  return (
    <form action={action} className="flex flex-col gap-3" key={rid}>
      <input type="hidden" name="client_request_id" value={rid} />
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unidades" error={state?.fieldErrors?.quantity}><Input name="quantity" type="number" inputMode="numeric" min={1} max={max} defaultValue={1} required /></Field>
        <Field label="Fecha"><Input name="date" type="date" defaultValue={today} max={today} /></Field>
      </div>
      <Field label="Motivo" error={state?.fieldErrors?.reason}><Input name="reason" placeholder="Defectuoso, roto, perdido…" required /></Field>
      <FormMessage state={state} />
      <SubmitButton variant="danger" size="md">Dar de baja</SubmitButton>
    </form>
  );
}
