import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('rounded-[var(--radius-card)] border border-line bg-card p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3 pt-2">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <span aria-hidden>‹</span> Volver
          </Link>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone = 'default', className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'positive' | 'negative'; className?: string }) {
  return (
    <Card className={cx('flex flex-col gap-1', className)}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx('num text-xl font-semibold', tone === 'positive' && 'text-sage', tone === 'negative' && 'text-danger')}>{value}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </Card>
  );
}

export function Row({ label, value, strong, tone, hint }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'positive' | 'negative'; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className={cx('text-sm', strong ? 'font-medium text-ink' : 'text-muted')}>{label}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      <div className={cx('num shrink-0 text-right text-sm', strong && 'text-base font-semibold', tone === 'positive' && 'text-sage', tone === 'negative' && 'text-danger')}>{value}</div>
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-white/5 text-muted',
  positive: 'bg-sage/15 text-sage',
  warn: 'bg-warn/15 text-warn',
  negative: 'bg-danger/15 text-danger',
  info: 'bg-[#7fa3c9]/15 text-[#a9c4e0]',
};
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', badgeTones[tone])}>{children}</span>;
}

const buttonVariants = {
  primary: 'bg-sage text-sage-ink hover:bg-sage-hi',
  secondary: 'bg-card-hi text-ink hover:bg-[#45546a] border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-white/5',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
};
type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = 'primary', size: 'md' | 'lg' | 'sm' = 'md', full = false) {
  return cx(
    'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    size === 'lg' && 'min-h-14 px-5 text-base',
    size === 'md' && 'min-h-12 px-4 text-[15px]',
    size === 'sm' && 'min-h-9 rounded-xl px-3 text-sm',
    full && 'w-full',
    buttonVariants[variant],
  );
}

export function ButtonLink({ href, variant, size, full, children, className }: { href: string; variant?: ButtonVariant; size?: 'md' | 'lg' | 'sm'; full?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size, full), className)}>
      {children}
    </Link>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'negative' | 'positive' }) {
  const tones = {
    info: 'border-line bg-white/[0.03] text-muted',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    negative: 'border-danger/30 bg-danger/10 text-danger',
    positive: 'border-sage/30 bg-sage/10 text-sage',
  };
  return <div className={cx('rounded-2xl border px-4 py-3 text-sm leading-relaxed', tones[tone])}>{children}</div>;
}

export function Chips({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={cx(
            'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors',
            i.key === active ? 'border-sage/40 bg-sage/15 text-sage' : 'border-line text-muted hover:text-ink',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
