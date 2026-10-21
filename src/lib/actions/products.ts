'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { CONFLICT_MESSAGE, expectedVersion, failure, parseForm, withRequestId, zDate, zInt, zOptionalMoney, zOptionalUuid, zRequiredText, zText, zUuid } from './helpers';
import type { ActionState } from './result';

const productSchema = z.object({
  name: zRequiredText('El nombre', 160),
  brand: zText(80),
  model: zText(80),
  variant: zText(80),
  category: zText(80),
  sku: zText(60),
  supplier_id: zOptionalUuid(),
  expected_price_cents: zOptionalMoney(),
  reference_unit_cost_cents: zOptionalMoney(),
  lead_time_days: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(0).max(365).nullable()),
  authenticity_status: z.enum(['pending', 'verified', 'documented', 'doubtful']),
  documentation_notes: zText(2000),
  notes: zText(2000),
});

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(productSchema, fd);
  if (!parsed.ok) return parsed.state;
  const id = fd.get('id');
  if (typeof id === 'string' && id) {
    // Control de cambios simultáneos: solo se actualiza si nadie lo ha modificado desde que se abrió el formulario.
    let q = supabase.from('products').update(parsed.data).eq('id', id);
    const version = expectedVersion(fd);
    if (version) q = q.eq('updated_at', version);
    const { data, error } = await q.select('id').maybeSingle();
    if (error) return failure(supabase, 'saveProduct', error);
    if (!data) {
      revalidatePath('/', 'layout');
      return { ok: false, message: CONFLICT_MESSAGE };
    }
  } else {
    const { data, error } = await supabase.from('products').insert(parsed.data).select('id').single();
    if (error) return failure(supabase, 'saveProduct', error);
    revalidatePath('/', 'layout');
    redirect(`/stock/${data.id}`);
  }
  revalidatePath('/', 'layout');
  redirect(`/stock/${id}`);
}

export async function setProductArchived(fd: FormData) {
  const { supabase } = await requireOwner();
  const id = zUuid().parse(fd.get('id'));
  await supabase.from('products').update({ archived: fd.get('archived') === 'true' }).eq('id', id);
  revalidatePath('/', 'layout');
}

const writeOffSchema = z.object({
  client_request_id: zUuid(),
  product_id: zUuid('Producto'),
  quantity: zInt('Cantidad'),
  reason: zRequiredText('El motivo', 300),
  date: zDate(),
});

async function writeOffStockInner(fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(writeOffSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { error } = await supabase.rpc('write_off_stock', {
    p_client_request_id: d.client_request_id, p_product_id: d.product_id, p_quantity: d.quantity, p_reason: d.reason, p_date: d.date,
  });
  if (error) return failure(supabase, 'writeOffStock', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: `Baja registrada (${d.quantity} ud). El coste se contabiliza como pérdida.` };
}

export async function writeOffStock(_: ActionState, fd: FormData): Promise<ActionState> {
  return withRequestId(fd, await writeOffStockInner(fd));
}
