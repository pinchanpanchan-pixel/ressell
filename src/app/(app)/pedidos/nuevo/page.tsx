import { randomUUID } from 'node:crypto';
import { OrderForm } from '@/components/order-form';
import { PageHeader } from '@/components/ui';
import { getCategories, getProducts, getSuppliers } from '@/lib/data';
import { todayISO } from '@/lib/dates';

export const metadata = { title: 'Nuevo pedido' };

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ prefill?: string; envio?: string }> }) {
  const { prefill, envio } = await searchParams;
  const [products, suppliers, categories] = await Promise.all([getProducts(), getSuppliers(), getCategories()]);
  const ids = new Set(products.map((p) => p.id));
  // prefill=id:unidades[:precioCéntimos],… · envio=céntimos (propuestas del análisis)
  const lines = (prefill ?? '').split(',').map((s) => s.split(':')).filter(([id, q]) => ids.has(id) && Number(q) > 0)
    .map(([id, q, price]) => ({ product_id: id, quantity: Math.floor(Number(q)), unit_price_cents: price && Number(price) >= 0 ? Math.round(Number(price)) : undefined }));
  const shipping = envio && Number(envio) > 0 ? Math.round(Number(envio)) : undefined;
  return (
    <>
      <PageHeader title="Nuevo pedido" back="/pedidos" />
      <OrderForm products={products} suppliers={suppliers} requestId={randomUUID()} today={todayISO()} prefill={lines} prefillShippingCents={shipping} categories={categories} />
    </>
  );
}
