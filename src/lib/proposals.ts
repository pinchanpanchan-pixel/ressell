/**
 * Análisis de ventas y propuestas de pedido que usan toda la caja disponible.
 *
 * Para productos que aún no se han vendido se estima con datos de los que sí:
 * - Precio: precio previsto × lo que de verdad cobras respecto a lo previsto en tus ventas.
 * - Rapidez: días medios hasta vender de su categoría (o de todo, si la categoría no tiene ventas).
 * - Gastos de venta (destacado, envío, otros): media por unidad de tus ventas.
 * El coste de compra incluye el envío del proveedor por unidad según tus pedidos reales.
 */
import { estimateDailyRate } from './analytics';
import type { ProductMetrics, PurchaseOrderOverview, SaleOverview } from './types';

export type Focus = 'balanced' | 'profit' | 'speed' | 'new';

export const FOCUS_LABEL: Record<Focus, { label: string; description: string }> = {
  balanced: { label: 'Equilibrado', description: 'Mezcla beneficio y rapidez: lo que más dinero deja por día de espera.' },
  profit: { label: 'Más dinero', description: 'Prioriza los productos que más beneficio dejan por unidad.' },
  speed: { label: 'Más rápido', description: 'Prioriza lo que menos tarda en venderse, para recuperar la caja antes.' },
  new: { label: 'Productos nuevos', description: 'Solo productos que nunca has comprado, para probar catálogo nuevo.' },
};

export interface CategoryStats {
  category: string;
  units: number;
  revenueCents: number;
  profitCents: number;
  marginRatio: number | null;
  avgDaysToSell: number | null;
  dailyRate: number;
}

export interface SalesStats {
  salesCount: number;
  units: number;
  revenueCents: number;
  profitCents: number;
  marginRatio: number | null;
  /** Lo que cobras de verdad respecto al precio previsto (1 = igual). */
  priceRealization: number | null;
  sellingCostPerUnitCents: number;
  avgDaysToSell: number | null;
  shippingPerUnitCents: number | null;
  extrasPerUnitCents: number | null;
  ordersInHistory: number;
  byCategory: CategoryStats[];
  byChannel: { channel: string; units: number; revenueCents: number; profitCents: number }[];
}

const NO_CATEGORY = 'Sin categoría';
const catOf = (p: { category: string | null }) => p.category?.trim() || NO_CATEGORY;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function computeSalesStats(products: ProductMetrics[], sales: SaleOverview[], orders: PurchaseOrderOverview[]): SalesStats {
  const confirmed = sales.filter((s) => s.status === 'confirmed');
  const units = confirmed.reduce((t, s) => t + s.quantity - s.returned_quantity, 0);
  const revenue = confirmed.reduce((t, s) => t + s.revenue_cents - s.refunded_cents, 0);
  const profit = confirmed.reduce((t, s) => t + s.profit_cents, 0);
  const selling = confirmed.reduce((t, s) => t + s.platform_fee_cents + s.shipping_cost_cents + s.other_costs_cents, 0);

  const byId = new Map(products.map((p) => [p.id, p]));
  // Precio cobrado frente al previsto, venta a venta. Se usa la mediana para que una venta
  // excepcional (un regalo, un precio familiar…) no distorsione la estimación.
  const ratios: number[] = [];
  for (const s of confirmed) {
    const p = byId.get(s.product_id);
    const n = s.quantity - s.returned_quantity;
    if (!p?.expected_price_cents || n <= 0) continue;
    ratios.push((s.revenue_cents - s.refunded_cents) / s.quantity / p.expected_price_cents);
  }
  ratios.sort((a, b) => a - b);
  const median = ratios.length === 0 ? null
    : ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2;

  const sold = products.filter((p) => p.units_sold > 0);
  const daysWeighted = sold.filter((p) => p.avg_days_to_sell != null);
  const daysUnits = daysWeighted.reduce((t, p) => t + p.units_sold, 0);
  const avgDays = daysUnits > 0 ? daysWeighted.reduce((t, p) => t + Number(p.avg_days_to_sell) * p.units_sold, 0) / daysUnits : null;

  // Envío y otros costes del proveedor por unidad, según pedidos pagados o recibidos.
  const real = orders.filter((o) => o.status !== 'cancelled' && (o.paid_at || o.received_at) && o.total_units > 0);
  const histUnits = real.reduce((t, o) => t + o.total_units, 0);
  const shippingPerUnit = histUnits > 0 ? Math.round(real.reduce((t, o) => t + o.shipping_cents, 0) / histUnits) : null;
  const extrasPerUnit = histUnits > 0 ? Math.round(real.reduce((t, o) => t + o.packaging_cents + o.other_costs_cents - o.discount_cents, 0) / histUnits) : null;

  const cats = new Map<string, ProductMetrics[]>();
  for (const p of products) cats.set(catOf(p), [...(cats.get(catOf(p)) ?? []), p]);
  const byCategory: CategoryStats[] = [...cats.entries()].map(([category, ps]) => {
    const s = ps.filter((p) => p.units_sold > 0);
    const u = s.reduce((t, p) => t + p.units_sold, 0);
    const rev = s.reduce((t, p) => t + p.revenue_cents, 0);
    const pr = s.reduce((t, p) => t + p.profit_cents, 0);
    const dw = s.filter((p) => p.avg_days_to_sell != null);
    const du = dw.reduce((t, p) => t + p.units_sold, 0);
    return {
      category,
      units: u,
      revenueCents: rev,
      profitCents: pr,
      marginRatio: rev > 0 ? pr / rev : null,
      avgDaysToSell: du > 0 ? dw.reduce((t, p) => t + Number(p.avg_days_to_sell) * p.units_sold, 0) / du : null,
      dailyRate: s.length > 0 ? s.reduce((t, p) => t + estimateDailyRate(p), 0) / s.length : 0,
    };
  }).sort((a, b) => b.units - a.units || b.profitCents - a.profitCents);

  const channels = new Map<string, { units: number; revenueCents: number; profitCents: number }>();
  for (const s of confirmed) {
    const k = s.channel?.trim() || 'Sin canal';
    const c = channels.get(k) ?? { units: 0, revenueCents: 0, profitCents: 0 };
    c.units += s.quantity - s.returned_quantity;
    c.revenueCents += s.revenue_cents - s.refunded_cents;
    c.profitCents += s.profit_cents;
    channels.set(k, c);
  }

  return {
    salesCount: confirmed.length,
    units,
    revenueCents: revenue,
    profitCents: profit,
    marginRatio: revenue > 0 ? profit / revenue : null,
    priceRealization: median,
    sellingCostPerUnitCents: units > 0 ? Math.round(selling / units) : 0,
    avgDaysToSell: avgDays,
    shippingPerUnitCents: shippingPerUnit,
    extrasPerUnitCents: extrasPerUnit,
    ordersInHistory: real.length,
    byCategory,
    byChannel: [...channels.entries()].map(([channel, v]) => ({ channel, ...v })).sort((a, b) => b.units - a.units),
  };
}

