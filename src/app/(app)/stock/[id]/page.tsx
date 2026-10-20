import { randomUUID } from 'node:crypto';
import { Pencil, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Attachments } from '@/components/attachments';
import { Badge, ButtonLink, buttonClass, Card, PageHeader, Row, SectionTitle, Stat } from '@/components/ui';
import { WriteOffForm } from '@/components/write-off-form';
import { setProductArchived } from '@/lib/actions/products';
import { buildInsight } from '@/lib/analytics';
import { requireOwner } from '@/lib/auth';
import { getAttachments, getPlannerSettings, getProduct, getProductMovements } from '@/lib/data';
import { formatDate, todayISO } from '@/lib/dates';
import { AUTH_LABEL, MOVEMENT_LABEL } from '@/lib/labels';
import { formatEUR, formatPct } from '@/lib/money';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireOwner();
  const [p, movements, settings, files] = await Promise.all([getProduct(id), getProductMovements(id), getPlannerSettings(), getAttachments('product', id)]);
  const i = buildInsight(p, { coverageDays: settings.coverage_days, defaultLeadTimeDays: settings.default_lead_time_days, fallbackUnitCostCents: settings.unit_cost_cents });
  const per = (cents: number) => (p.purchased_qty > 0 ? formatEUR(Math.round(cents / p.purchased_qty)) : '—');
  const today = todayISO();

  return (
    <>
      <PageHeader title={p.name} back="/stock" subtitle={[p.brand, p.model, p.variant].filter(Boolean).join(' · ') || undefined}
        action={<Link href={`/stock/${id}/editar`} className={buttonClass('ghost', 'sm')}><Pencil className="size-4" />Editar</Link>} />

      <div className="flex flex-wrap gap-2">
        <Badge tone={p.authenticity_status === 'doubtful' ? 'warn' : p.authenticity_status === 'pending' ? 'neutral' : 'positive'}>{AUTH_LABEL[p.authenticity_status]}</Badge>
        {p.sku && <Badge>SKU {p.sku}</Badge>}
        {p.category && <Badge>{p.category}</Badge>}
        {p.archived && <Badge tone="warn">Archivado</Badge>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Disponibles" value={`${p.stock_qty} ud`} hint={p.incoming_qty ? `+${p.incoming_qty} en camino` : `${p.purchased_qty} compradas`} />
        <Stat label="Vendidas" value={`${p.units_sold} ud`} hint={`${p.sold_7d} · ${p.sold_30d} · ${p.sold_90d} (7/30/90 d)`} />
        <Stat label="Beneficio acumulado" value={formatEUR(p.profit_cents)} tone={p.profit_cents >= 0 ? 'positive' : 'negative'} hint={`Margen ${formatPct(i.marginRatio)}`} />
        <Stat label="Capital inmovilizado" value={formatEUR(p.stock_cost_cents)} hint={i.coverageDays != null ? `Cubre ~${Math.round(i.coverageDays)} días` : 'Sin ritmo de venta aún'} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <ButtonLink href={`/ventas/nueva?producto=${id}`} size="lg"><ShoppingCart className="size-5" />Vender</ButtonLink>
        <ButtonLink href={`/pedidos/nuevo?prefill=${id}:1`} size="lg" variant="secondary">Reponer</ButtonLink>
      </div>

      <SectionTitle>Coste unitario real</SectionTitle>
      <Card>
        <Row label="Compra" value={per(p.purchased_base_cents)} />
        <Row label="Envío proporcional" value={per(p.purchased_shipping_cents)} />
        <Row label="Costes adicionales (neto de descuentos)" value={per(p.purchased_extra_cents)} />
        <div className="my-1 border-t border-line" />
        <Row label="Coste unitario real medio" value={per(p.purchased_cost_cents)} strong hint={p.purchased_qty === 0 ? `Referencia: ${p.reference_unit_cost_cents != null ? formatEUR(p.reference_unit_cost_cents) : 'sin definir'}` : undefined} />
        <Row label="Precio de venta previsto" value={p.expected_price_cents != null ? formatEUR(p.expected_price_cents) : '—'} />
        <Row label="Precio de venta real medio" value={p.units_sold > 0 ? formatEUR(Math.round(p.revenue_cents / p.units_sold)) : '—'} />
      </Card>

      <SectionTitle>Rendimiento</SectionTitle>
      <Card>
        <Row label="Velocidad de venta" value={`${i.weeklyRate.toFixed(1).replace('.', ',')} ud/semana`} />
        <Row label="Tiempo medio hasta la venta" value={p.avg_days_to_sell != null ? `${String(p.avg_days_to_sell).replace('.', ',')} días` : '—'} hint="Desde la recepción" />
        <Row label="Beneficio por unidad" value={i.profitPerUnitCents != null ? formatEUR(i.profitPerUnitCents) : '—'} />
        <Row label="Vendido sobre lo comprado" value={formatPct(i.sellThrough)} />
        <Row label="Bajas (defectuosos, pérdidas)" value={`${p.units_written_off} ud · ${formatEUR(p.written_off_cost_cents)}`} />
        <Row label="Recomendación" value={i.recommendation.units > 0 ? `Comprar ${i.recommendation.units}` : 'No reponer'} hint={`${i.recommendation.provisional ? 'Provisional · ' : ''}${i.recommendation.reason}`} strong />
      </Card>

      {(p.documentation_notes || p.notes) && (
        <>
          <SectionTitle>Notas</SectionTitle>
          <Card className="space-y-3 text-sm">
            {p.documentation_notes && <div><p className="text-xs text-muted">Documentación</p><p className="whitespace-pre-wrap">{p.documentation_notes}</p></div>}
            {p.notes && <div><p className="text-xs text-muted">Notas</p><p className="whitespace-pre-wrap">{p.notes}</p></div>}
          </Card>
        </>
      )}

      <SectionTitle>Fotos y documentos</SectionTitle>
      <Card><Attachments entityType="product" entityId={id} ownerId={user.id} items={files} /></Card>

      <SectionTitle>Historial de movimientos</SectionTitle>
      <Card className="py-1">
        {movements.length === 0 ? <p className="py-3 text-sm text-muted">Sin movimientos todavía.</p> : (
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">{MOVEMENT_LABEL[m.movement_type]}</p>
                  <p className="truncate text-xs text-faint">{formatDate(m.movement_date)}{m.note ? ` · ${m.note}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className={`num text-sm font-medium ${m.quantity > 0 ? 'text-sage' : 'text-ink'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity} ud</p>
                  <p className="num text-xs text-faint">{formatEUR(m.cost_cents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.stock_qty > 0 && (
        <>
          <SectionTitle>Baja de unidades</SectionTitle>
          <Card>
            <p className="mb-3 text-sm text-muted">Para unidades defectuosas, rotas o perdidas. Su coste real se registra como pérdida.</p>
            <WriteOffForm productId={id} max={p.stock_qty} requestId={randomUUID()} today={today} />
          </Card>
        </>
      )}

      <form action={setProductArchived} className="mt-6">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={String(!p.archived)} />
        <button className={buttonClass('ghost', 'md', true)}>{p.archived ? 'Recuperar producto' : 'Archivar producto'}</button>
      </form>
    </>
  );
}
