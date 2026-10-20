/**
 * Analítica de producto y recomendación de compra.
 *
 * Principios:
 * - La demanda se estima con ventas reales netas de devoluciones, mezclando 7, 30 y 90 días
 *   (pesa más el mes, para que una venta suelta no dispare la recomendación).
 * - Para productos recientes se usa una ventana mínima de 14 días, de modo que vender
 *   dos unidades en tres días no se interprete como un ritmo sostenido.
 * - Con pocos datos la recomendación es provisional y se limita a cantidades pequeñas.
 * - Se recomienda reponer solo lo necesario para cubrir el plazo de reposición más el
 *   periodo de cobertura, descontando el stock disponible y el que ya viene en camino.
 */
import type { ProductMetrics } from './types';

export type DataQuality = 'none' | 'provisional' | 'reliable';
export type Trend = 'up' | 'down' | 'flat' | 'new' | 'insufficient';
export type RankingKey = 'units' | 'velocity' | 'profit' | 'margin' | 'recent' | 'recommended';

export interface InsightSettings {
  coverageDays: number;
  defaultLeadTimeDays: number;
  fallbackUnitCostCents: number;
}

export interface Recommendation {
  units: number;
  provisional: boolean;
  reason: string;
}

export interface ProductInsight {
  product: ProductMetrics;
  dailyRate: number;
  weeklyRate: number;
  unitCostCents: number;
  unitCostIsEstimate: boolean;
  avgPriceCents: number | null;
  profitPerUnitCents: number | null;
  marginRatio: number | null;
  sellThrough: number | null;
  coverageDays: number | null;
  capitalTiedCents: number;
  trend: Trend;
  dataQuality: DataQuality;
  leadTimeDays: number;
  recommendation: Recommendation;
  /** Beneficio esperado por día (ritmo × beneficio unitario). Ordena la prioridad de compra. */
  score: number;
}

const MIN_WINDOW_DAYS = 14;
const MIN_SALES_RELIABLE = 5;
const MIN_DAYS_RELIABLE = 21;
const SLOW_SELLER_DAYS = 60;

export function estimateDailyRate(p: Pick<ProductMetrics, 'sold_7d' | 'sold_30d' | 'sold_90d' | 'days_since_first_stock'>): number {
  if (p.days_since_first_stock == null) return 0;
  const days = Math.max(p.days_since_first_stock, MIN_WINDOW_DAYS);
  const r7 = p.sold_7d / 7;
  const r30 = p.sold_30d / Math.min(30, days);
  const r90 = p.sold_90d / Math.min(90, days);
  return 0.2 * r7 + 0.5 * r30 + 0.3 * r90;
}

export function classifyTrend(p: Pick<ProductMetrics, 'sold_30d' | 'sold_prev_30d' | 'days_since_first_stock'>): Trend {
  if (p.days_since_first_stock != null && p.days_since_first_stock < 45 && p.sold_30d > 0) return 'new';
  if (p.sold_30d + p.sold_prev_30d < 3) return 'insufficient';
  const ratio = p.sold_30d / Math.max(p.sold_prev_30d, 0.5);
  if (ratio >= 1.25) return 'up';
  if (ratio <= 0.8) return 'down';
  return 'flat';
}

export function buildInsight(p: ProductMetrics, s: InsightSettings): ProductInsight {
  const dailyRate = estimateDailyRate(p);
  const unitCostFromLots = p.purchased_qty > 0 ? Math.round(p.purchased_cost_cents / p.purchased_qty) : null;
  const unitCostCents = unitCostFromLots ?? p.reference_unit_cost_cents ?? s.fallbackUnitCostCents;
  const avgPriceCents = p.units_sold > 0 ? Math.round(p.revenue_cents / p.units_sold) : p.expected_price_cents;
  const profitPerUnitCents = p.units_sold > 0 ? Math.round(p.profit_cents / p.units_sold) : null;
  const marginRatio = p.revenue_cents > 0 ? p.profit_cents / p.revenue_cents : null;
  const sellThrough = p.purchased_qty > 0 ? p.units_sold / p.purchased_qty : null;
  const coverageDays = dailyRate > 0 ? p.stock_qty / dailyRate : null;
  const leadTimeDays = p.lead_time_days ?? s.defaultLeadTimeDays;

  const dataQuality: DataQuality =
    p.units_sold === 0 ? 'none'
      : p.units_sold < MIN_SALES_RELIABLE || (p.days_since_first_stock ?? 0) < MIN_DAYS_RELIABLE ? 'provisional'
        : 'reliable';

  const recommendation = recommend(p, { dailyRate, profitPerUnitCents, leadTimeDays, dataQuality, coverageDays }, s);
  const score = dailyRate * Math.max(profitPerUnitCents ?? 0, 0);

  return {
    product: p,
    dailyRate,
    weeklyRate: dailyRate * 7,
    unitCostCents,
    unitCostIsEstimate: unitCostFromLots == null,
    avgPriceCents,
    profitPerUnitCents,
    marginRatio,
    sellThrough,
    coverageDays,
    capitalTiedCents: p.stock_cost_cents,
    trend: classifyTrend(p),
    dataQuality,
    leadTimeDays,
    recommendation,
    score,
  };
}

