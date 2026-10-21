import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseEuroToCents } from '../money';
import type { ActionState } from './result';

export const zText = (max = 500) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).optional().transform((v) => (v ? v : null));

export const zRequiredText = (label: string, max = 200) =>
  z.string({ error: `${label} es obligatorio` }).trim().min(1, `${label} es obligatorio`).max(max, `Máximo ${max} caracteres`);

export const zMoney = (opts: { required?: boolean; label?: string } = {}) =>
  z.string().optional().transform((v, ctx) => {
    const s = (v ?? '').trim();
    if (!s) {
      if (opts.required) {
        ctx.addIssue({ code: 'custom', message: `${opts.label ?? 'El importe'} es obligatorio` });
        return z.NEVER;
      }
      return 0;
    }
    const cents = parseEuroToCents(s);
    if (cents == null || cents < 0) {
      ctx.addIssue({ code: 'custom', message: 'Importe no válido (usa por ejemplo 17,50)' });
      return z.NEVER;
    }
    return cents;
  });

export const zOptionalMoney = () =>
  z.string().optional().transform((v, ctx) => {
    const s = (v ?? '').trim();
    if (!s) return null;
    const cents = parseEuroToCents(s);
    if (cents == null || cents < 0) {
      ctx.addIssue({ code: 'custom', message: 'Importe no válido (usa por ejemplo 17,50)' });
      return z.NEVER;
    }
    return cents;
  });

export const zInt = (label: string, min = 1, max = 100000) =>
  z.coerce.number({ error: `${label} no válido` }).int(`${label} debe ser un número entero`).min(min, `${label}: mínimo ${min}`).max(max, `${label}: máximo ${max}`);

export const zDate = () =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: 'custom', message: 'Fecha no válida' });
      return z.NEVER;
    }
    return v;
  });

export const zUuid = (label = 'Identificador') => z.uuid({ error: `${label} no válido` });
export const zOptionalUuid = () => z.string().optional().transform((v) => (v ? v : null)).pipe(z.uuid().nullable());

export function parseForm<T extends z.ZodType>(schema: T, fd: FormData): { ok: true; data: z.output<T> } | { ok: false; state: ActionState } {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$')) continue;
    raw[k] = typeof v === 'string' ? v : v;
  }
  const res = schema.safeParse(raw);
  if (res.success) return { ok: true, data: res.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, state: { ok: false, message: 'Revisa los campos marcados', fieldErrors } };
}

type PgError = { message: string; code?: string; details?: string | null };

export function friendlyError(error: PgError): string {
  if (error.code === '23505') {
    if (/sku/i.test(error.message)) return 'Ya existe un producto con ese SKU';
    if (/variant/i.test(error.message)) return 'Esa variante exacta ya está registrada';
    if (/suppliers/i.test(error.message)) return 'Ya existe un proveedor con ese nombre';
    if (/ref/i.test(error.message)) return 'Ya existe un pedido con esa referencia';
    return 'Este registro ya existe';
  }
  if (error.code === '23503') return 'No se puede completar: hay registros relacionados que lo impiden';
  if (error.code === '42501') return 'No autorizado';
  if (error.code === '23514') return 'Algún valor no es válido (revisa importes y cantidades)';
  if (/fetch failed|network|ECONN|timeout/i.test(error.message)) {
    return 'Error de conexión. La operación no se ha completado; puedes reintentar con seguridad.';
  }
  return error.message;
}

/** Adjunta al resultado el identificador para el siguiente envío: nuevo si hubo éxito, el mismo si falló. */
export function withRequestId(fd: FormData, state: ActionState): ActionState {
  const current = String(fd.get('client_request_id') ?? '');
  return { ok: false, ...state, requestId: state?.ok ? randomUUID() : current || randomUUID() };
}

/** Registra el error en la tabla error_logs (sin datos sensibles) y devuelve un estado de error. */
export async function failure(supabase: SupabaseClient, context: string, error: PgError, details?: Record<string, unknown>): Promise<ActionState> {
  console.error(`[${context}]`, error.code, error.message);
  const expected = error.code === 'P0001' || error.code === 'P0002' || error.code === '23505';
  if (!expected) {
    await supabase.from('error_logs').insert({ context, message: error.message.slice(0, 1000), details: { code: error.code, ...details } });
  }
  return { ok: false, message: friendlyError(error) };
}

/** Versión esperada del registro (updated_at leído al abrir el formulario). */
export function expectedVersion(fd: FormData): string | null {
  const v = fd.get('expected_updated_at');
  return typeof v === 'string' && v ? v : null;
}

export const CONFLICT_MESSAGE =
  'Este registro se ha modificado desde otro dispositivo mientras lo editabas. No se ha guardado nada para no sobrescribir el cambio más reciente: revisa los datos actualizados y vuelve a guardar.';
