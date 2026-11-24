import { TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Badge, ButtonLink, Card, Chips, EmptyState, Notice, PageHeader, Row, SectionTitle } from '@/components/ui';
import { buildInsight, rankInsights, type RankingKey, type Trend } from '@/lib/analytics';
import { getLastSupplierPrices, getOrders, getPlannerSettings, getProducts, getSales, getSummary } from '@/lib/data';
import { buildProposal, computeSalesStats, estimateProduct, FOCUS_LABEL, type Focus } from '@/lib/proposals';
import { applyBps, formatEUR, formatPct } from '@/lib/money';
import { productLabel } from '@/lib/types';

export const metadata = { title: 'Análisis' };

const SORTS: { key: RankingKey; label: string }[] = [
  { key: 'recommended', label: 'Recomendado' },
  { key: 'units', label: 'Más vendidos' },
  { key: 'velocity', label: 'Más rápidos' },
  { key: 'profit', label: 'Más beneficio' },
  { key: 'margin', label: 'Mejor margen' },
  { key: 'recent', label: 'Demanda reciente' },
];

const TREND: Record<Trend, { label: string; tone: 'positive' | 'negative' | 'neutral' | 'info' }> = {
  up: { label: 'Al alza', tone: 'positive' },
  down: { label: 'A la baja', tone: 'negative' },
  flat: { label: 'Estable', tone: 'neutral' },
  new: { label: 'Nuevo', tone: 'info' },
  insufficient: { label: 'Pocos datos', tone: 'neutral' },
};

