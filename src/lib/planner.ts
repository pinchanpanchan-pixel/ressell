/**
 * Simulador de reinversión. Es independiente de los datos reales: no crea pedidos ni
 * movimientos, solo calcula escenarios a partir de hipótesis editables.
 *
 * Coste del pedido = unidades × coste unitario + envío del proveedor + otros costes.
 */
import { applyBps } from './money';

export interface PlannerInput {
  availableCents: number;
  reinvestBps: number;
  reserveBps: number;
  unitCostCents: number;
  supplierShippingCents: number;
  otherCostsCents: number;
  salePriceCents: number;
  platformFeeBps: number;
  sellerShippingCents: number;
  /** Unidades deseadas; si se omite se usa el máximo. Nunca puede superar el máximo. */
  units?: number | null;
}

export interface Scenario {
  key: string;
  label: string;
  /** Proporción del lote que se vende en el periodo (0-1). */
  sellThrough: number;
  /** Factor sobre el precio previsto (p. ej. 0,9 = un 10 % menos). */
  priceFactor: number;
}

export const DEFAULT_SCENARIOS: Scenario[] = [
  { key: 'conservative', label: 'Conservador', sellThrough: 0.5, priceFactor: 0.85 },
  { key: 'intermediate', label: 'Intermedio', sellThrough: 0.75, priceFactor: 0.95 },
  { key: 'optimistic', label: 'Optimista', sellThrough: 1, priceFactor: 1 },
];

export interface ScenarioResult extends Scenario {
  unitsSold: number;
  unsoldUnits: number;
  revenueCents: number;
  sellingCostsCents: number;
  cashProfitCents: number;
  unsoldStockCostCents: number;
  cashAfterCents: number;
}

export interface PlannerResult {
  investableCents: number;
  reserveCents: number;
  budgetCents: number;
  maxUnits: number;
  units: number;
  clamped: boolean;
  fixedCostsCents: number;
  orderCostCents: number;
  remainingCents: number;
  potentialRevenueCents: number;
  potentialGrossProfitCents: number;
  sellingCostPerUnitCents: number;
  potentialNetProfitCents: number;
  expectedCapitalAfterCents: number;
  breakEvenUnits: number | null;
  scenarios: ScenarioResult[];
}

export function maxAffordableUnits(budgetCents: number, unitCostCents: number, fixedCostsCents: number): number {
  if (unitCostCents <= 0 || budgetCents <= fixedCostsCents) return 0;
  return Math.floor((budgetCents - fixedCostsCents) / unitCostCents);
}

export function simulate(input: PlannerInput, scenarios: Scenario[] = DEFAULT_SCENARIOS): PlannerResult {
  const available = Math.max(0, input.availableCents);
  const investable = applyBps(available, input.reinvestBps);
  const reserve = applyBps(investable, input.reserveBps);
  const budget = investable - reserve;
  const fixed = input.supplierShippingCents + input.otherCostsCents;
  const maxUnits = maxAffordableUnits(budget, input.unitCostCents, fixed);
  const wanted = input.units == null ? maxUnits : Math.max(0, Math.floor(input.units));
  const units = Math.min(wanted, maxUnits);
  const orderCost = units > 0 ? units * input.unitCostCents + fixed : 0;
  const sellingPerUnit = applyBps(input.salePriceCents, input.platformFeeBps) + input.sellerShippingCents;
  const revenue = units * input.salePriceCents;
  const net = revenue - units * sellingPerUnit - orderCost;
  const marginPerUnit = input.salePriceCents - sellingPerUnit;

  return {
    investableCents: investable,
    reserveCents: reserve,
    budgetCents: budget,
    maxUnits,
    units,
    clamped: wanted > maxUnits,
    fixedCostsCents: units > 0 ? fixed : 0,
    orderCostCents: orderCost,
    remainingCents: available - orderCost,
    potentialRevenueCents: revenue,
    potentialGrossProfitCents: revenue - orderCost,
    sellingCostPerUnitCents: sellingPerUnit,
    potentialNetProfitCents: net,
    expectedCapitalAfterCents: available - orderCost + revenue - units * sellingPerUnit,
    breakEvenUnits: units > 0 && marginPerUnit > 0 ? Math.min(units, Math.ceil(orderCost / marginPerUnit)) : null,
    scenarios: scenarios.map((sc) => {
      const sold = Math.floor(units * Math.min(Math.max(sc.sellThrough, 0), 1));
      const price = Math.round(input.salePriceCents * sc.priceFactor);
      const rev = sold * price;
      const selling = sold * (applyBps(price, input.platformFeeBps) + input.sellerShippingCents);
      return {
        ...sc,
        unitsSold: sold,
        unsoldUnits: units - sold,
        revenueCents: rev,
        sellingCostsCents: selling,
        cashProfitCents: rev - selling - orderCost,
        unsoldStockCostCents: (units - sold) * input.unitCostCents,
        cashAfterCents: available - orderCost + rev - selling,
      };
    }),
  };
}

export interface MixLine {
  label: string;
  unitCostCents: number;
  salePriceCents: number;
  units: number;
}

export interface MixResult {
  goodsCents: number;
  totalCents: number;
  units: number;
  fits: boolean;
  overBudgetCents: number;
  revenueCents: number;
  netProfitCents: number;
  marginRatio: number | null;
}

export function evaluateMix(lines: MixLine[], budgetCents: number, fixedCostsCents: number, platformFeeBps: number, sellerShippingCents: number): MixResult {
  const units = lines.reduce((t, l) => t + Math.max(0, l.units), 0);
  const goods = lines.reduce((t, l) => t + Math.max(0, l.units) * l.unitCostCents, 0);
  const total = units > 0 ? goods + fixedCostsCents : 0;
  const revenue = lines.reduce((t, l) => t + Math.max(0, l.units) * l.salePriceCents, 0);
  const selling = lines.reduce((t, l) => t + Math.max(0, l.units) * (applyBps(l.salePriceCents, platformFeeBps) + sellerShippingCents), 0);
  const net = revenue - selling - total;
  return {
    goodsCents: goods,
    totalCents: total,
    units,
    fits: total <= budgetCents,
    overBudgetCents: Math.max(0, total - budgetCents),
    revenueCents: revenue,
    netProfitCents: net,
    marginRatio: revenue > 0 ? net / revenue : null,
  };
}
