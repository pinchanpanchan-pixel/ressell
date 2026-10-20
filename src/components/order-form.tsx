'use client';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { saveOrder } from '@/lib/actions/orders';
import { centsToInput, formatEUR, parseEuroToCents } from '@/lib/money';
import { productLabel, type ProductMetrics, type PurchaseOrderLine, type PurchaseOrderOverview, type Supplier } from '@/lib/types';
import { Field, FormMessage, Input, MoneyInput, Select, SubmitButton, Textarea } from './form';
import { Card, Row } from './ui';

type Line = { key: number; product_id: string; quantity: string; unit_price: string; discount: string };

export function OrderForm({ products, suppliers, requestId, today, order, lines: initialLines, prefill }: {
  products: ProductMetrics[];
  suppliers: Supplier[];
  requestId: string;
  today: string;
  order?: PurchaseOrderOverview;
  lines?: PurchaseOrderLine[];
  prefill?: { product_id: string; quantity: number }[];
}) {
  const [state, action] = useActionState(saveOrder, null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const unitPriceFor = (id: string) => {
    const p = byId.get(id);
    if (!p) return '';
    const c = p.purchased_qty > 0 ? Math.round(p.purchased_base_cents / p.purchased_qty) : p.reference_unit_cost_cents;
    return c != null ? centsToInput(c) : '';
  };
  const [lines, setLines] = useState<Line[]>(() => {
    if (initialLines?.length) return initialLines.map((l, k) => ({ key: k, product_id: l.product_id, quantity: String(l.quantity), unit_price: centsToInput(l.unit_price_cents), discount: l.discount_cents ? centsToInput(l.discount_cents) : '' }));
    if (prefill?.length) return prefill.map((l, k) => ({ key: k, product_id: l.product_id, quantity: String(l.quantity), unit_price: unitPriceFor(l.product_id), discount: '' }));
    return [{ key: 0, product_id: '', quantity: '1', unit_price: '', discount: '' }];
  });
  const [costs, setCosts] = useState({
    shipping: order ? centsToInput(order.shipping_cents) : '',
    packaging: order ? centsToInput(order.packaging_cents) : '',
    other: order ? centsToInput(order.other_costs_cents) : '',
    discount: order ? centsToInput(order.discount_cents) : '',
  });

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const c = (s: string) => parseEuroToCents(s) ?? 0;
  const parsedLines = lines.map((l) => ({ product_id: l.product_id, quantity: Number.parseInt(l.quantity, 10) || 0, unit_price_cents: c(l.unit_price), discount_cents: c(l.discount) }));
  const goods = parsedLines.reduce((t, l) => t + l.quantity * l.unit_price_cents - l.discount_cents, 0);
  const units = parsedLines.reduce((t, l) => t + l.quantity, 0);
  const total = goods - c(costs.discount) + c(costs.shipping) + c(costs.packaging) + c(costs.other);
  const valid = parsedLines.every((l) => l.product_id && l.quantity > 0);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="client_request_id" value={requestId} />
      {order && <input type="hidden" name="id" value={order.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(parsedLines)} />

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Referencia" hint="Vacío = automática"><Input name="reference" defaultValue={order?.reference ?? ''} placeholder="PED-…" /></Field>
          <Field label="Fecha" error={state?.fieldErrors?.order_date}><Input name="order_date" type="date" defaultValue={order?.order_date ?? today} /></Field>
        </div>
        <Field label="Proveedor">
          <Select name="supplier_id" defaultValue={order?.supplier_id ?? ''}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </Card>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Productos</h2>
        <Link href="/stock/nuevo" className="text-sm text-sage">Crear producto</Link>
      </div>
      {products.length === 0 && <Card><p className="text-sm text-muted">Primero crea los productos (una ficha por variante).</p></Card>}
      {lines.map((l, idx) => {
        const lt = (Number.parseInt(l.quantity, 10) || 0) * c(l.unit_price) - c(l.discount);
        return (
          <Card key={l.key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Línea {idx + 1}</span>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-9 place-items-center rounded-full text-muted hover:text-danger" aria-label="Quitar línea"><Trash2 className="size-4" /></button>
              )}
            </div>
            <Select value={l.product_id} onChange={(e) => update(l.key, { product_id: e.target.value, unit_price: l.unit_price || unitPriceFor(e.target.value) })} aria-label="Producto" required>
              <option value="">Elige producto…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
            </Select>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Cantidad"><Input type="number" inputMode="numeric" min={1} value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} /></Field>
              <Field label="Precio/ud"><MoneyInput value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} /></Field>
              <Field label="Descuento"><MoneyInput value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} /></Field>
            </div>
            <p className="num text-right text-sm text-muted">Subtotal <b className="text-ink">{formatEUR(lt)}</b></p>
          </Card>
        );
      })}
      <button type="button" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((x) => x.key)) + 1, product_id: '', quantity: '1', unit_price: '', discount: '' }])}
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted hover:text-ink">
        <Plus className="size-4" />Añadir producto
      </button>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Costes del pedido</h2>
        <p className="-mt-2 text-xs text-faint">Se reparten entre las unidades en proporción a su valor para calcular el coste real.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Envío del proveedor" error={state?.fieldErrors?.shipping_cents}><MoneyInput name="shipping_cents" value={costs.shipping} onChange={(e) => setCosts({ ...costs, shipping: e.target.value })} /></Field>
          <Field label="Empaquetado" error={state?.fieldErrors?.packaging_cents}><MoneyInput name="packaging_cents" value={costs.packaging} onChange={(e) => setCosts({ ...costs, packaging: e.target.value })} /></Field>
          <Field label="Otros costes" error={state?.fieldErrors?.other_costs_cents}><MoneyInput name="other_costs_cents" value={costs.other} onChange={(e) => setCosts({ ...costs, other: e.target.value })} /></Field>
          <Field label="Descuento del pedido" error={state?.fieldErrors?.discount_cents}><MoneyInput name="discount_cents" value={costs.discount} onChange={(e) => setCosts({ ...costs, discount: e.target.value })} /></Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Transportista"><Input name="carrier" defaultValue={order?.carrier ?? ''} /></Field>
          <Field label="Nº de seguimiento"><Input name="tracking_number" defaultValue={order?.tracking_number ?? ''} /></Field>
        </div>
        <Field label="Notas"><Textarea name="notes" defaultValue={order?.notes ?? ''} /></Field>
      </Card>

      <Card>
        <Row label={`Productos (${units} ud)`} value={formatEUR(goods)} />
        <Row label="Envío + empaquetado + otros" value={formatEUR(c(costs.shipping) + c(costs.packaging) + c(costs.other))} />
        {c(costs.discount) > 0 && <Row label="Descuento" value={`−${formatEUR(c(costs.discount))}`} />}
        <div className="my-1 border-t border-line" />
        <Row label="Coste total" value={formatEUR(total)} strong />
        {units > 0 && <Row label="Coste medio por unidad" value={formatEUR(Math.round(total / units))} />}
      </Card>

      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <SubmitButton variant="secondary" name="status" value="draft" disabled={!valid}>Guardar borrador</SubmitButton>
        <SubmitButton name="status" value="pending_payment" disabled={!valid}>Pendiente de pago</SubmitButton>
      </div>
      <p className="text-center text-xs text-faint">Guardar no mueve dinero ni stock. El pago y la recepción se registran después.</p>
    </form>
  );
}