const n1 = (v: number) => v.toFixed(1).replace('.', ',');
const FOCUSES: Focus[] = ['balanced', 'profit', 'speed', 'new'];

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ orden?: string; enfoque?: string }> }) {
  const { orden, enfoque } = await searchParams;
  const focus = (FOCUSES.find((f) => f === enfoque) ?? 'balanced') as Focus;
  const sort = (SORTS.find((s) => s.key === orden)?.key ?? 'recommended') as RankingKey;
  const [products, settings, summary, sales, orders, lastPrices] = await Promise.all([
    getProducts(), getPlannerSettings(), getSummary(), getSales({ limit: 1000 }), getOrders(), getLastSupplierPrices(),
  ]);
  const insights = products.map((p) => buildInsight(p, { coverageDays: settings.coverage_days, defaultLeadTimeDays: settings.default_lead_time_days, fallbackUnitCostCents: settings.unit_cost_cents }));
  const ranked = rankInsights(insights.filter((i) => i.product.purchased_qty > 0 || i.product.units_sold > 0), sort);

  const investable = applyBps(Math.max(summary.cash_cents, 0), settings.reinvest_bps);
  const budget = investable - applyBps(investable, settings.reserve_bps);
  const totalSales = insights.reduce((t, i) => t + i.product.units_sold, 0);

  const stats = computeSalesStats(products, sales, orders);
  const estimates = products.map((p) => estimateProduct(p, stats, lastPrices, settings.unit_cost_cents));
  // Con historial, el envío se reparte por unidad; sin historial se usa el envío fijo por pedido de Ajustes.
  const fixed = settings.other_order_costs_cents + (stats.shippingPerUnitCents == null ? settings.supplier_shipping_cents : 0);
  const proposal = buildProposal(focus, estimates, budget, { fixedOrderCostsCents: fixed, shippingPerUnitCents: stats.shippingPerUnitCents ?? 0 });
  const prefill = proposal.lines.map((l) => `${l.product.id}:${l.units}:${l.supplierPriceCents}`).join(',');

  return (
    <>
      <PageHeader title="Qué comprar" back="/finanzas" subtitle="Basado en tus ventas reales" />
      {totalSales < 10 && <div className="mb-4"><Notice tone="warn">Hay pocas ventas registradas ({totalSales}). Las recomendaciones son provisionales y se limitan a cantidades pequeñas.</Notice></div>}

      <SectionTitle>Análisis de ventas</SectionTitle>
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-base font-semibold">{stats.units}</p><p className="text-[11px] text-faint">ud vendidas</p></div>
          <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-base font-semibold">{formatEUR(stats.profitCents)}</p><p className="text-[11px] text-faint">beneficio</p></div>
          <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-base font-semibold">{formatPct(stats.marginRatio)}</p><p className="text-[11px] text-faint">margen</p></div>
        </div>
        <div className="mt-2">
          <Row label="Precio cobrado frente al previsto" value={stats.priceRealization != null ? formatPct(stats.priceRealization) : '—'} hint="Mediana de tus ventas: 100 % = vendes al precio que pones como previsto" />
          <Row label="Días medios hasta vender" value={stats.avgDaysToSell != null ? `${n1(stats.avgDaysToSell)} días` : '—'} hint="Desde que recibes el producto" />
          <Row label="Gastos de venta por unidad" value={formatEUR(stats.sellingCostPerUnitCents)} hint="Destacados, envíos asumidos y otros" />
          <Row label="Envío del proveedor por unidad" value={stats.shippingPerUnitCents != null ? formatEUR(stats.shippingPerUnitCents) : '—'} hint={stats.ordersInHistory ? `Según tus ${stats.ordersInHistory} pedidos pagados o recibidos` : 'Aún no hay pedidos pagados'} />
        </div>
      </Card>
      {stats.byCategory.some((c) => c.units > 0) && (
        <Card className="mt-3 py-1">
          <p className="pt-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">Por categoría</p>
          <ul className="divide-y divide-line">
            {stats.byCategory.filter((c) => c.units > 0).map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0"><p className="font-medium">{c.category}</p><p className="text-xs text-faint">{c.units} ud · {c.avgDaysToSell != null ? `${n1(c.avgDaysToSell)} días hasta vender` : 'sin datos de rapidez'}</p></div>
                <div className="text-right"><p className="num font-semibold">{formatEUR(c.profitCents)}</p><p className="num text-xs text-faint">margen {formatPct(c.marginRatio)}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stats.byChannel.length > 0 && (
        <Card className="mt-3 py-1">
          <p className="pt-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">Por canal</p>
          <ul className="divide-y divide-line">
            {stats.byChannel.map((c) => (
              <li key={c.channel} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div><p className="font-medium">{c.channel}</p><p className="text-xs text-faint">{c.units} ud · {formatEUR(c.revenueCents)} facturados</p></div>
                <p className="num font-semibold">{formatEUR(c.profitCents)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionTitle>Propuesta de pedido con toda la caja</SectionTitle>
      <Chips active={focus} items={FOCUSES.map((f) => ({ key: f, label: FOCUS_LABEL[f].label, href: `/analisis?enfoque=${f}&orden=${sort}` }))} />
      <Card>
        <p className="mb-2 text-sm text-muted">{FOCUS_LABEL[focus].description}</p>
        <Row label="Dinero para el pedido" value={formatEUR(budget)} hint={`${formatPct(settings.reinvest_bps / 10000)} de la caja${settings.reserve_bps ? ` menos ${formatPct(settings.reserve_bps / 10000)} de reserva` : ''}`} />
        {proposal.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{proposal.reason}</p>
        ) : (
          <>
            <ul className="my-2 divide-y divide-line border-y border-line">
              {proposal.lines.map((l) => (
                <li key={l.product.id} className="py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium">{l.units} × {productLabel(l.product)}</p>
                    <span className="num shrink-0 text-sm">{formatEUR(l.units * l.landedCostCents)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-faint">
                    Compra {formatEUR(l.supplierPriceCents)} + envío ≈ {formatEUR(l.landedCostCents)}/ud · venta {l.salePriceCents != null ? formatEUR(l.salePriceCents) : '—'}{l.priceIsEstimate ? ' (estimada)' : ''} · beneficio {l.profitPerUnitCents != null ? formatEUR(l.profitPerUnitCents) : '—'}/ud
                    {l.daysToSell != null && ` · ~${Math.round(l.daysToSell)} días${l.daysAreEstimate ? ' (estimado)' : ''}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {l.neverBought && <Badge tone="info">Nuevo</Badge>}
                    {l.product.stock_qty > 0 && <Badge>Tienes {l.product.stock_qty} en stock</Badge>}
                  </div>
                </li>
              ))}
            </ul>
            <Row label="Productos" value={formatEUR(proposal.goodsCents)} />
            <Row label="Envío del proveedor estimado" value={formatEUR(proposal.shippingCents + proposal.extrasCents + proposal.fixedCents)} />
            <Row label="Total estimado" value={formatEUR(proposal.totalCents)} strong />
            <Row label="Quedaría en caja" value={formatEUR(summary.cash_cents - proposal.totalCents)} />
            <Row label="Facturación si se vende todo" value={formatEUR(proposal.revenueCents)} />
            <Row label="Beneficio estimado si se vende todo" value={formatEUR(proposal.profitCents)} strong tone={proposal.profitCents >= 0 ? 'positive' : 'negative'} />
            <ButtonLink href={`/pedidos/nuevo?prefill=${prefill}${proposal.shippingCents > 0 ? `&envio=${proposal.shippingCents}` : ''}`} full className="mt-3">Preparar este pedido</ButtonLink>
            <p className="mt-2 text-center text-xs text-faint">Se abre como pedido nuevo para revisarlo. No se compra nada automáticamente.</p>
          </>
        )}
      </Card>

      <SectionTitle>Ranking de productos</SectionTitle>
      <Chips active={sort} items={SORTS.map((s) => ({ key: s.key, label: s.label, href: `/analisis?orden=${s.key}&enfoque=${focus}` }))} />
      {ranked.length === 0 ? (
        <EmptyState title="Sin datos todavía" text="El ranking aparece cuando recibes pedidos y registras ventas." />
      ) : (
        <ol className="grid gap-2">
          {ranked.map((i, idx) => {
            const p = i.product;
            const t = TREND[i.trend];
            return (
              <li key={p.id}>
                <Link href={`/stock/${p.id}`}>
                  <Card className="transition-colors hover:bg-card-hi">
                    <div className="flex items-start gap-3">
                      <span className="num mt-0.5 w-5 shrink-0 text-sm text-faint">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-medium">{productLabel(p)}</p>
                          {i.recommendation.units > 0
                            ? <span className="num shrink-0 rounded-full bg-sage/15 px-2.5 py-0.5 text-sm font-semibold text-sage">+{i.recommendation.units}</span>
                            : <span className="shrink-0 text-xs text-faint">No reponer</span>}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          {[['7 d', p.sold_7d], ['30 d', p.sold_30d], ['90 d', p.sold_90d]].map(([l, v]) => (
                            <div key={l} className="rounded-xl bg-graphite-deep/50 py-1.5"><p className="num text-sm font-semibold">{v}</p><p className="text-[11px] text-faint">{l}</p></div>
                          ))}
                        </div>
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="flex justify-between"><dt className="text-muted">Beneficio</dt><dd className="num">{formatEUR(p.profit_cents)}</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Margen/ud</dt><dd className="num">{i.profitPerUnitCents != null ? formatEUR(i.profitPerUnitCents) : '—'}</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Rentabilidad</dt><dd className="num">{formatPct(i.marginRatio)}</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Ritmo</dt><dd className="num">{n1(i.weeklyRate)} ud/sem</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Días a venta</dt><dd className="num">{p.avg_days_to_sell != null ? n1(Number(p.avg_days_to_sell)) : '—'}</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Rotación</dt><dd className="num">{formatPct(i.sellThrough)}</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Stock</dt><dd className="num">{p.stock_qty} ud</dd></div>
                          <div className="flex justify-between"><dt className="text-muted">Inmovilizado</dt><dd className="num">{formatEUR(i.capitalTiedCents)}</dd></div>
                        </dl>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Badge tone={t.tone}>{i.trend === 'up' ? <TrendingUp className="mr-1 size-3" /> : i.trend === 'down' ? <TrendingDown className="mr-1 size-3" /> : null}{t.label}</Badge>
                          {i.dataQuality !== 'reliable' && <Badge tone="warn">{i.dataQuality === 'none' ? 'Sin ventas' : 'Provisional'}</Badge>}
                        </div>
                        <p className="mt-2 text-xs text-faint">{i.recommendation.reason}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 px-1 text-xs leading-relaxed text-faint">
        Cómo se calcula: el ritmo mezcla las ventas netas de 7, 30 y 90 días (pesa más el último mes) con una ventana mínima de 14 días para productos nuevos.
        Se recomienda cubrir el plazo de reposición más {settings.coverage_days} días, restando el stock y lo que ya está en camino (solo pedidos pagados). Con menos de 5 ventas o 21 días de historial, la cantidad se limita.
      </p>
      <p className="mt-2 px-1 text-xs leading-relaxed text-faint">
        Propuestas: el coste de cada unidad incluye el envío del proveedor por unidad según tus pedidos reales. Para productos sin ventas, el precio se estima con su precio previsto
        ajustado a lo que de verdad cobras ({stats.priceRealization != null ? formatPct(stats.priceRealization) : '100 %'}), la rapidez con la media de su categoría y los gastos de venta con tu media por unidad.
        Lo que ya tienes en stock pesa menos para no acumular. Cada producto elegido recibe al menos una unidad y el resto del dinero va a los mejores, hasta que no cabe ninguna unidad más.
      </p>
    </>
  );
}
