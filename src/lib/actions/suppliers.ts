'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '../auth';
import { randomUUID } from 'node:crypto';
import { failure, parseForm, zRequiredText, zText, zUuid } from './helpers';
import type { ActionState } from './result';

const schema = z.object({
  name: zRequiredText('El nombre', 120),
  contact: zText(200),
  default_lead_time_days: z.coerce.number().int().min(0).max(365).default(14),
  notes: zText(1000),
});

export async function saveSupplier(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return parsed.state;
  const id = fd.get('id');
  const { error } = typeof id === 'string' && id
    ? await supabase.from('suppliers').update(parsed.data).eq('id', id)
    : await supabase.from('suppliers').insert(parsed.data);
  if (error) return failure(supabase, 'saveSupplier', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Proveedor guardado', requestId: randomUUID() };
}

export async function deleteSupplier(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const id = zUuid().parse(fd.get('id'));
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) return failure(supabase, 'deleteSupplier', error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Proveedor eliminado' };
}
