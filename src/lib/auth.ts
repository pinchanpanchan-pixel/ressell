import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from './supabase/server';

/**
 * Garantiza que la petición viene del propietario autorizado.
 * Doble control: la tabla authorized_users (también aplicada por RLS en la base de datos)
 * y, opcionalmente, la variable OWNER_EMAIL del servidor.
 */
export const requireOwner = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  const user = data.user;

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const emailOk = !ownerEmail || user.email?.toLowerCase() === ownerEmail;
  const { data: row } = await supabase.from('authorized_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!emailOk || !row) redirect('/no-autorizado');

  return { supabase, user };
});
