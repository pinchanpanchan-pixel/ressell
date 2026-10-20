import { randomUUID } from 'node:crypto';
import { OrderForm } from '@/components/order-form';
import { PageHeader } from '@/components/ui';
import { getProducts, getSuppliers } from '@/lib/data';
import { todayISO } from '@/lib/dates';

export const metadata = { title: 'Nuevo pedido' };

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ prefill?: string }> }) {
  const { prefill } = await searchParams;
  const [products, suppliers] = await Promise.all([getProducts(), getSuppliers()]);
  const ids = new Set(products.map((p) => p.id));
  const lines = (prefill ?? '').split(',').map((s) => s.split(':')).filter(([id, q]) => ids.has(id) && Number(q) > 0).map(([id, q]) => ({ product_id: id, quantity: Math.floor(Number(q)) }));
  return (
    <>
      <PageHeader title="Nuevo pedido" back="/pedidos" />
      <OrderForm products={products} suppliers={suppliers} requestId={randomUUID()} today={todayISO()} prefill={lines} />
    </>
  );
}