export interface ProductEstimate {
  product: ProductMetrics;
  supplierPriceCents: number;
  landedCostCents: number;
  salePriceCents: number | null;
  priceIsEstimate: boolean;
  sellingCostCents: number;
  profitPerUnitCents: number | null;
  daysToSell: number | null;
  daysAreEstimate: boolean;
  neverBought: boolean;
}

export function estimateProduct(
  p: ProductMetrics,
  stats: SalesStats,
  lastSupplierPrice: Map<string, number>,
  fallbackUnitCostCents: number,
): ProductEstimate {
  const supplierPrice = lastSupplierPrice.get(p.id) ?? p.reference_unit_cost_cents ?? fallbackUnitCostCents;
  const landed = supplierPrice + (stats.shippingPerUnitCents ?? 0) + (stats.extrasPerUnitCents ?? 0);
  const sold = p.units_sold > 0;
  const realization = stats.priceRealization != null ? clamp(stats.priceRealization, 0.6, 1.1) : 1;
  const salePrice = sold ? Math.round(p.revenue_cents / p.units_sold) : p.expected_price_cents != null ? Math.round(p.expected_price_cents * realization) : null;
  const cat = stats.byCategory.find((c) => c.category === catOf(p));
  const ownDays = p.avg_days_to_sell != null ? Number(p.avg_days_to_sell) : null;
  const days = ownDays ?? cat?.avgDaysToSell ?? stats.avgDaysToSell;
  return {
    product: p,
    supplierPriceCents: supplierPrice,
    landedCostCents: landed,
    salePriceCents: salePrice,
    priceIsEstimate: !sold,
    sellingCostCents: stats.sellingCostPerUnitCents,
    profitPerUnitCents: salePrice != null ? salePrice - landed - stats.sellingCostPerUnitCents : null,
    daysToSell: days,
    daysAreEstimate: ownDays == null,
    neverBought: p.purchased_qty === 0 && p.incoming_qty === 0,
  };
}

export interface ProposalLine extends ProductEstimate {
  units: number;
}

export interface Proposal {
  focus: Focus;
  budgetCents: number;
  lines: ProposalLine[];
  goodsCents: number;
  shippingCents: number;
  extrasCents: number;
  fixedCents: number;
  totalCents: number;
  leftoverCents: number;
  revenueCents: number;
  profitCents: number;
  avgDaysToSell: number | null;
  reason: string | null;
}

function scoreFor(focus: Focus, e: ProductEstimate): number {
  const profit = e.profitPerUnitCents ?? 0;
  const days = Math.max(e.daysToSell ?? 30, 1);
  // No acumular: lo que ya tienes en stock pesa menos.
  const stockPenalty = 1 / (1 + e.product.stock_qty);
  switch (focus) {
    case 'profit': return profit * stockPenalty;
    case 'speed': return (1000 / days) * stockPenalty + profit / 1e6;
    case 'new': return profit / days;
    case 'balanced': return (profit / days) * stockPenalty;
  }
}

