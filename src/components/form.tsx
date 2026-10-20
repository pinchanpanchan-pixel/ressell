'use client';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/actions/result';
import { buttonClass, cx, Notice } from './ui';

const control =
  'w-full rounded-2xl border border-line bg-graphite-deep/60 px-4 text-[16px] text-ink placeholder:text-faint focus:border-sage/60 focus:outline-none disabled:opacity-60';

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-sm text-muted">{label}</span>
        {children}
      </label>
      {error ? <span role="alert" className="px-1 text-xs text-danger">{error}</span> : hint ? <span className="px-1 text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(control, 'min-h-12', props.className)} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={3} {...props} className={cx(control, 'py-3', props.className)} />;
}

export function Select({ children, ...props }: ComponentProps<'select'>) {
  return (
    <select {...props} className={cx(control, 'min-h-12 appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10', props.className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23A7B4C6' stroke-width='1.6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

/** Importe en euros: texto con teclado decimal; el servidor lo convierte a céntimos. */
export function MoneyInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <input type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" {...props} className={cx(control, 'num min-h-12 pr-10', props.className)} />
      <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">€</span>
    </div>
  );
}

export function SubmitButton({ children, pendingText = 'Guardando…', variant = 'primary', size = 'lg', full = true, name, value, disabled }: { children: ReactNode; pendingText?: string; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'md' | 'lg' | 'sm'; full?: boolean; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={buttonClass(variant, size, full)}>
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return <Notice tone={state.ok ? 'positive' : 'negative'}>{state.message}</Notice>;
}

/** Botón que pide una segunda pulsación antes de enviar (para acciones con consecuencias). */
export function ConfirmSubmit({ children, confirmText, variant = 'secondary', size = 'md' }: { children: ReactNode; confirmText: string; variant?: 'primary' | 'secondary' | 'danger'; size?: 'md' | 'lg' | 'sm' }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonClass(variant, size, true)}>
        {children}
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => setArmed(false)} className={buttonClass('ghost', size, false)} disabled={pending}>
        No
      </button>
      <button type="submit" className={cx(buttonClass(variant === 'danger' ? 'danger' : 'primary', size, true))} disabled={pending} aria-busy={pending}>
        {pending ? 'Procesando…' : confirmText}
      </button>
    </div>
  );
}
