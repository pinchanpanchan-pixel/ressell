'use client';
import { useActionState } from 'react';
import { saveProduct } from '@/lib/actions/products';
import { AUTH_LABEL } from '@/lib/labels';
import { centsToInput } from '@/lib/money';
import type { ProductMetrics, Supplier } from '@/lib/types';
import { Field, FormMessage, Input, MoneyInput, Select, SubmitButton, Textarea } from './form';
import { useVersionGuard, VersionFields } from './version-guard';

export function ProductForm({ product, suppliers, version }: { product?: ProductMetrics; suppliers: Supplier[]; version?: string }) {
  const [state, action] = useActionState(saveProduct, null);
  const guard = useVersionGuard(version);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      {product && <VersionFields {...guard} />}
      <Field label="Nombre" error={e.name}><Input name="name" defaultValue={product?.name} required placeholder="Ej.: Zapatilla Air" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" error={e.brand}><Input name="brand" defaultValue={product?.brand ?? ''} /></Field>
        <Field label="Modelo" error={e.model}><Input name="model" defaultValue={product?.model ?? ''} /></Field>
      </div>
      <Field label="Variante exacta" hint="Talla, color, capacidad… Cada variante es un producto distinto." error={e.variant}>
        <Input name="variant" defaultValue={product?.variant ?? ''} placeholder="Ej.: Talla 42 · Negro" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría" error={e.category}><Input name="category" defaultValue={product?.category ?? ''} /></Field>
        <Field label="SKU / referencia" error={e.sku}><Input name="sku" defaultValue={product?.sku ?? ''} autoCapitalize="characters" /></Field>
      </div>
      <Field label="Proveedor habitual" error={e.supplier_id}>
        <Select name="supplier_id" defaultValue={product?.supplier_id ?? ''}>
          <option value="">Sin proveedor</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio de venta previsto" error={e.expected_price_cents}><MoneyInput name="expected_price_cents" defaultValue={centsToInput(product?.expected_price_cents)} /></Field>
        <Field label="Coste unitario de referencia" hint="Solo hasta recibir el primer pedido" error={e.reference_unit_cost_cents}><MoneyInput name="reference_unit_cost_cents" defaultValue={centsToInput(product?.reference_unit_cost_cents)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plazo de reposición (días)" hint="Vacío = el del proveedor" error={e.lead_time_days}><Input name="lead_time_days" type="number" inputMode="numeric" min={0} max={365} defaultValue={product?.lead_time_days ?? ''} /></Field>
        <Field label="Autenticidad" error={e.authenticity_status}>
          <Select name="authenticity_status" defaultValue={product?.authenticity_status ?? 'pending'}>
            {Object.entries(AUTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Documentación" error={e.documentation_notes}><Textarea name="documentation_notes" defaultValue={product?.documentation_notes ?? ''} placeholder="Factura, certificado, etiquetas…" /></Field>
      <Field label="Notas" error={e.notes}><Textarea name="notes" defaultValue={product?.notes ?? ''} /></Field>
      <FormMessage state={state} />
      <SubmitButton>{product ? 'Guardar cambios' : 'Crear producto'}</SubmitButton>
    </form>
  );
}
