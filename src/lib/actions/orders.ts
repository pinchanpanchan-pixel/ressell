'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { failure, parseForm, zDate, zMoney, zOptionalUuid, zText, zUuid } from './helpers';
import type { ActionState } from './result';

const lineSchema = z.object({
  product_id: zUuid('Producto'),
  quantity: z.number().int().min(1, 'Cantidad mínima 1').max(10000),
  unit_price_cents: z.number().int().min(0).max(100_000_000),
  discount_cents: z.number().int().min(0).default(0),
});

const orderSchema = z.object({
  id: zOptionalUuid(),
  client_request_id: zUuid(),
  reference: zText(40),
  supplier_id: zOptionalUuid(),
  order_date: zDate(),
  status: z.enum(['draft', 'pending_payment']),
  discount_cents: zMoney(),
  shipping_cents: zMoney(),
  packaging_cents: zMoney(),
  other_costs_cents: zMoney(),
  tracking_number: zText(80),
  carrier: zText(80),
  notes: zText(2000),
  lines: z.string().transform((v, ctx) => {
    try {
      return z.array(lineSchema).min(1, 'Añade al menos un producto').parse(JSON.parse(v));
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: e instanceof z.ZodError ? e.issues[0].message : 'Líneas no válidas' });
      return z.NEVER;
    }
  }),
});

export async function saveOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(orderSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  for (const l of d.lines) {
    if (l.discount_cents > l.quantity * l.unit_price_cents) return { ok: false, message: 'El descuento de una línea supera su importe' };
  }
  const { data, error } = await supabase.rpc('save_purchase_order', {
    p_id: d.id, p_client_request_id: d.client_request_id, p_reference: d.reference, p_supplier_id: d.supplier_id,
    p_order_date: d.order_date, p_status: d.status, p_discount_cents: d.discount_cents, p_shipping_cents: d.shipping_cents,
    p_packaging_cents: d.packaging_cents, p_other_costs_cents: d.other_costs_cents, p_tracking_number: d.tracking_number,
    p_carrier: d.carrier, p_notes: d.notes, p_lines: d.lines,
  });
  if (error) return failure(supabase, 'saveOrder', error);
  revalidatePath('/', 'layout');
  redirect(`/pedidos/${data}`);
}

const idDate = z.object({ id: zUuid(), date: zDate() });

export async function payOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(idDate, fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('pay_purchase_order', { p_id: parsed.data.id, p_paid_on: parsed.data.date });
  if (error) return failure(supabase, 'payOrder', error);
  revalidatePath('/', 'layout');
  redirect(`/pedidos/${parsed.data.id}?ok=pagado`);
}

export async function receiveOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(idDate, fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('receive_purchase_order', { p_id: parsed.data.id, p_received_on: parsed.data.date });
  if (error) return failure(supabase, 'receiveOrder', error);
  revalidatePath('/', 'layout');
  redirect(`/pedidos/${parsed.data.id}?ok=recibido`);
}

export async function setOrderStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), status: z.enum(['draft', 'pending_payment', 'shipped', 'reviewed']) }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('set_purchase_order_status', { p_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return failure(supabase, 'setOrderStatus', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Estado actualizado' };
}

export async function updateOrderInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), tracking_number: zText(80), carrier: zText(80), incidents: zText(2000), notes: zText(2000) }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { error } = await supabase.rpc('update_purchase_order_info', {
    p_id: d.id, p_tracking_number: d.tracking_number, p_carrier: d.carrier, p_incidents: d.incidents, p_notes: d.notes,
  });
  if (error) return failure(supabase, 'updateOrderInfo', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Información guardada' };
}

export async function cancelOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), refund: z.string().optional(), date: zDate() }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('cancel_purchase_order', {
    p_id: parsed.data.id, p_refund_received: parsed.data.refund === 'on', p_refund_date: parsed.data.date,
  });
  if (error) return failure(supabase, 'cancelOrder', error);
  revalidatePath('/', 'layout');
  redirect(`/pedidos/${parsed.data.id}?ok=cancelado`);
}
