'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import type { ActionState } from './result';

const schema = z.object({ email: z.email('Email no válido'), password: z.string().min(1, 'Introduce la contraseña') });

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: fd.get('email'), password: fd.get('password') });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, message: /invalid/i.test(error.message) ? 'Email o contraseña incorrectos' : 'No se pudo iniciar sesión. Inténtalo de nuevo.' };
  }
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
