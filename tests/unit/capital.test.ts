import { expect, it } from 'vitest';
import { buildCapitalSeries } from '@/lib/capital-series';

it('acumula caja e inventario por día sin mezclarlos', () => {
  const s = buildCapitalSeries(
    [{ entry_date: '2026-10-01', amount_cents: 15000 }, { entry_date: '2026-10-02', amount_cents: -11800 }, { entry_date: '2026-10-10', amount_cents: 6500 }],
    [{ movement_date: '2026-10-05', cost_cents: 11800 }, { movement_date: '2026-10-10', cost_cents: -1770 }],
  );
  expect(s.map((p) => p.date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-10']);
  expect(s.at(-1)).toEqual({ date: '2026-10-10', cashCents: 9700, inventoryCents: 10030, totalCents: 19730 });
  expect(s[0]).toMatchObject({ cashCents: 0, inventoryCents: 0 });
  expect(s[2]).toMatchObject({ cashCents: 3200, inventoryCents: 0 });
});
