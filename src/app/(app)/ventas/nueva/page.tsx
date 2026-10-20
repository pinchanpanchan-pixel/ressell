import { randomUUID } from 'node:crypto';
import { SaleForm } from '@/components/sale-form';
import { PageHeader } from '@/components/ui';
import { getProducts, getSales } from '@/lib/data';
import { todayISO } from '@/lib/dates';

export const metadata = { title: 'Registrar venta' };

export default async function NewSale({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const { producto } = await searchParams;
  const [products, recent] = await Promise.all([getProducts(), getSales({ limit: 100 })]);
  const channels = [...new Set(recent.map((s) => s.channel).filter((c): c is string => !!c))];
  return (
    <>
      <PageHeader title="Registrar venta" back="/ventas" />
      <SaleForm products={products} requestId={randomUUID()} today={todayISO()} defaultProductId={producto} channels={channels} />
    </>
  );
}
