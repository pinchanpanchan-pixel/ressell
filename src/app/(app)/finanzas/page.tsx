import { randomUUID } from 'node:crypto';
import { ChartLine, Download, Sparkles } from 'lucide-react';
import { LedgerEntryForm } from '@/components/ledger-form';
import { ReverseEntryButton } from '@/components/reverse-entry';
import { ButtonLink, Card, Chips, PageHeader, Row, SectionTitle } from '@/components/ui';
import { getLedger, getSummary } from '@/lib/data';
import { formatDate, todayISO } from '@/lib/dates';
import { LEDGER_LABEL, MANUAL_LEDGER_CATEGORIES } from '@/lib/labels';
import { formatEUR } from '@/lib/money';
import type { LedgerCategory } from '@/lib/types';

export const metadata = { title: 'Finanzas' };

const FILTERS: { key: string; label: string; cats?: LedgerCategory }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'sale_income', label: 'Ventas', cats: 'sale_income' },
  { key: 'supplier_payment', label: 'Proveedores', cats: 'supplier_payment' },
  { key: 'expense', label: 'Gastos', cats: 'expense' },
  { key: 'platform_fee', label: 'Comisiones', cats: 'platform_fee' },
  { key: 'customer_refund', label: 'Devoluciones', cats: 'customer_refund' },
  { key: 'withdrawal', label: 'Retiradas', cats: 'withdrawal' },
];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat = 'all' } = await searchParams;
  const filter = FILTERS.find((f) => f.key === cat);
  const [s, ledger, all] = await Promise.all([getSummary(), getLedger(filter?.cats), getLedger()]);
  const reversed = new Set(all.map((e) => e.reverses_entry_id).filter(Boolean));
  const hasInitial = all.some((e) => e.category === 'initial_capital' && !reversed.has(e.id) && !e.reverses_entry_id);
  const manual = new Set<string>(MANUAL_LEDGER_CATEGORIES);

  return (
    <>
      <PageHeader title="Finanzas" subtitle={`Dinero disponible: ${formatEUR(s.cash_cents)}`} />
      <div className="grid grid-cols-2 gap-3">
        <ButtonLink href="/analisis" variant="secondary"><ChartLine className="size-4" />Análisis</ButtonLink>
        <ButtonLink href="/planificador" variant="secondary"><Sparkles className="size-4" />Planificador</ButtonLink>
      </div>

      <SectionTitle>Resultado</SectionTitle>
      <Card>
        <Row label="Facturación" value={formatEUR(s.revenue_cents)} hint="Ventas confirmadas, neto de descuentos y reembolsos" />
        <Row label="Coste de lo vendido" value={`−${formatEUR(s.cogs_cents)}`} hint="Coste real de adquisición" />
        <Row label="Beneficio bruto" value={formatEUR(s.gross_profit_cents)} strong />
        <Row label="Comisiones, envíos y otros de venta" value={`−${formatEUR(s.selling_costs_cents)}`} />
        <Row label="Gastos generales" value={`−${formatEUR(s.general_expenses_cents)}`} />
        <Row label="Pérdidas por bajas" value={`−${formatEUR(s.write_off_losses_cents)}`} />
        <div className="my-1 border-t border-line" />
        <Row label="Beneficio neto estimado" value={formatEUR(s.net_profit_cents)} strong tone={s.net_profit_cents >= 0 ? 'positive' : 'negative'} />
      </Card>

      <SectionTitle>Caja y capital</SectionTitle>
      <Card>
        <Row label="Capital inicial" value={formatEUR(s.initial_capital_cents)} />
        <Row label="Capital aportado total" value={formatEUR(s.capital_contributed_cents)} />
        <Row label="Pagado a proveedores" value={formatEUR(s.purchases_paid_cents)} hint="Inversión en stock, no es gasto" />
        <Row label="Dinero reinvertido" value={formatEUR(s.reinvested_cents)} hint="Compras pagadas con beneficios, más allá del capital aportado" />
        <Row label="Retiradas" value={formatEUR(s.withdrawals_cents)} />
        <Row label="Cobros pendientes" value={formatEUR(s.pending_collections_cents)} />
        <div className="my-1 border-t border-line" />
        <Row label="Dinero disponible" value={formatEUR(s.cash_cents)} strong />
        <Row label="Inventario a coste (aparte)" value={formatEUR(s.inventory_cost_cents)} />
      </Card>

      <SectionTitle>Nuevo movimiento</SectionTitle>
      <Card>
        <p className="mb-4 text-sm text-muted">Las ventas y los pagos a proveedores se registran solos. Aquí: capital, gastos, retiradas, reembolsos de proveedor y ajustes.</p>
        <LedgerEntryForm requestId={randomUUID()} today={todayISO()} hasInitial={hasInitial} />
      </Card>

      <SectionTitle action={
        <a href="/api/export?format=csv&table=ledger" className="flex items-center gap-1 text-sm text-sage"><Download className="size-4" />CSV</a>
      }>Libro de movimientos</SectionTitle>
      <Chips active={cat} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === 'all' ? '/finanzas' : `/finanzas?cat=${f.key}` }))} />
      <Card className="py-1">
        {ledger.length === 0 ? <p className="py-4 text-sm text-muted">Sin movimientos.</p> : (
          <ul className="divide-y divide-line">
            {ledger.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.description}</p>
                  <p className="text-xs text-faint">{formatDate(e.entry_date)} · {LEDGER_LABEL[e.category]}{e.reverses_entry_id ? ' · anulación' : ''}{reversed.has(e.id) ? ' · anulado' : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`num text-sm font-medium ${e.amount_cents > 0 ? 'text-sage' : ''}`}>{formatEUR(e.amount_cents, { sign: true })}</span>
                  {manual.has(e.category) && !e.reverses_entry_id && !reversed.has(e.id) && !e.sale_id && !e.purchase_order_id && <ReverseEntryButton id={e.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
