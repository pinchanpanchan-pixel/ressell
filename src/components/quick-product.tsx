'use client';
import { useState, useTransition } from 'react';
import { quickCreateProduct } from '@/lib/actions/products';
import type { ProductMetrics } from '@/lib/types';
import { Field, Input, MoneyInput } from './form';
import { buttonClass, Card, Notice } from './ui';

const EMPTY = { name: '', brand: '', model: '', variant: '', category: '', expected_price_cents: '', reference_unit_cost_cents: '' };

/** Alta rápida de un producto sin salir del pedido. No es un <form> porque va dentro del formulario del pedido. */
export function QuickProduct({ supplierId, categories, onCreated, onClose }: {
  supplierId: string;
  categories: string[];
  onCreated: (p: ProductMetrics, unitCostInput: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  function create() {
    setError(null);
    setFieldErrors({});
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.set(k, val));
    fd.set('supplier_id', supplierId);
    fd.set('authenticity_status', 'pending');
    start(async () => {
      const res = await quickCreateProduct(fd);
      if (res.ok) {
        onCreated(res.product, v.reference_unit_cost_cents);
        setV(EMPTY);
      } else {
        setError(res.message);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3 border-sage/40">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Nuevo producto</h3>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Cerrar</button>
      </div>
      <p className="-mt-2 text-xs text-faint">Se crea al momento y se añade a este pedido. Los demás datos los puedes completar luego en su ficha.</p>
      <Field label="Nombre" error={fieldErrors.name}><Input value={v.name} onChange={set('name')} placeholder="Ej.: Dior Sauvage Elixir" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca"><Input value={v.brand} onChange={set('brand')} /></Field>
        <Field label="Modelo"><Input value={v.model} onChange={set('model')} /></Field>
        <Field label="Variante"><Input value={v.variant} onChange={set('variant')} placeholder="Talla, ml, color…" /></Field>
        <Field label="Categoría">
          <Input value={v.category} onChange={set('category')} list="quick-categories" autoComplete="off" />
          <datalist id="quick-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Precio venta previsto" error={fieldErrors.expected_price_cents}><MoneyInput value={v.expected_price_cents} onChange={set('expected_price_cents')} /></Field>
        <Field label="Coste unitario" error={fieldErrors.reference_unit_cost_cents}><MoneyInput value={v.reference_unit_cost_cents} onChange={set('reference_unit_cost_cents')} /></Field>
      </div>
      {error && <Notice tone="negative">{error}</Notice>}
      <button type="button" onClick={create} disabled={pending || !v.name.trim()} className={buttonClass('primary', 'md', true)}>
        {pending ? 'Creando…' : 'Crear y añadir al pedido'}
      </button>
    </Card>
  );
}
