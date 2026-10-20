'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { failure, parseForm, zMoney } from './helpers';
import type { ActionState } from './result';

const pct = () => z.coerce.number().min(0).max(100).transform((v) => Math.round(v * 100));

const schema = z.object({
  reference_capital_cents: zMoney(),
  unit_cost_cents: zMoney(),
  supplier_shipping_cents: zMoney(),
  other_order_costs_cents: zMoney(),
  avg_sale_price_cents: zMoney(),
  seller_shipping_cents: zMoney(),
  platform_fee_bps: pct(),
  reinvest_bps: pct(),
  reserve_bps: pct(),
  coverage_days: z.coerce.number().int().min(1).max(365),
  default_lead_time_days: z.coerce.number().int().min(0).max(365),
});

export async function savePlannerSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireOwner();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.from('planner_settings').upsert({ owner_id: user.id, ...parsed.data });
  if (error) return failure(supabase, 'savePlannerSettings', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Valores de referencia guardados' };
}
