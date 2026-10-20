'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { failure, parseForm, withRequestId, zDate, zInt, zMoney, zText, zUuid } from './helpers';
import type { ActionState } from './result';

const saleSchema = z.object({
  client_request_id: zUuid(),
  sale_date: zDate(),
  product_id: zUuid('Producto'),
  quantity: zInt('Cantidad'),
  unit_price_cents: zMoney({ required: true, label: 'El precio' }),
  discount_cents: zMoney(),
  platform_fee_cents: zMoney(),
  shipping_cost_cents: zMoney(),
  other_costs_cents: zMoney(),
  payment_status: z.enum(['pending', 'paid']),
  delivery_status: z.enum(['pending', 'shipped', 'delivered']),
  channel: zText(60),
  customer: zText(120),
  notes: zText(2000),
});

export async function registerSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(saleSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  if (d.discount_cents > d.quantity * d.unit_price_cents) {
    return { ok: false, message: 'El descuento supera el importe de la venta', fieldErrors: { discount_cents: 'Supera el importe' } };
  }
  const { data, error } = await supabase.rpc('register_sale', {
    p_client_request_id: d.client_request_id, p_sale_date: d.sale_date, p_product_id: d.product_id, p_quantity: d.quantity,
    p_unit_price_cents: d.unit_price_cents, p_discount_cents: d.discount_cents, p_platform_fee_cents: d.platform_fee_cents,
    p_shipping_cost_cents: d.shipping_cost_cents, p_other_costs_cents: d.other_costs_cents, p_payment_status: d.payment_status,
    p_delivery_status: d.delivery_status, p_channel: d.channel, p_customer: d.customer, p_notes: d.notes,
  });
  if (error) return failure(supabase, 'registerSale', error);
  revalidatePath('/', 'layout');
  redirect(`/ventas/${data}?ok=nueva`);
}

export async function markSalePaid(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), date: zDate() }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('mark_sale_paid', { p_id: parsed.data.id, p_paid_on: parsed.data.date });
  if (error) return failure(supabase, 'markSalePaid', error);
  revalidatePath('/', 'layout');
  redirect(`/ventas/${parsed.data.id}?ok=cobrada`);
}

export async function updateDelivery(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), delivery_status: z.enum(['pending', 'shipped', 'delivered']), notes: zText(2000) }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('update_sale_delivery', { p_id: parsed.data.id, p_delivery_status: parsed.data.delivery_status, p_notes: parsed.data.notes });
  if (error) return failure(supabase, 'updateDelivery', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Entrega actualizada' };
}

export async function cancelSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), reason: zText(300), date: zDate() }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('cancel_sale', { p_id: parsed.data.id, p_reason: parsed.data.reason, p_date: parsed.data.date });
  if (error) return failure(supabase, 'cancelSale', error);
  revalidatePath('/', 'layout');
  redirect(`/ventas/${parsed.data.id}?ok=venta_cancelada`);
}

const returnSchema = z.object({
  client_request_id: zUuid(),
  sale_id: zUuid(),
  date: zDate(),
  quantity: zInt('Cantidad'),
  refund_cents: zMoney(),
  condition: z.enum(['restock', 'defective']),
  reason: zText(300),
});

async function registerReturnInner(fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(returnSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { error } = await supabase.rpc('register_sale_return', {
    p_client_request_id: d.client_request_id, p_sale_id: d.sale_id, p_return_date: d.date, p_quantity: d.quantity,
    p_refund_cents: d.refund_cents, p_restock: d.condition === 'restock', p_reason: d.reason,
  });
  if (error) return failure(supabase, 'registerReturn', error);
  revalidatePath('/', 'layout');
  redirect(`/ventas/${d.sale_id}?ok=${d.condition === 'restock' ? 'devolucion' : 'devolucion_defectuosa'}`);
}

export async function registerReturn(_: ActionState, fd: FormData): Promise<ActionState> {
  return withRequestId(fd, await registerReturnInner(fd));
}
