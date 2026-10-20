/**
 * Serie temporal del capital: caja (libro de movimientos) e inventario a coste
 * (movimientos de stock). Se muestran por separado: el stock no es dinero disponible.
 */
export interface CapitalPoint {
  date: string;
  cashCents: number;
  inventoryCents: number;
  totalCents: number;
}

export function buildCapitalSeries(
  ledger: { entry_date: string; amount_cents: number }[],
  movements: { movement_date: string; cost_cents: number }[],
): CapitalPoint[] {
  const cashByDay = new Map<string, number>();
  const invByDay = new Map<string, number>();
  for (const e of ledger) cashByDay.set(e.entry_date, (cashByDay.get(e.entry_date) ?? 0) + Number(e.amount_cents));
  for (const m of movements) invByDay.set(m.movement_date, (invByDay.get(m.movement_date) ?? 0) + Number(m.cost_cents));
  const days = [...new Set([...cashByDay.keys(), ...invByDay.keys()])].sort();
  let cash = 0;
  let inv = 0;
  return days.map((date) => {
    cash += cashByDay.get(date) ?? 0;
    inv += invByDay.get(date) ?? 0;
    return { date, cashCents: cash, inventoryCents: inv, totalCents: cash + inv };
  });
}
