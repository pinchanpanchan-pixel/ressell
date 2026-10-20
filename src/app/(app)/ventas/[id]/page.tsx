import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Attachments } from '@/components/attachments';
import { Flash } from '@/components/flash';
import { ConfirmSubmit, Field, Input, MoneyInput, Select, SubmitButton, Textarea } from '@/components/form';
import { Badge, Card, PageHeader, Row, SectionTitle } from '@/components/ui';
import { cancelSale, markSalePaid, registerReturn, updateDelivery } from '@/lib/actions/sales';
import { requireOwner } from '@/lib/auth';
import { getAttachments, getSale } from '@/lib/data';
import { formatDate, todayISO } from '@/lib/dates';
import { DELIVERY_LABEL, LEDGER_LABEL } from '@/lib/labels';
import { formatEUR } from '@/lib/money';
import { productLabel } from '@/lib/types';

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { id } = await params;
  const { ok } = await searchParams;
  const { user } = await requireOwner();
  const [{ sale: s, returns, ledger }, files] = await Promise.all([getSale(id), getAttachments('sale', id)]);
  const today = todayISO();
  const active = s.status === 'confirmed';
  const remaining = s.quantity - s.returned_quantity;
  const refundable = s.revenue_cents - s.refunded_cents;
  const label = productLabel({ name: s.product_name, brand: s.product_brand, model: s.product_model, variant: s.product_variant });

  return (
    <>
      <PageHeader title="Venta" back="/ventas" subtitle={`${formatDate(s.sale_date)}${s.channel ? ` · ${s.channel}` : ''}`} />
      <Flash code={ok} />

      <Card>
        <Link href={`/stock/${s.product_id}`} className="font-medium hover:text-sage">{label}</Link>
        <div className="mt-2 flex flex-wrap gap-2">
          {active ? (
            <>
              <Badge tone={s.payment_status === 'paid' ? 'positive' : 'warn'}>{s.payment_status === 'paid' ? `Cobrada ${formatDate(s.paid_at)}` : 'Por cobrar'}</Badge>
              <Badge tone={s.delivery_status === 'delivered' ? 'positive' : s.delivery_status === 'returned' ? 'negative' : 'neutral'}>{DELIVERY_LABEL[s.delivery_status]}</Badge>
            </>
          ) : <Badge tone="negative">Cancelada {formatDate(s.cancelled_at)}</Badge>}
          {s.customer && <Badge>{s.customer}</Badge>}
        </div>
      </Card>

      <SectionTitle>Resultado</SectionTitle>
      <Card>
        <Row label={`${s.quantity} × ${formatEUR(s.unit_price_cents)}`} value={formatEUR(s.quantity * s.unit_price_cents)} />
        {s.discount_cents > 0 && <Row label="Descuento" value={`−${formatEUR(s.discount_cents)}`} />}
        {s.refunded_cents > 0 && <Row label="Reembolsado" value={`−${formatEUR(s.refunded_cents)}`} />}
        <Row label="Comisión de plataforma" value={`−${formatEUR(s.platform_fee_cents)}`} />
        <Row label="Envío asumido" value={`−${formatEUR(s.shipping_cost_cents)}`} />
        {s.other_costs_cents > 0 && <Row label="Otros gastos" value={`−${formatEUR(s.other_costs_cents)}`} />}
        <Row label="Coste real de las unidades" value={`−${formatEUR(s.cogs_cents - s.restocked_cost_cents)}`} hint={s.restocked_cost_cents > 0 ? `${formatEUR(s.restocked_cost_cents)} volvieron al stock` : undefined} />
        <div className="my-1 border-t border-line" />
        <Row label="Beneficio de la operación" value={formatEUR(s.profit_cents)} strong tone={s.profit_cents >= 0 ? 'positive' : 'negative'} hint={!active ? 'Venta cancelada: sin efecto' : undefined} />
      </Card>

      {active && (
        <>
          <SectionTitle>Acciones</SectionTitle>
          <div className="flex flex-col gap-3">
            {s.payment_status === 'pending' && (
              <Card>
                <ActionForm action={markSalePaid} hidden={{ id }}>
                  <Field label="Fecha del cobro"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
                  <ConfirmSubmit variant="primary" confirmText={`Confirmar cobro`}>Marcar como cobrada</ConfirmSubmit>
                </ActionForm>
              </Card>
            )}
            {s.delivery_status !== 'returned' && (
              <Card>
                <ActionForm action={updateDelivery} hidden={{ id }}>
                  <Field label="Estado de la entrega">
                    <Select name="delivery_status" defaultValue={s.delivery_status}><option value="pending">Por enviar</option><option value="shipped">Enviado</option><option value="delivered">Entregado</option></Select>
                  </Field>
                  <Field label="Notas"><Textarea name="notes" rows={2} defaultValue={s.notes ?? ''} /></Field>
                  <SubmitButton variant="secondary" size="md">Guardar entrega</SubmitButton>
                </ActionForm>
              </Card>
            )}
          </div>

          {remaining > 0 && (
            <>
              <SectionTitle>Registrar devolución</SectionTitle>
              <Card>
                <ActionForm action={registerReturn} hidden={{ sale_id: id }} requestId={randomUUID()}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Unidades"><Input name="quantity" type="number" inputMode="numeric" min={1} max={remaining} defaultValue={remaining} required /></Field>
                    <Field label="Reembolso" hint={s.payment_status === 'paid' ? `Máx. ${formatEUR(refundable)}` : 'Sin cobrar: 0'}><MoneyInput name="refund_cents" defaultValue="" disabled={s.payment_status !== 'paid'} /></Field>
                  </div>
                  <Field label="Estado del producto devuelto">
                    <Select name="condition" defaultValue="restock"><option value="restock">Buen estado: vuelve al stock</option><option value="defective">Defectuoso: se registra como pérdida</option></Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Fecha"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
                    <Field label="Motivo"><Input name="reason" /></Field>
                  </div>
                  <ConfirmSubmit variant="secondary" confirmText="Confirmar devolución">Registrar devolución</ConfirmSubmit>
                </ActionForm>
              </Card>
            </>
          )}

          {returns.length === 0 && (
            <>
              <SectionTitle>Cancelar venta</SectionTitle>
              <Card>
                <ActionForm action={cancelSale} hidden={{ id }}>
                  <p className="text-sm text-muted">Repone el stock con su coste original{s.payment_status === 'paid' ? ' y anula el cobro en caja' : ''}. El historial se conserva.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Fecha"><Input type="date" name="date" defaultValue={today} max={today} /></Field>
                    <Field label="Motivo"><Input name="reason" /></Field>
                  </div>
                  <ConfirmSubmit variant="danger" confirmText="Sí, cancelar venta">Cancelar venta</ConfirmSubmit>
                </ActionForm>
              </Card>
            </>
          )}
        </>
      )}

      {returns.length > 0 && (
        <>
          <SectionTitle>Devoluciones</SectionTitle>
          <Card className="py-1">
            <ul className="divide-y divide-line">
              {returns.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span><span className="block">{r.quantity} ud · {r.restocked ? 'repuesta(s)' : 'defectuosa(s)'}</span><span className="text-xs text-faint">{formatDate(r.return_date)}{r.reason ? ` · ${r.reason}` : ''}</span></span>
                  <span className="num">−{formatEUR(r.refund_cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {ledger.length > 0 && (
        <>
          <SectionTitle>Movimientos de caja</SectionTitle>
          <Card className="py-1">
            <ul className="divide-y divide-line">
              {ledger.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block">{LEDGER_LABEL[e.category]}{e.reverses_entry_id ? ' (anulación)' : ''}</span><span className="text-xs text-faint">{formatDate(e.entry_date)}</span></span>
                  <span className={`num ${e.amount_cents > 0 ? 'text-sage' : ''}`}>{formatEUR(e.amount_cents, { sign: true })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle>Justificantes</SectionTitle>
      <Card><Attachments entityType="sale" entityId={id} ownerId={user.id} items={files} /></Card>
    </>
  );
}
