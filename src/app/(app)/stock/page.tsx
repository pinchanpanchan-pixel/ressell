import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Badge, ButtonLink, Card, Chips, EmptyState, PageHeader } from '@/components/ui';
import { getProducts } from '@/lib/data';
import { AUTH_LABEL } from '@/lib/labels';
import { formatEUR } from '@/lib/money';
import { productLabel } from '@/lib/types';

export const metadata = { title: 'Stock' };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const { ver = 'stock', q = '' } = await searchParams;
  const all = await getProducts({ archived: ver === 'archivados' });
  const term = q.trim().toLowerCase();
  const list = all
    .filter((p) => (ver === 'stock' ? p.stock_qty > 0 || p.incoming_qty > 0 : true))
    .filter((p) => !term || [p.name, p.brand, p.model, p.variant, p.sku, p.category].some((v) => v?.toLowerCase().includes(term)));
  const units = list.reduce((t, p) => t + p.stock_qty, 0);
  const cost = list.reduce((t, p) => t + p.stock_cost_cents, 0);

  return (
    <>
      <PageHeader title="Stock" subtitle={`${units} ud · ${formatEUR(cost)} a coste`} action={<ButtonLink href="/stock/nuevo" size="sm"><Plus className="size-4" />Producto</ButtonLink>} />
      <form className="mb-3">
        <input type="hidden" name="ver" value={ver} />
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, variante o SKU" aria-label="Buscar"
          className="min-h-11 w-full rounded-2xl border border-line bg-graphite-deep/60 px-4 text-[16px] placeholder:text-faint focus:border-sage/60 focus:outline-none" />
      </form>
      <Chips active={ver} items={[
        { key: 'stock', label: 'Con stock', href: '/stock?ver=stock' },
        { key: 'todos', label: 'Todos', href: '/stock?ver=todos' },
        { key: 'archivados', label: 'Archivados', href: '/stock?ver=archivados' },
      ]} />
      {list.length === 0 ? (
        <EmptyState title={all.length === 0 ? 'Aún no hay productos' : 'Nada que mostrar'} text={all.length === 0 ? 'Crea tus productos (una ficha por variante) y después registra un pedido.' : 'Prueba con otro filtro.'}
          action={all.length === 0 ? <ButtonLink href="/stock/nuevo">Crear producto</ButtonLink> : undefined} />
      ) : (
        <ul className="grid gap-2">
          {list.map((p) => {
            const unitCost = p.stock_qty > 0 ? Math.round(p.stock_cost_cents / p.stock_qty) : null;
            return (
              <li key={p.id}>
                <Link href={`/stock/${p.id}`}>
                  <Card className="transition-colors hover:bg-card-hi">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{productLabel(p)}</p>
                        <p className="mt-0.5 truncate text-xs text-faint">{[p.sku, p.category, p.supplier_name].filter(Boolean).join(' · ') || 'Sin referencia'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-lg font-semibold leading-tight">{p.stock_qty}<span className="ml-0.5 text-xs font-normal text-muted">ud</span></p>
                        {p.incoming_qty > 0 && <p className="text-xs text-sage">+{p.incoming_qty} en camino</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>Coste/ud <b className="num font-medium text-ink">{unitCost != null ? formatEUR(unitCost) : '—'}</b></span>
                      <span>Precio <b className="num font-medium text-ink">{p.expected_price_cents != null ? formatEUR(p.expected_price_cents) : '—'}</b></span>
                      <span>30 días <b className="num font-medium text-ink">{p.sold_30d}</b></span>
                      {p.authenticity_status !== 'pending' && <Badge tone={p.authenticity_status === 'doubtful' ? 'warn' : 'positive'}>{AUTH_LABEL[p.authenticity_status]}</Badge>}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