/**
 * Reparte TODO el presupuesto entre los mejores candidatos del enfoque elegido.
 * Por rondas: los mejores reciben más unidades por ronda, pero todos los elegidos reciben alguna,
 * hasta que no cabe ni una unidad más. Nunca supera el presupuesto.
 */
export function buildProposal(
  focus: Focus,
  estimates: ProductEstimate[],
  budgetCents: number,
  opts: { fixedOrderCostsCents: number; shippingPerUnitCents: number; maxProducts?: number },
): Proposal {
  const fixed = opts.fixedOrderCostsCents;
  const empty = (reason: string): Proposal => ({
    focus, budgetCents, lines: [], goodsCents: 0, shippingCents: 0, extrasCents: 0, fixedCents: 0,
    totalCents: 0, leftoverCents: budgetCents, revenueCents: 0, profitCents: 0, avgDaysToSell: null, reason,
  });
  if (budgetCents <= 0) return empty('No hay dinero disponible para reinvertir.');

  const pool = estimates.filter((e) => !e.product.archived && e.profitPerUnitCents != null && e.profitPerUnitCents > 0 && e.landedCostCents > 0
    && (focus !== 'new' || e.neverBought));
  if (pool.length === 0) {
    return empty(focus === 'new'
      ? 'No hay productos nuevos rentables: añade al catálogo productos con precio previsto y coste.'
      : 'No hay productos con beneficio estimado positivo (revisa precios previstos y costes).');
  }
  const allRanked = pool.map((e) => ({ e, score: scoreFor(focus, e) })).filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const ranked = allRanked.slice(0, opts.maxProducts ?? (focus === 'new' ? 8 : 6));
  const available = budgetCents - fixed;
  if (ranked.length === 0 || available < Math.min(...ranked.map((r) => r.e.landedCostCents))) {
    return empty('El dinero disponible no llega para una unidad más los costes del pedido.');
  }

  const maxScore = ranked[0].score;
  const weights = ranked.map((r) => Math.max(1, Math.round((3 * r.score) / maxScore)));
  const units = new Array(ranked.length).fill(0) as number[];
  let spent = 0;
  // Primera ronda: una unidad de cada producto elegido (por orden), para repartir el riesgo.
  ranked.forEach((r, i) => {
    if (spent + r.e.landedCostCents <= available) {
      units[i] += 1;
      spent += r.e.landedCostCents;
    }
  });
  // Siguientes rondas: los mejores reciben más unidades, hasta agotar el presupuesto.
  let changed = true;
  while (changed) {
    changed = false;
    ranked.forEach((r, i) => {
      for (let k = 0; k < weights[i]; k++) {
        if (spent + r.e.landedCostCents > available) break;
        units[i] += 1;
        spent += r.e.landedCostCents;
        changed = true;
      }
    });
  }

  // Pasada final: lo que sobre se aprovecha con los siguientes mejores productos que quepan.
  const extra = allRanked.slice(ranked.length).map((r) => ({ ...r, units: 0 }));
  changed = true;
  while (changed) {
    changed = false;
    for (const x of extra) {
      if (spent + x.e.landedCostCents > available) continue;
      x.units += 1;
      spent += x.e.landedCostCents;
      changed = true;
    }
  }

  const lines: ProposalLine[] = [
    ...ranked.map((r, i) => ({ ...r.e, units: units[i] })),
    ...extra.map((x) => ({ ...x.e, units: x.units })),
  ].filter((l) => l.units > 0);
  const totalUnits = lines.reduce((t, l) => t + l.units, 0);
  const goods = lines.reduce((t, l) => t + l.units * l.supplierPriceCents, 0);
  const totalLanded = lines.reduce((t, l) => t + l.units * l.landedCostCents, 0);
  const shipping = totalUnits * opts.shippingPerUnitCents;
  const revenue = lines.reduce((t, l) => t + l.units * (l.salePriceCents ?? 0), 0);
  const profit = lines.reduce((t, l) => t + l.units * (l.profitPerUnitCents ?? 0), 0) - fixed;
  const daysUnits = lines.filter((l) => l.daysToSell != null);
  const du = daysUnits.reduce((t, l) => t + l.units, 0);
  return {
    focus,
    budgetCents,
    lines,
    goodsCents: goods,
    shippingCents: shipping,
    extrasCents: totalLanded - goods - shipping,
    fixedCents: fixed,
    totalCents: totalLanded + fixed,
    leftoverCents: budgetCents - totalLanded - fixed,
    revenueCents: revenue,
    profitCents: profit,
    avgDaysToSell: du > 0 ? daysUnits.reduce((t, l) => t + (l.daysToSell ?? 0) * l.units, 0) / du : null,
    reason: totalUnits === 0 ? 'No cabe ninguna unidad en el presupuesto.' : null,
  };
}
