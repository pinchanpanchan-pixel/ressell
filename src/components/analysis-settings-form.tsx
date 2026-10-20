'use client';
import { useActionState } from 'react';
import { savePlannerSettings } from '@/lib/actions/settings';
import { centsToInput } from '@/lib/money';
import type { PlannerSettings } from '@/lib/types';
import { Field, FormMessage, Input, SubmitButton } from './form';

export function AnalysisSettingsForm({ s }: { s: PlannerSettings }) {
  const [state, action] = useActionState(savePlannerSettings, null);
  const hidden: Record<string, string> = {
    reference_capital_cents: centsToInput(s.reference_capital_cents),
    unit_cost_cents: centsToInput(s.unit_cost_cents),
    supplier_shipping_cents: centsToInput(s.supplier_shipping_cents),
    other_order_costs_cents: centsToInput(s.other_order_costs_cents),
    avg_sale_price_cents: centsToInput(s.avg_sale_price_cents),
    seller_shipping_cents: centsToInput(s.seller_shipping_cents),
    platform_fee_bps: String(s.platform_fee_bps / 100),
  };
  return (
    <form action={action} className="flex flex-col gap-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Días de cobertura" hint="Stock objetivo tras reponer"><Input name="coverage_days" type="number" inputMode="numeric" min={1} max={365} defaultValue={s.coverage_days} /></Field>
        <Field label="Plazo de reposición" hint="Días, por defecto"><Input name="default_lead_time_days" type="number" inputMode="numeric" min={0} max={365} defaultValue={s.default_lead_time_days} /></Field>
        <Field label="Reinversión (%)"><Input name="reinvest_bps" inputMode="decimal" defaultValue={s.reinvest_bps / 100} /></Field>
        <Field label="Reserva (%)"><Input name="reserve_bps" inputMode="decimal" defaultValue={s.reserve_bps / 100} /></Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="md">Guardar parámetros</SubmitButton>
    </form>
  );
}
