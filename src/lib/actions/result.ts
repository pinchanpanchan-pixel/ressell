export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Identificador de operación que debe usar el siguiente envío del formulario. */
  requestId?: string;
  /** Nueva versión (updated_at) del registro guardado, para detectar cambios simultáneos. */
  version?: string;
} | null;
