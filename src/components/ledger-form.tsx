'use client';
import { useActionState } from 'react';
import { recordEntry } from '@/lib/actions/ledger';
import { LEDGER_LABEL, MANUAL_LEDGER_CATEGORIES } from '@/lib/labels';
import { Field, FormMessage, Input, MoneyInput, Select, SubmitButton } from './form';
import { useRequestId } from './request-id';

export function LedgerEntryForm({ requestId, today, initialOnly, hasInitial }: { requestId: string; today: string; initialOnly?: boolean; hasInitial?: boolean }) {
  const [state, action] = useActionState(recordEntry, null);
  const rid = useRequestId(state, requestId);
  const categories = initialOnly ? (['initial_capital'] as const) : MANUAL_LEDGER_CATEGORIES.filter((c) => !(hasInitial && c === 'initial_capital'));
  return (
    <form action={action} className="flex flex-col gap-4" key={rid}>
      <input type="hidden" name="client_request_id" value={rid} />
      {initialOnly ? (
        <input type="hidden" name="category" value="initial_capital" />
      ) : (
        <Field label="Tipo de movimiento" error={state?.fieldErrors?.category}>
          <Select name="category" defaultValue={hasInitial ? 'expense' : 'initial_capital'}>
            {categories.map((c) => <option key={c} value={c}>{LEDGER_LABEL[c]}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe" error={state?.fieldErrors?.amount} hint={initialOnly ? undefined : 'Ajuste: usa signo − para restar'}>
          <MoneyInput name="amount" required />
        </Field>
        <Field label="Fecha" error={state?.fieldErrors?.date}>
          <Input type="date" name="date" defaultValue={today} max={today} />
        </Field>
      </div>
      <Field label="Descripción" error={state?.fieldErrors?.description}>
        <Input name="description" defaultValue={initialOnly ? 'Capital inicial' : ''} placeholder="Ej.: bolsas y etiquetas" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>{initialOnly ? 'Registrar capital inicial' : 'Registrar movimiento'}</SubmitButton>
    </form>
  );
}