function recommend(
  p: ProductMetrics,
  c: { dailyRate: number; profitPerUnitCents: number | null; leadTimeDays: number; dataQuality: DataQuality; coverageDays: number | null },
  s: InsightSettings,
): Recommendation {
  if (p.archived) return { units: 0, provisional: false, reason: 'Producto archivado' };
  if (c.dataQuality === 'none') {
    return p.stock_qty > 0
      ? { units: 0, provisional: true, reason: 'Aún sin ventas: vende primero el stock actual' }
      : { units: 0, provisional: true, reason: 'Sin historial de ventas: decide con el planificador' };
  }
  if (c.profitPerUnitCents != null && c.profitPerUnitCents <= 0) {
    return { units: 0, provisional: c.dataQuality !== 'reliable', reason: 'No es rentable con los costes actuales' };
  }

  const horizon = c.leadTimeDays + s.coverageDays;
  let target = Math.ceil(c.dailyRate * horizon - 1e-9);
  const slow = p.avg_days_to_sell != null && p.avg_days_to_sell > SLOW_SELLER_DAYS;
  if (slow) target = Math.floor(target / 2);
  let need = Math.max(0, target - p.stock_qty - p.incoming_qty);

  if (need === 0) {
    const reason = p.incoming_qty > 0 && p.stock_qty < target
      ? `Lo pendiente de recibir (${p.incoming_qty} ud) cubre la demanda`
      : `El stock cubre unos ${Math.round(c.coverageDays ?? 0)} días de ventas`;
    return { units: 0, provisional: c.dataQuality !== 'reliable', reason };
  }

  const provisional = c.dataQuality === 'provisional';
  if (provisional) {
    const cap = Math.max(2, p.units_sold);
    if (need > cap) need = cap;
  }

  const parts = [`Demanda estimada de ${(c.dailyRate * 7).toFixed(1).replace('.', ',')} ud/semana`, `cobertura de ${horizon} días`];
  if (slow) parts.push('venta lenta: cantidad reducida');
  if (provisional) parts.push('pocos datos: cantidad limitada');
  return { units: need, provisional, reason: parts.join(' · ') };
}

export function rankInsights(list: ProductInsight[], key: RankingKey): ProductInsight[] {
  const value = (i: ProductInsight): number[] => {
    switch (key) {
      case 'units': return [i.product.units_sold, i.product.profit_cents];
      case 'velocity': return [i.dailyRate, i.product.units_sold];
      case 'profit': return [i.product.profit_cents, i.product.units_sold];
      case 'margin': return [i.marginRatio ?? -Infinity, i.product.units_sold];
      case 'recent': return [i.product.sold_7d, i.product.sold_30d, i.product.units_sold];
      case 'recommended': return [i.recommendation.units > 0 ? 1 : 0, i.score, i.product.units_sold];
    }
  };
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    for (let k = 0; k < va.length; k++) {
      if (vb[k] !== va[k]) return vb[k] - va[k];
    }
    return a.product.name.localeCompare(b.product.name, 'es');
  });
}

export interface PurchasePlanLine {
  productId: string;
  units: number;
  unitCostCents: number;
  costCents: number;
}

export interface PurchasePlan {
  lines: PurchasePlanLine[];
  goodsCents: number;
  fixedCostsCents: number;
  totalCents: number;
  leftoverCents: number;
  unitsShort: number;
}

/**
 * Reparte un presupuesto entre los productos recomendados, por prioridad (beneficio/día),
 * añadiendo una unidad cada vez para no concentrar todo en un solo producto.
 * Nunca supera el presupuesto.
 */
export function allocateBudget(insights: ProductInsight[], budgetCents: number, fixedCostsCents: number): PurchasePlan {
  const candidates = insights
    .filter((i) => i.recommendation.units > 0 && i.unitCostCents > 0)
    .sort((a, b) => b.score - a.score);
  const units = new Map<string, number>();
  let spent = 0;
  const available = budgetCents - fixedCostsCents;

  if (available > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of candidates) {
        const current = units.get(c.product.id) ?? 0;
        if (current >= c.recommendation.units) continue;
        if (spent + c.unitCostCents > available) continue;
        units.set(c.product.id, current + 1);
        spent += c.unitCostCents;
        changed = true;
      }
    }
  }

  const lines = candidates
    .filter((c) => (units.get(c.product.id) ?? 0) > 0)
    .map((c) => {
      const u = units.get(c.product.id)!;
      return { productId: c.product.id, units: u, unitCostCents: c.unitCostCents, costCents: u * c.unitCostCents };
    });
  const recommendedUnits = candidates.reduce((t, c) => t + c.recommendation.units, 0);
  const plannedUnits = lines.reduce((t, l) => t + l.units, 0);
  const total = lines.length > 0 ? spent + fixedCostsCents : 0;
  return {
    lines,
    goodsCents: spent,
    fixedCostsCents: lines.length > 0 ? fixedCostsCents : 0,
    totalCents: total,
    leftoverCents: budgetCents - total,
    unitsShort: recommendedUnits - plannedUnits,
  };
}
