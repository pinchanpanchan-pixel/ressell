import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Attachments } from '@/components/attachments';
import { Flash } from '@/components/flash';
import { ConfirmSubmit, Field, Input, SubmitButton, Textarea } from '@/components/form';
import { Badge, buttonClass, Card, Notice, PageHeader, Row, SectionTitle } from '@/components/ui';
import { cancelOrder, payOrder, receiveOrder, setOrderStatus, updateOrderInfo } from '@/lib/actions/orders';
import { requireOwner } from '@/lib/auth';
import { getAttachments, getOrder, getProducts } from '@/lib/data';
import { formatDate, todayISO } from '@/lib/dates';
import { LEDGER_LABEL, PO_STATUS_LABEL, poStatusTone } from '@/lib/labels';
import { formatEUR } from '@/lib/money';
import { productLabel } from '@/lib/types';

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  const { user } = await requireOwner();
  const [{ order: o, lines, lots, ledger }, products, files] = await Promise.all([getOrder(id), getProducts(), getAttachments('purchase_order', id)]);
  const names = new Map(products.map((p) => [p.id, productLabel(p)]));
  const lotByLine = new Map(lots.map((l) => [l.purchase_order_line_id, l]));
  const today = todayISO();
  const cancelled = o.status === 'cancelled';
  const editable = !o.paid_at && !o.received_at && (o.status === 'draft' || o.status === 'pending_payment');

  return (
    <>
      <PageHeader title={o.reference} back="/pedidos" subtitle={`${formatDate(o.order_date)} · ${o.supplier_name ?? 'Sin proveedor'}`}
        action={editable ? <Link href={`/pedidos/${id}/editar`} className={buttonClass('ghost', 'sm')}><Pencil className="size-4" />Editar</Link> : undefined} />

      <Flash code={ok} />
      <div className="flex flex-wrap gap-2">
        <Badge tone={poStatusTone(o.status)}>{PO_STATUS_LABEL[o.status]}</Badge>
        <Badge tone={o.paid_at ? 'positive' : 'warn'}>{o.paid_at ? `Pagado ${formatDate(o.paid_at)}` : 'Sin pagar'}</Badge>
        <Badge tone={o.received_at ? 'positive' : 'neutral'}>{o.received_at ? `Recibido ${formatDate(o.received_at)}` : 'No recibido'}</Badge>
      </div>

      <SectionTitle>Productos</SectionTitle>
      <Card className="py-1">
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const lot = lotByLine.get(l.id);
            return (
              <li key={l.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium">{names.get(l.product_id) ?? 'Producto'}</p>
                  <p className="num shrink-0 text-sm">{formatEUR(l.quantity * l.unit_price_cents - l.discount_cents)}</p>
                </div>
                <p className="num mt-0.5 text-xs text-faint">
                  {l.quantity} × {formatEUR(l.unit_price_cents)}{l.discount_cents ? ` − ${formatEUR(l.discount_cents)}` : ''}
                  {lot && ` · coste real ${formatEUR(Math.round(lot.cost_total_cents / lot.quantity_initial))}/ud`}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-3">
        <Row label={`Productos (${o.total_units} ud)`} value={formatEUR(o.goods_cents)} />
        {o.discount_cents > 0 && <Row label="Descuento" value={`−${formatEUR(o.discount_cents)}`} />}
        <Row label="Envío" value={formatEUR(o.shipping_cents)} />
        {o.packaging_cents > 0 && <Row label="Empaquetado" value={formatEUR(o.packaging_cents)} />}
        {o.other_costs_cents > 0 && <Row label="Otros costes" value={formatEUR(o.other_costs_cents)} />}
        <div className="my-1 border-t border-line" />
        <Row label="Coste total" value={formatEUR(o.total_cents)} strong />
      </Card>

      {!cancelled && (
        <>
          <SectionTitle>Acciones</SectionTitle>
          <div className="flex flex-col gap-3">
            {o.status === 'draft' && (
              <ActionForm action={setOrderStatus} hidden={{ id, status: 'pending_payment' }}>
                <SubmitButton variant="secondary" size="md">Marcar pendiente de pago</SubmitButton>
              </ActionForm>
            )}
            {!o.paid_at && (
              <Card>
                <ActionForm action={payOrder} hidden={{ id }}>
                  <p className="text-sm text-muted">Registra el pago de <b className="text-ink">{formatEUR(o.total_cents)}</b> en caja. El stock no cambia hasta la recepción.</p>
                  <Field label="Fecha del pago"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
                  <ConfirmSubmit variant="primary" confirmText={`Confirmar pago de ${formatEUR(o.total_cents)}`}>Registrar pago</ConfirmSubmit>
                </ActionForm>
              </Card>
            )}
            {!o.received_at && o.status !== 'shipped' && (o.paid_at || o.status === 'pending_payment') && (
              <ActionForm action={setOrderStatus} hidden={{ id, status: 'shipped' }}>
                <SubmitButton variant="secondary" size="md">Marcar como enviado</SubmitButton>
              </ActionForm>
            )}
            {!o.received_at && (
              <Card>
                <ActionForm action={receiveOrder} hidden={{ id }}>
                  <p className="text-sm text-muted">Añade <b className="text-ink">{o.total_units} unidades</b> al stock con su coste real. Solo se puede hacer una vez.</p>
                  <Field label="Fecha de recepción"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
                  <ConfirmSubmit variant="primary" confirmText="Confirmar recepción">Registrar recepción</ConfirmSubmit>
                </ActionForm>
              </Card>
            )}
            {o.status === 'received' && (
              <ActionForm action={setOrderStatus} hidden={{ id, status: 'reviewed' }}>
                <SubmitButton variant="secondary" size="md">Marcar como revisado</SubmitButton>
              </ActionForm>
            )}
            {o.received_at && (
              <Notice>Si alguna unidad llegó defectuosa, dala de baja desde la ficha del producto. Si el proveedor te reembolsa, regístralo en Finanzas como «Reembolso de proveedor».</Notice>
            )}
          </div>
        </>
      )}

      <SectionTitle>Seguimiento e incidencias</SectionTitle>
      <Card>
        <ActionForm action={updateOrderInfo} hidden={{ id }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Transportista"><Input name="carrier" defaultValue={o.carrier ?? ''} /></Field>
            <Field label="Nº de seguimiento"><Input name="tracking_number" defaultValue={o.tracking_number ?? ''} /></Field>
          </div>
          <Field label="Incidencias"><Textarea name="incidents" defaultValue={o.incidents ?? ''} placeholder="Retrasos, faltas, defectos…" /></Field>
          <Field label="Notas"><Textarea name="notes" defaultValue={o.notes ?? ''} /></Field>
          <SubmitButton variant="secondary" size="md">Guardar</SubmitButton>
        </ActionForm>
      </Card>

      <SectionTitle>Documentos</SectionTitle>
      <Card><Attachments entityType="purchase_order" entityId={id} ownerId={user.id} items={files} /></Card>

      {ledger.length > 0 && (
        <>
          <SectionTitle>Movimientos de caja</SectionTitle>
          <Card className="py-1">
            <ul className="divide-y divide-line">
              {ledger.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block">{LEDGER_LABEL[e.category]}</span><span className="text-xs text-faint">{formatDate(e.entry_date)}</span></span>
                  <span className={`num ${e.amount_cents > 0 ? 'text-sage' : ''}`}>{formatEUR(e.amount_cents, { sign: true })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {!cancelled && !o.received_at && (
        <>
          <SectionTitle>Cancelar pedido</SectionTitle>
          <Card>
            <ActionForm action={cancelOrder} hidden={{ id }}>
              {o.paid_at && (
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" name="refund" className="size-5 accent-[#91A785]" />
                  El proveedor me ha devuelto el pago ({formatEUR(o.paid_amount_cents ?? o.total_cents)})
                </label>
              )}
              <Field label="Fecha"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
              <ConfirmSubmit variant="danger" confirmText="Sí, cancelar pedido">Cancelar pedido</ConfirmSubmit>
            </ActionForm>
          </Card>
        </>
      )}
    </>
  );
}
