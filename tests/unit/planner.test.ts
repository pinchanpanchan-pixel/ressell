import { describe, expect, it } from 'vitest';
import { evaluateMix, maxAffordableUnits, simulate } from '@/lib/planner';

const base = {
  availableCents: 15000, reinvestBps: 10000, reserveBps: 0, unitCostCents: 1750,
  supplierShippingCents: 2000, otherCostsCents: 0, salePriceCents: 7000, platformFeeBps: 0, sellerShippingCents: 0,
};

describe('simulador de reinversión', () => {
  it('valores de referencia: 150 € → 7 unidades', () => {
    const r = simulate(base);
    expect(r.maxUnits).toBe(7);
    expect(r.orderCostCents).toBe(7 * 1750 + 2000);
    expect(r.remainingCents).toBe(750);
    expect(r.potentialRevenueCents).toBe(49000);
    expect(r.potentialNetProfitCents).toBe(49000 - 14250);
    expect(r.expectedCapitalAfterCents).toBe(750 + 49000);
  });
  it('con reserva del 10 % baja a 6 unidades y aparta 15 €', () => {
    const r = simulate({ ...base, reserveBps: 1000 });
    expect(r.reserveCents).toBe(1500);
    expect(r.maxUnits).toBe(6);
    expect(r.orderCostCents).toBe(12500);
    expect(r.remainingCents).toBe(2500);
  });
  it('nunca supera el presupuesto aunque se pidan más unidades', () => {
    const r = simulate({ ...base, units: 50 });
    expect(r.units).toBe(7);
    expect(r.clamped).toBe(true);
    expect(r.orderCostCents).toBeLessThanOrEqual(15000);
  });
  it('si el presupuesto no cubre ni el envío, 0 unidades y coste 0', () => {
    expect(maxAffordableUnits(1500, 1750, 2000)).toBe(0);
    const r = simulate({ ...base, availableCents: 1500 });
    expect(r.units).toBe(0);
    expect(r.orderCostCents).toBe(0);
    expect(r.remainingCents).toBe(1500);
  });
  it('escenarios: el conservador vende menos y más barato', () => {
    const r = simulate({ ...base, platformFeeBps: 1000 });
    const [cons, mid, opt] = r.scenarios;
    expect(cons.unitsSold).toBe(3);
    expect(mid.unitsSold).toBe(5);
    expect(opt.unitsSold).toBe(7);
    expect(cons.cashProfitCents).toBeLessThan(mid.cashProfitCents);
    expect(mid.cashProfitCents).toBeLessThan(opt.cashProfitCents);
    // Optimista con 10 % de comisión: 49000 - 4900 - 14250
    expect(opt.cashProfitCents).toBe(29850);
    expect(cons.unsoldStockCostCents).toBe(4 * 1750);
  });
  it('compara combinaciones de productos contra el presupuesto', () => {
    const fits = evaluateMix([{ label: 'A', unitCostCents: 1750, salePriceCents: 7000, units: 4 }, { label: 'B', unitCostCents: 2500, salePriceCents: 9000, units: 2 }], 15000, 2000, 0, 0);
    expect(fits.totalCents).toBe(7000 + 5000 + 2000);
    expect(fits.fits).toBe(true);
    const over = evaluateMix([{ label: 'A', unitCostCents: 1750, salePriceCents: 7000, units: 8 }], 15000, 2000, 0, 0);
    expect(over.fits).toBe(false);
    expect(over.overBudgetCents).toBe(1000);
  });
});
