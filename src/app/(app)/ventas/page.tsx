import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Badge, ButtonLink, Card, Chips, EmptyState, PageHeader } from '@/components/ui';
import { getSales } from '@/lib/data';
import { formatDate } from '@/lib/dates';
import { DELIVERY_LABEL } from '@/lib/labels';
import { formatEUR } from '@/lib/money';
import { productLabel } from '@/lib/types';

export const metadata = { title: 'Ventas' };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver = 'todas' } = await searchParams;
  const sales = await getSales({ filter: ver });
  const confirmed = sales.filter((s) => s.status === 'confirmed');
  return (
    <>
      <PageHeader title="Ventas" subtitle={`${confirmed.length} ventas · ${formatEUR(confirmed.reduce((t, s) => t + s.profit_cents, 0))} de beneficio`}
        action={<ButtonLink href="/ventas/nueva" size="sm"><Plus className="size-4" />Venta</ButtonLink>} />
      <Chips active={ver} items={[
        { key: 'todas', label: 'Todas', href: '/ventas' },
        { key: 'unpaid', label: 'Por cobrar', href: '/ventas?ver=unpaid' },
        { key: 'to_ship', label: 'Por entregar', href: '/ventas?ver=to_ship' },
        { key: 'returns', label: 'Devoluciones', href: '/ventas?ver=returns' },
        { key: 'cancelled', label: 'Canceladas', href: '/ventas?ver=cancelled' },
      ]} />
      {sales.length === 0 ? (
        <EmptyState title="Sin ventas en esta vista" action={<ButtonLink href="/ventas/nueva">Registrar venta</ButtonLink>} />
      ) : (
        <ul className="grid gap-2">
          {sales.map((s) => (
            <li key={s.id}>
              <Link href={`/ventas/${s.id}`}>
                <Card className={`transition-colors hover:bg-card-hi ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{productLabel({ name: s.product_name, brand: s.product_brand, model: s.product_model, variant: s.product_variant })}</p>
                      <p className="mt-0.5 text-xs text-faint">{formatDate(s.sale_date)} · {s.quantity} ud{s.channel ? ` · ${s.channel}` : ''}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num font-semibold">{formatEUR(s.revenue_cents)}</p>
                      <p className={`num text-xs ${s.profit_cents >= 0 ? 'text-sage' : 'text-danger'}`}>{formatEUR(s.profit_cents, { sign: true })}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.status === 'cancelled' ? <Badge tone="negative">Cancelada</Badge> : (
                      <>
                        <Badge tone={s.payment_status === 'paid' ? 'positive' : 'warn'}>{s.payment_status === 'paid' ? 'Cobrada' : 'Por cobrar'}</Badge>
                        <Badge tone={s.delivery_status === 'delivered' ? 'positive' : s.delivery_status === 'returned' ? 'negative' : 'neutral'}>{DELIVERY_LABEL[s.delivery_status]}</Badge>
                        {s.returned_quantity > 0 && s.delivery_status !== 'returned' && <Badge tone="warn">{s.returned_quantity} devuelta(s)</Badge>}
                      </>
                    )}
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
