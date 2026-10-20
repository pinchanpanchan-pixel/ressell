import { Planner } from '@/components/planner';
import { PageHeader } from '@/components/ui';
import { estimateDailyRate } from '@/lib/analytics';
import { getPlannerSettings, getProducts, getSummary } from '@/lib/data';
import { productLabel } from '@/lib/types';

export const metadata = { title: 'Planificador' };

export default async function PlannerPage() {
  const [settings, summary, products] = await Promise.all([getPlannerSettings(), getSummary(), getProducts()]);
  const weeklyRate = products.reduce((t, p) => t + estimateDailyRate(p), 0) * 7;
  const options = products
    .map((p) => ({
      id: p.id,
      label: productLabel(p),
      unitCostCents: p.purchased_qty > 0 ? Math.round(p.purchased_cost_cents / p.purchased_qty) : p.reference_unit_cost_cents ?? settings.unit_cost_cents,
      priceCents: p.units_sold > 0 ? Math.round(p.revenue_cents / p.units_sold) : p.expected_price_cents ?? settings.avg_sale_price_cents,
    }));
  return (
    <>
      <PageHeader title="Planificador" back="/finanzas" subtitle="Simula cómo reinvertir. No afecta a tus datos reales." />
      <Planner settings={settings} cashCents={summary.cash_cents} weeklyRate={weeklyRate} products={options} />
    </>
  );
}
