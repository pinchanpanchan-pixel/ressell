import { TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Badge, ButtonLink, Card, Chips, EmptyState, Notice, PageHeader, Row, SectionTitle } from '@/components/ui';
import { allocateBudget, buildInsight, rankInsights, type RankingKey, type Trend } from '@/lib/analytics';
import { getPlannerSettings, getProducts, getSummary } from '@/lib/data';
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

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const { orden } = await searchParams;
  const sort = (SORTS.find((s) => s.key === orden)?.key ?? 'recommended') as RankingKey;
  const [products, settings, summary] = await Promise.all([getProducts(), getPlannerSettings(), getSummary()]);
  const insights = products.map((p) => buildInsight(p, { coverageDays: settings.coverage_days, defaultLeadTimeDays: settings.default_lead_time_days, fallbackUnitCostCents: settings.unit_cost_cents }));
  const ranked = rankInsights(insights.filter((i) => i.product.purchased_qty > 0 || i.product.units_sold > 0), sort);

  const investable = applyBps(Math.max(summary.cash_cents, 0), settings.reinvest_bps);
  const budget = investable - applyBps(investable, settings.reserve_bps);
  const plan = allocateBudget(insights, budget, settings.supplier_shipping_cents + settings.other_order_costs_cents);
  const names = new Map(insights.map((i) => [i.product.id, i]));
  const totalSales = insights.reduce((t, i) => t + i.product.units_sold, 0);
  const prefill = plan.lines.map((l) => `${l.productId}:${l.units}`).join(',');

  return (
    <>
      <PageHeader title="Qué comprar" back="/finanzas" subtitle="Basado en tus ventas reales" />
      {totalSales < 10 && <div className="mb-4"><Notice tone="warn">Hay pocas ventas registradas ({totalSales}). Las recomendaciones son provisionales y se limitan a cantidades pequeñas.</Notice></div>}

      <SectionTitle>Próximo pedido sugerido</SectionTitle>
      <Card>
        <Row label="Presupuesto para reinvertir" value={formatEUR(budget)} hint={`${formatPct(settings.reinvest_bps / 10000)} de la caja menos ${formatPct(settings.reserve_bps / 10000)} de reserva`} />
        {plan.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {budget <= settings.supplier_shipping_cents ? 'El presupuesto no cubre el envío del proveedor.' : 'Ningún producto necesita reposición según los datos actuales.'}
          </p>
        ) : (
          <>
            <ul className="my-2 divide-y divide-line border-y border-line">
              {plan.lines.map((l) => {
                const i = names.get(l.productId)!;
                return (
                  <li key={l.productId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{productLabel(i.product)}</p>
                      <p className="text-xs text-faint">{l.units} × {formatEUR(l.unitCostCents)}{i.unitCostIsEstimate ? ' (estimado)' : ''}{i.recommendation.provisional ? ' · provisional' : ''}</p>
                    </div>
                    <span className="num text-sm">{formatEUR(l.costCents)}</span>
                  </li>
                );
              })}
            </ul>
            <Row label="Envío y otros costes del pedido" value={formatEUR(plan.fixedCostsCents)} />
            <Row label="Total estimado" value={formatEUR(plan.totalCents)} strong />
            <Row label="Quedaría en caja" value={formatEUR(summary.cash_cents - plan.totalCents)} />
            {plan.unitsShort > 0 && <p className="mt-1 text-xs text-warn">Faltan {plan.unitsShort} ud recomendadas que no caben en el presupuesto.</p>}
            <ButtonLink href={`/pedidos/nuevo?prefill=${prefill}`} full className="mt-3">Preparar este pedido</ButtonLink>
            <p className="mt-2 text-center text-xs text-faint">Se abre como borrador para revisarlo. No se registra ninguna compra automáticamente.</p>
          </>
        )}
      </Card>

      <SectionTitle>Ranking de productos</SectionTitle>
      <Chips active={sort} items={SORTS.map((s) => ({ key: s.key, label: s.label, href: `/analisis?orden=${s.key}` }))} />
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
        Se recomienda cubrir el plazo de reposición más {settings.coverage_days} días, restando el stock y lo que ya está en camino. Con menos de 5 ventas o 21 días de historial, la cantidad se limita.
      </p>
    </>
  );
}
