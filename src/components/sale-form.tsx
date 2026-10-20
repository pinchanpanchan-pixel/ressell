'use client';
import { useActionState, useMemo, useState } from 'react';
import { registerSale } from '@/lib/actions/sales';
import { centsToInput, formatEUR, parseEuroToCents } from '@/lib/money';
import { productLabel, type ProductMetrics } from '@/lib/types';
import { Field, FormMessage, Input, MoneyInput, Select, SubmitButton, Textarea } from './form';
import { Card, Notice, Row } from './ui';

export function SaleForm({ products, requestId, today, defaultProductId, channels }: { products: ProductMetrics[]; requestId: string; today: string; defaultProductId?: string; channels: string[] }) {
  const [state, action] = useActionState(registerSale, null);
  const inStock = useMemo(() => products.filter((p) => p.stock_qty > 0), [products]);
  const [productId, setProductId] = useState(defaultProductId && inStock.some((p) => p.id === defaultProductId) ? defaultProductId : '');
  const product = inStock.find((p) => p.id === productId);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState(product?.expected_price_cents != null ? centsToInput(product.expected_price_cents) : '');
  const [m, setM] = useState({ discount: '', fee: '', shipping: '', other: '' });
  const c = (s: string) => parseEuroToCents(s) ?? 0;
  const q = Number.parseInt(qty, 10) || 0;
  const revenue = q * c(price) - c(m.discount);
  const unitCost = product && product.stock_qty > 0 ? Math.round(product.stock_cost_cents / product.stock_qty) : 0;
  const profit = revenue - c(m.fee) - c(m.shipping) - c(m.other) - q * unitCost;
  const e = state?.fieldErrors ?? {};

  if (inStock.length === 0) {
    return <Notice tone="warn">No hay productos con stock disponible. Registra y recibe un pedido antes de vender.</Notice>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="client_request_id" value={requestId} />
      <Card className="flex flex-col gap-4">
        <Field label="Producto y variante" error={e.product_id}>
          <Select name="product_id" value={productId} required onChange={(ev) => {
            const p = inStock.find((x) => x.id === ev.target.value);
            setProductId(ev.target.value);
            if (p?.expected_price_cents != null) setPrice(centsToInput(p.expected_price_cents));
          }}>
            <option value="">Elige producto…</option>
            {inStock.map((p) => <option key={p.id} value={p.id}>{productLabel(p)} — {p.stock_qty} ud</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad" error={e.quantity} hint={product ? `Disponibles: ${product.stock_qty}` : undefined}>
            <Input name="quantity" type="number" inputMode="numeric" min={1} max={product?.stock_qty} value={qty} onChange={(ev) => setQty(ev.target.value)} required />
          </Field>
          <Field label="Precio por unidad" error={e.unit_price_cents}><MoneyInput name="unit_price_cents" value={price} onChange={(ev) => setPrice(ev.target.value)} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" error={e.sale_date}><Input name="sale_date" type="date" defaultValue={today} max={today} /></Field>
          <Field label="Canal">
            <Input name="channel" list="channels" placeholder="Vinted, Wallapop…" />
            <datalist id="channels">{channels.map((ch) => <option key={ch} value={ch} />)}</datalist>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Costes de la venta</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Descuento" error={e.discount_cents}><MoneyInput name="discount_cents" value={m.discount} onChange={(ev) => setM({ ...m, discount: ev.target.value })} /></Field>
          <Field label="Comisión plataforma" error={e.platform_fee_cents}><MoneyInput name="platform_fee_cents" value={m.fee} onChange={(ev) => setM({ ...m, fee: ev.target.value })} /></Field>
          <Field label="Envío asumido por mí" error={e.shipping_cost_cents}><MoneyInput name="shipping_cost_cents" value={m.shipping} onChange={(ev) => setM({ ...m, shipping: ev.target.value })} /></Field>
          <Field label="Otros gastos" error={e.other_costs_cents}><MoneyInput name="other_costs_cents" value={m.other} onChange={(ev) => setM({ ...m, other: ev.target.value })} /></Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pago">
            <Select name="payment_status" defaultValue="paid"><option value="paid">Cobrado</option><option value="pending">Pendiente de cobro</option></Select>
          </Field>
          <Field label="Entrega">
            <Select name="delivery_status" defaultValue="pending"><option value="pending">Por enviar</option><option value="shipped">Enviado</option><option value="delivered">Entregado</option></Select>
          </Field>
        </div>
        <Field label="Comprador (opcional)"><Input name="customer" autoComplete="off" /></Field>
        <Field label="Notas"><Textarea name="notes" rows={2} /></Field>
      </Card>

      <Card>
        <Row label="Ingreso" value={formatEUR(revenue)} />
        <Row label="Costes de venta" value={`−${formatEUR(c(m.fee) + c(m.shipping) + c(m.other))}`} />
        <Row label="Coste de las unidades" value={`−${formatEUR(q * unitCost)}`} hint="Coste real de adquisición (lotes más antiguos primero)" />
        <div className="my-1 border-t border-line" />
        <Row label="Beneficio estimado" value={formatEUR(profit)} strong tone={profit >= 0 ? 'positive' : 'negative'} />
      </Card>

      <FormMessage state={state} />
      <SubmitButton pendingText="Registrando…" disabled={!product || q < 1 || q > (product?.stock_qty ?? 0)}>Registrar venta</SubmitButton>
    </form>
  );
}
