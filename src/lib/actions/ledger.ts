'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { parseEuroToCents } from '../money';
import { failure, parseForm, withRequestId, zDate, zRequiredText, zText, zUuid } from './helpers';
import type { ActionState } from './result';

const schema = z.object({
  client_request_id: zUuid(),
  date: zDate(),
  category: z.enum(['initial_capital', 'capital_contribution', 'expense', 'withdrawal', 'supplier_refund', 'adjustment']),
  amount: z.string().transform((v, ctx) => {
    const c = parseEuroToCents(v);
    if (c == null || c === 0) {
      ctx.addIssue({ code: 'custom', message: 'Importe no válido' });
      return z.NEVER;
    }
    return c;
  }),
  description: zRequiredText('La descripción', 300),
});

async function recordEntryInner(fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  if (d.category !== 'adjustment' && d.amount < 0) {
    return { ok: false, message: 'Introduce el importe en positivo; el signo se aplica según la categoría', fieldErrors: { amount: 'Debe ser positivo' } };
  }
  const { error } = await supabase.rpc('record_ledger_entry', {
    p_client_request_id: d.client_request_id, p_entry_date: d.date, p_category: d.category, p_amount_cents: d.amount, p_description: d.description,
  });
  if (error) return failure(supabase, 'recordEntry', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Movimiento registrado' };
}

export async function reverseEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(z.object({ id: zUuid(), reason: zText(200) }), fd);
  if (!parsed.ok) return parsed.state;
  const { error } = await supabase.rpc('reverse_ledger_entry', { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return failure(supabase, 'reverseEntry', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Movimiento anulado con un asiento inverso' };
}

export async function recordEntry(_: ActionState, fd: FormData): Promise<ActionState> {
  return withRequestId(fd, await recordEntryInner(fd));
}
