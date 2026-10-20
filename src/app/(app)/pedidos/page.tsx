import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Badge, ButtonLink, Card, Chips, EmptyState, PageHeader } from '@/components/ui';
import { getOrders } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { PO_STATUS_LABEL, poStatusTone as statusTone } from '@/lib/labels';
import { formatEUR } from '@/lib/money';

export const metadata = { title: 'Pedidos' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado = 'open' } = await searchParams;
  const orders = await getOrders(estado === 'all' ? undefined : estado);
  return (
    <>
      <PageHeader title="Pedidos" subtitle="Compras a proveedores" action={<ButtonLink href="/pedidos/nuevo" size="sm"><Plus className="size-4" />Pedido</ButtonLink>} />
      <Chips active={estado} items={[
        { key: 'open', label: 'En curso', href: '/pedidos?estado=open' },
        { key: 'received', label: 'Recibidos', href: '/pedidos?estado=received' },
        { key: 'reviewed', label: 'Revisados', href: '/pedidos?estado=reviewed' },
        { key: 'cancelled', label: 'Cancelados', href: '/pedidos?estado=cancelled' },
        { key: 'all', label: 'Todos', href: '/pedidos?estado=all' },
      ]} />
      {orders.length === 0 ? (
        <EmptyState title="No hay pedidos aquí" text="Registra un pedido con varios productos. El stock se añade al recibirlo." action={<ButtonLink href="/pedidos/nuevo">Nuevo pedido</ButtonLink>} />
      ) : (
        <ul className="grid gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/pedidos/${o.id}`}>
                <Card className="transition-colors hover:bg-card-hi">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{o.reference}</p>
                      <p className="mt-0.5 truncate text-xs text-faint">{formatDate(o.order_date)} · {o.supplier_name ?? 'Sin proveedor'} · {o.total_units} ud</p>
                    </div>
                    <p className="num shrink-0 font-semibold">{formatEUR(o.total_cents)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={statusTone(o.status)}>{PO_STATUS_LABEL[o.status]}</Badge>
                    {o.paid_at && o.status !== 'paid' && o.status !== 'cancelled' && <Badge tone="positive">Pagado</Badge>}
                    {!o.paid_at && o.received_at && <Badge tone="warn">Sin pagar</Badge>}
                    {o.tracking_number && <Badge>Seguimiento</Badge>}
                    {o.incidents && <Badge tone="warn">Incidencia</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
