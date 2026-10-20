/**
 * Utilidades monetarias. Todo el dinero se maneja como céntimos enteros:
 * nunca se suman ni multiplican euros con decimales en coma flotante.
 */
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eurCompact = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatEUR(cents: number | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const value = Number(cents ?? 0);
  const text = (opts.compact && Math.abs(value) >= 100000 ? eurCompact : eur).format(value / 100);
  return opts.sign && value > 0 ? `+${text}` : text;
}

/** Convierte "17,50", "17.50", "1.234,56" o "1234" a céntimos. Devuelve null si no es válido. */
export function parseEuroToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s|€/g, '');
  if (s === '') return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Céntimos a texto editable con coma decimal ("17,50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Multiplica céntimos por puntos básicos (1 % = 100 bps) con redondeo al céntimo. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10000);
}

export function formatPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
}
