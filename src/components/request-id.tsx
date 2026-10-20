import type { ActionState } from '@/lib/actions/result';

/**
 * Identificador de operación para idempotencia: se mantiene mientras la operación no se
 * completa (los reintentos no duplican) y el servidor entrega uno nuevo tras un éxito.
 */
export function useRequestId(state: ActionState, initial: string) {
  return state?.requestId ?? initial;
}
