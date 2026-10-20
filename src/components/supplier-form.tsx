'use client';
import { useActionState } from 'react';
import { deleteSupplier, saveSupplier } from '@/lib/actions/suppliers';
import type { Supplier } from '@/lib/types';
import { ConfirmSubmit, Field, FormMessage, Input, SubmitButton } from './form';

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, action] = useActionState(saveSupplier, null);
  const [delState, delAction] = useActionState(deleteSupplier, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-col gap-3" key={supplier ? supplier.id : (state?.requestId ?? 'new')}>
        {supplier && <input type="hidden" name="id" value={supplier.id} />}
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Nombre" error={state?.fieldErrors?.name}><Input name="name" defaultValue={supplier?.name} required /></Field>
          <Field label="Plazo (días)"><Input name="default_lead_time_days" type="number" inputMode="numeric" min={0} max={365} defaultValue={supplier?.default_lead_time_days ?? 14} /></Field>
        </div>
        <Field label="Contacto"><Input name="contact" defaultValue={supplier?.contact ?? ''} placeholder="Web, email, teléfono…" /></Field>
        <FormMessage state={state} />
        <SubmitButton variant={supplier ? 'secondary' : 'primary'} size="md">{supplier ? 'Guardar' : 'Añadir proveedor'}</SubmitButton>
      </form>
      {supplier && (
        <form action={delAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <ConfirmSubmit size="sm" variant="danger" confirmText="Eliminar proveedor">Eliminar</ConfirmSubmit>
          <FormMessage state={delState} />
        </form>
      )}
    </div>
  );
}
