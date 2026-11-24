import { describe, expect, it } from 'vitest';
import { buildProposal, computeSalesStats, estimateProduct, type Focus } from '@/lib/proposals';
import type { ProductMetrics, PurchaseOrderOverview, SaleOverview } from '@/lib/types';

function product(over: Partial<ProductMetrics>): ProductMetrics {
  return {
    id: crypto.randomUUID(), name: 'P', brand: null, model: null, variant: null, category: 'Perfumes', sku: null,
    supplier_id: null, supplier_name: null, expected_price_cents: 7000, reference_unit_cost_cents: 1000, lead_time_days: null,
    authenticity_status: 'verified', documentation_notes: null, notes: null, photo_path: null, archived: false,
    created_at: '2026-01-01', stock_qty: 0, stock_cost_cents: 0, purchased_qty: 0, purchased_cost_cents: 0,
    purchased_base_cents: 0, purchased_shipping_cents: 0, purchased_extra_cents: 0, first_received_on: null,
    last_received_on: null, incoming_qty: 0, units_sold: 0, revenue_cents: 0, profit_cents: 0, sold_7d: 0,
    sold_30d: 0, sold_90d: 0, sold_prev_30d: 0, last_sale_date: null, sales_count: 0, avg_days_to_sell: null,
    units_written_off: 0, written_off_cost_cents: 0, days_since_first_stock: null, ...over,
  };
}
function sale(p: ProductMetrics, price: number, over: Partial<SaleOverview> = {}): SaleOverview {
  return {
    id: crypto.randomUUID(), sale_date: '2026-11-01', product_id: p.id, quantity: 1, unit_price_cents: price, discount_cents: 0,
    platform_fee_cents: 300, shipping_cost_cents: 0, other_costs_cents: 0, status: 'confirmed', payment_status: 'paid',
    delivery_status: 'delivered', channel: 'Wallapop', customer: null, notes: null, paid_at: '2026-11-01', cancelled_at: null,
    cancel_reason: null, created_at: '2026-11-01', product_name: p.name, product_brand: null, product_model: null,
    product_variant: null, product_sku: null, revenue_cents: price, cogs_cents: 1500, returned_quantity: 0, refunded_cents: 0,
    restocked_cost_cents: 0, profit_cents: price - 1500 - 300, ...over,
  };
}
function order(over: Partial<PurchaseOrderOverview>): PurchaseOrderOverview {
  return {
    id: crypto.randomUUID(), reference: 'PED', supplier_id: null, supplier_name: null, order_date: '2026-10-01', status: 'received',
    discount_cents: 0, shipping_cents: 0, packaging_cents: 0, other_costs_cents: 0, tracking_number: null, carrier: null, incidents: null,
    notes: null, paid_at: '2026-10-01', paid_amount_cents: 0, received_at: '2026-10-05', cancelled_at: null, created_at: '2026-10-01',
    updated_at: '2026-10-01', total_units: 0, line_count: 1, goods_cents: 0, total_cents: 0, ...over,
  };
}

describe('análisis de ventas', () => {
  const sold = product({ name: 'Vendido', units_sold: 4, revenue_cents: 28000, profit_cents: 16800, avg_days_to_sell: 6, purchased_qty: 5, stock_qty: 1 });
  const sales = [7000, 7000, 7000, 2500].map((pr) => sale(sold, pr));
  const orders = [order({ shipping_cents: 2000, total_units: 3 }), order({ shipping_cents: 6700, total_units: 7 }),
    order({ status: 'draft', paid_at: null, received_at: null, shipping_cents: 99999, total_units: 25 })];

  it('calcula envío por unidad solo con pedidos pagados o recibidos', () => {
    const s = computeSalesStats([sold], sales, orders);
    expect(s.shippingPerUnitCents).toBe(870);
    expect(s.ordersInHistory).toBe(2);
  });

  it('una venta excepcional (p. ej. a la familia) no hunde la estimación de precio', () => {
    const s = computeSalesStats([sold], sales, orders);
    expect(s.priceRealization).toBe(1);
    expect(s.sellingCostPerUnitCents).toBe(300);
  });

  it('estima precio y rapidez de productos sin ventas con datos de los vendidos', () => {
    const fresh = product({ name: 'Nuevo', expected_price_cents: 10000, reference_unit_cost_cents: 900 });
    const s = computeSalesStats([sold, fresh], sales, orders);
    const e = estimateProduct(fresh, s, new Map(), 1750);
    expect(e.priceIsEstimate).toBe(true);
    expect(e.salePriceCents).toBe(10000);
    expect(e.landedCostCents).toBe(900 + 870);
    expect(e.daysToSell).toBe(6);
    expect(e.daysAreEstimate).toBe(true);
    expect(e.neverBought).toBe(true);
    expect(e.profitPerUnitCents).toBe(10000 - 1770 - 300);
  });
});

describe('propuesta con toda la caja', () => {
  const sold = product({ name: 'Vendido', units_sold: 4, revenue_cents: 28000, profit_cents: 16800, avg_days_to_sell: 2, purchased_qty: 4 });
  const fast = product({ name: 'Rápido', category: 'Airpods', expected_price_cents: 6000, reference_unit_cost_cents: 1200 });
  const rich = product({ name: 'Caro', expected_price_cents: 18000, reference_unit_cost_cents: 1000 });
  const cheap = product({ name: 'Barato', expected_price_cents: 3000, reference_unit_cost_cents: 700 });
  const loss = product({ name: 'Pérdida', expected_price_cents: 1000, reference_unit_cost_cents: 2000 });
  const all = [sold, fast, rich, cheap, loss];
  const stats = computeSalesStats(all, [7000, 7000, 7000, 7000].map((p) => sale(sold, p)), [order({ shipping_cents: 800, total_units: 1 })]);
  const est = all.map((p) => estimateProduct(p, stats, new Map(), 1750));

  it.each(['balanced', 'profit', 'speed', 'new'] as Focus[])('enfoque %s: no supera la caja y deja menos de lo que cuesta una unidad', (focus) => {
    const pr = buildProposal(focus, est, 20000, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 });
    expect(pr.totalCents).toBeLessThanOrEqual(20000);
    expect(pr.leftoverCents).toBe(20000 - pr.totalCents);
    const cheapest = Math.min(...est.filter((e) => (e.profitPerUnitCents ?? 0) > 0 && (focus !== 'new' || e.neverBought)).map((e) => e.landedCostCents));
    expect(pr.leftoverCents).toBeLessThan(cheapest);
    expect(pr.lines.some((l) => l.product.name === 'Pérdida')).toBe(false);
    expect(pr.shippingCents).toBe(pr.lines.reduce((t, l) => t + l.units, 0) * 800);
  });

  it('«nuevos» solo propone productos nunca comprados; «más dinero» empieza por el más rentable', () => {
    const nuevos = buildProposal('new', est, 20000, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 });
    expect(nuevos.lines.every((l) => l.neverBought)).toBe(true);
    const dinero = buildProposal('profit', est, 20000, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 });
    expect(dinero.lines[0].product.name).toBe('Caro');
  });

  it('reparte: cada producto elegido recibe al menos una unidad', () => {
    const pr = buildProposal('balanced', est, 20000, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 });
    expect(pr.lines.length).toBeGreaterThan(1);
  });

  it('sin caja o caja negativa, no propone nada', () => {
    expect(buildProposal('balanced', est, 0, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 }).lines).toHaveLength(0);
    expect(buildProposal('balanced', est, -500, { fixedOrderCostsCents: 0, shippingPerUnitCents: 800 }).reason).toMatch(/No hay dinero/);
  });
});
