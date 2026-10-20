import { describe, expect, it } from 'vitest';
import { allocateBudget, buildInsight, estimateDailyRate, rankInsights } from '@/lib/analytics';
import type { ProductMetrics } from '@/lib/types';

const settings = { coverageDays: 30, defaultLeadTimeDays: 14, fallbackUnitCostCents: 1750 };

function product(over: Partial<ProductMetrics>): ProductMetrics {
  return {
    id: crypto.randomUUID(), name: 'P', brand: null, model: null, variant: null, category: null, sku: null,
    supplier_id: null, supplier_name: null, expected_price_cents: 7000, reference_unit_cost_cents: null, lead_time_days: null,
    authenticity_status: 'pending', documentation_notes: null, notes: null, photo_path: null, archived: false,
    created_at: '2026-01-01', stock_qty: 0, stock_cost_cents: 0, purchased_qty: 10, purchased_cost_cents: 17500,
    purchased_base_cents: 0, purchased_shipping_cents: 0, purchased_extra_cents: 0, first_received_on: '2026-01-01',
    last_received_on: '2026-01-01', incoming_qty: 0, units_sold: 0, revenue_cents: 0, profit_cents: 0, sold_7d: 0,
    sold_30d: 0, sold_90d: 0, sold_prev_30d: 0, last_sale_date: null, sales_count: 0, avg_days_to_sell: null,
    units_written_off: 0, written_off_cost_cents: 0, days_since_first_stock: 120, ...over,
  };
}

describe('recomendación de compra', () => {
  it('una venta rápida de un producto nuevo no dispara una compra grande', () => {
    const p = product({ units_sold: 1, sold_7d: 1, sold_30d: 1, sold_90d: 1, revenue_cents: 7000, profit_cents: 4000, days_since_first_stock: 2, stock_qty: 0, purchased_qty: 1, purchased_cost_cents: 1750 });
    const i = buildInsight(p, settings);
    expect(i.dataQuality).toBe('provisional');
    expect(i.recommendation.provisional).toBe(true);
    expect(i.recommendation.units).toBeLessThanOrEqual(2);
    // la ventana mínima de 14 días evita extrapolar 1 venta en 2 días a 0,5 ud/día
    expect(estimateDailyRate(p)).toBeLessThan(0.1);
  });

  it('producto con demanda sostenida: repone para plazo + cobertura menos stock y pendiente', () => {
    // 30 ud en 90 días, 10 en los últimos 30, 3 en 7 → ~0,34 ud/día
    const p = product({ units_sold: 30, sold_7d: 3, sold_30d: 10, sold_90d: 30, sold_prev_30d: 10, revenue_cents: 210000, profit_cents: 120000, stock_qty: 4, incoming_qty: 2, purchased_qty: 36 });
    const i = buildInsight(p, settings);
    expect(i.dataQuality).toBe('reliable');
    const rate = 0.2 * (3 / 7) + 0.5 * (10 / 30) + 0.3 * (30 / 90);
    expect(i.dailyRate).toBeCloseTo(rate, 6);
    expect(i.recommendation.units).toBe(Math.ceil(rate * 44) - 4 - 2);
    expect(i.recommendation.provisional).toBe(false);
  });

  it('no recomienda comprar lo que no es rentable ni lo que aún no se ha vendido', () => {
    const loss = buildInsight(product({ units_sold: 10, sold_30d: 5, sold_90d: 10, revenue_cents: 20000, profit_cents: -500 }), settings);
    expect(loss.recommendation.units).toBe(0);
    const unsold = buildInsight(product({ stock_qty: 5 }), settings);
    expect(unsold.recommendation.units).toBe(0);
    expect(unsold.dataQuality).toBe('none');
  });

  it('con stock suficiente no recomienda reponer', () => {
    const i = buildInsight(product({ units_sold: 20, sold_7d: 1, sold_30d: 5, sold_90d: 20, revenue_cents: 140000, profit_cents: 80000, stock_qty: 30 }), settings);
    expect(i.recommendation.units).toBe(0);
  });

  it('ordena el ranking por cada criterio', () => {
    const a = buildInsight(product({ name: 'A', units_sold: 10, sold_7d: 0, sold_30d: 2, sold_90d: 10, revenue_cents: 70000, profit_cents: 20000 }), settings);
    const b = buildInsight(product({ name: 'B', units_sold: 5, sold_7d: 3, sold_30d: 5, sold_90d: 5, revenue_cents: 50000, profit_cents: 30000 }), settings);
    expect(rankInsights([b, a], 'units')[0].product.name).toBe('A');
    expect(rankInsights([a, b], 'profit')[0].product.name).toBe('B');
    expect(rankInsights([a, b], 'margin')[0].product.name).toBe('B');
    expect(rankInsights([a, b], 'recent')[0].product.name).toBe('B');
    expect(rankInsights([a, b], 'velocity')[0].product.name).toBe('B');
  });

  it('reparte el presupuesto sin superarlo y priorizando el beneficio por día', () => {
    const strong = buildInsight(product({ name: 'S', units_sold: 30, sold_7d: 4, sold_30d: 15, sold_90d: 30, revenue_cents: 210000, profit_cents: 150000 }), settings);
    const weak = buildInsight(product({ name: 'W', units_sold: 10, sold_7d: 1, sold_30d: 4, sold_90d: 10, revenue_cents: 50000, profit_cents: 10000 }), settings);
    const plan = allocateBudget([weak, strong], 15000, 2000);
    expect(plan.totalCents).toBeLessThanOrEqual(15000);
    expect(plan.lines[0].productId).toBe(strong.product.id);
    expect(plan.goodsCents + plan.fixedCostsCents).toBe(plan.totalCents);
    expect(plan.leftoverCents).toBe(15000 - plan.totalCents);
    const none = allocateBudget([strong], 1500, 2000);
    expect(none.lines).toHaveLength(0);
    expect(none.totalCents).toBe(0);
  });
});
