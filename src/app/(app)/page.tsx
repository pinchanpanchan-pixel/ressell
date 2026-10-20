import { randomUUID } from 'node:crypto';
import { ChartLine, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { CapitalChart } from '@/components/capital-chart';
import { LedgerEntryForm } from '@/components/ledger-form';
import { ButtonLink, Card, Row, SectionTitle, Stat } from '@/components/ui';
import { buildInsight, rankInsights } from '@/lib/analytics';
import { getCapitalSeries, getPlannerSettings, getProducts, getSummary } from '@/lib/data';
import { formatDate, todayISO } from '@/lib/dates';
import { formatEUR } from '@/lib/money';
import { productLabel } from '@/lib/types';

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function Dashboard() {
  const [s, series, products, settings] = await Promise.all([getSummary(), getCapitalSeries(), getProducts(), getPlannerSettings()]);
  const today = todayISO();
  const insights = products.map((p) => buildInsight(p, { coverageDays: settings.coverage_days, defaultLeadTimeDays: settings.default_lead_time_days, fallbackUnitCostCents: settings.unit_cost_cents }));
  const featured = rankInsights(insights, 'velocity').filter((i) => i.product.units_sold > 0 || i.product.stock_qty > 0).slice(0, 4);
  const toBuy = rankInsights(insights, 'recommended').filter((i) => i.recommendation.units > 0).slice(0, 3);
  const noCapital = s.capital_contributed_cents === 0 && s.cash_cents === 0;

  return (
    <>
      <p className="mt-4 px-1 text-sm text-muted">{capitalize(formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>

      <Card className="mt-3 bg-gradient-to-br from-card to-[#2c3644] p-5">
        <p className="text-sm text-muted">Dinero disponible</p>
        <p className="num mt-1 text-[40px] font-semibold leading-none tracking-tight">{formatEUR(s.cash_cents)}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span>Capital aportado <b className="num font-medium text-ink">{formatEUR(s.capital_contributed_cents)}</b></span>
          <span>Reinvertido <b className="num font-medium text-ink">{formatEUR(s.reinvested_cents)}</b></span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <ButtonLink href="/ventas/nueva" size="lg"><ShoppingCart className="size-5" />Venta</ButtonLink>
        <ButtonLink href="/pedidos/nuevo" size="lg" variant="secondary"><Plus className="size-5" />Pedido</ButtonLink>
      </div>

      {noCapital && (
        <>
          <SectionTitle>Primer paso</SectionTitle>
          <Card>
            <p className="mb-4 text-sm text-muted">Registra el capital con el que empiezas. Es la base para calcular la caja y la reinversión.</p>
            <LedgerEntryForm requestId={randomUUID()} today={today} initialOnly />
          </Card>
        </>
      )}

      <SectionTitle>Resumen</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Ventas acumuladas" value={formatEUR(s.revenue_cents)} hint={`${s.units_sold} ud vendidas`} />
        <Stat label="Beneficio neto" value={formatEUR(s.net_profit_cents)} tone={s.net_profit_cents >= 0 ? 'positive' : 'negative'} hint={`Bruto ${formatEUR(s.gross_profit_cents)}`} />
        <Stat label="En stock" value={`${s.units_in_stock} ud`} hint={plural(s.products_in_stock, 'producto', 'productos')} />
        <Link href="/pedidos?estado=open"><Stat label="Pedidos pendientes" value={s.pending_orders} hint={s.incoming_units ? `${s.incoming_units} ud en camino` : 'Ninguna unidad en camino'} className="h-full" /></Link>
      </div>

      <Card className="mt-3">
        <Row label="Inventario a coste" value={formatEUR(s.inventory_cost_cents)} hint="Dinero inmovilizado en stock" />
        <Row label="Valor potencial de venta" value={formatEUR(s.inventory_potential_cents)} hint="Si se vendiera todo al precio previsto" />
        <p className="mt-1 text-xs text-faint">El inventario no se suma al dinero disponible.</p>
      </Card>

      <SectionTitle action={<Link href="/finanzas" className="text-sm text-sage">Finanzas</Link>}>Evolución del capital</SectionTitle>
      <Card>
        <CapitalChart data={series} />
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-sage" />Caja</span>
          <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t border-dashed border-muted" />Caja + stock a coste</span>
        </div>
      </Card>

      <SectionTitle action={<Link href="/analisis" className="text-sm text-sage">Ver análisis</Link>}>Qué comprar</SectionTitle>
      <Card>
        {toBuy.length === 0 ? (
          <p className="flex items-start gap-3 text-sm text-muted"><Sparkles className="mt-0.5 size-4 shrink-0 text-sage" />
            {s.units_sold === 0 ? 'Las recomendaciones aparecerán cuando registres tus primeras ventas.' : 'Ahora mismo el stock cubre la demanda estimada. No hace falta reponer.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {toBuy.map((i) => (
              <li key={i.product.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{productLabel(i.product)}</p>
                  <p className="text-xs text-faint">{i.recommendation.provisional ? 'Provisional · ' : ''}{i.weeklyRate.toFixed(1).replace('.', ',')} ud/semana</p>
                </div>
                <span className="num shrink-0 rounded-full bg-sage/15 px-3 py-1 text-sm font-semibold text-sage">+{i.recommendation.units}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionTitle action={<Link href="/stock" className="text-sm text-sage">Stock</Link>}>Productos destacados</SectionTitle>
      {featured.length === 0 ? (
        <Card><p className="text-sm text-muted">Todavía no hay productos con stock o ventas. <Link className="text-sage" href="/stock/nuevo">Añade el primero</Link>.</p></Card>
      ) : (
        <div className="grid gap-2">
          {featured.map((i) => (
            <Link key={i.product.id} href={`/stock/${i.product.id}`}>
              <Card className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-card-hi">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{productLabel(i.product)}</p>
                  <p className="text-xs text-faint">{plural(i.product.sold_30d, 'vendida', 'vendidas')} en 30 días · {i.product.stock_qty} en stock</p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-semibold">{formatEUR(i.product.profit_cents)}</p>
                  <p className="text-xs text-faint">beneficio</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <SectionTitle>Más indicadores</SectionTitle>
      <Card>
        <Row label="Gastos acumulados" value={formatEUR(s.expenses_total_cents)} hint="Comisiones, envíos asumidos y gastos generales" />
        <Row label="Cobros pendientes" value={formatEUR(s.pending_collections_cents)} />
        <Row label="Envíos de clientes pendientes" value={s.pending_deliveries} />
        <Row label="Pagos a proveedores pendientes" value={formatEUR(s.pending_payments_cents)} />
      </Card>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ButtonLink href="/analisis" variant="secondary"><ChartLine className="size-4" />Ranking</ButtonLink>
        <ButtonLink href="/planificador" variant="secondary"><Sparkles className="size-4" />Planificador</ButtonLink>
      </div>
    </>
  );
}
