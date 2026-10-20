import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { OrderForm } from '@/components/order-form';
import { PageHeader } from '@/components/ui';
import { getOrder, getProducts, getSuppliers } from '@/lib/data';
import { todayISO } from '@/lib/dates';

export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ order, lines }, products, suppliers] = await Promise.all([getOrder(id), getProducts(), getSuppliers()]);
  if (order.paid_at || order.received_at || !['draft', 'pending_payment'].includes(order.status)) redirect(`/pedidos/${id}`);
  return (
    <>
      <PageHeader title={`Editar ${order.reference}`} back={`/pedidos/${id}`} />
      <OrderForm products={products} suppliers={suppliers} requestId={randomUUID()} today={todayISO()} order={order} lines={lines} />
    </>
  );
}
