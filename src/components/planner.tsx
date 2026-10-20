'use client';
import { Plus, Trash2 } from 'lucide-react';
import { useActionState, useMemo, useState } from 'react';
import { savePlannerSettings } from '@/lib/actions/settings';
import { centsToInput, formatEUR, formatPct, parseEuroToCents } from '@/lib/money';
import { DEFAULT_SCENARIOS, evaluateMix, simulate, type Scenario } from '@/lib/planner';
import type { PlannerSettings } from '@/lib/types';
import { Field, FormMessage, Input, MoneyInput, Select, SubmitButton } from './form';
import { Card, cx, Notice, Row, SectionTitle } from './ui';

type ProductOption = { id: string; label: string; unitCostCents: number; priceCents: number };

export function Planner({ settings, cashCents, weeklyRate, products }: { settings: PlannerSettings; cashCents: number; weeklyRate: number; products: ProductOption[] }) {
  const [source, setSource] = useState<'reference' | 'cash'>(cashCents > 0 ? 'cash' : 'reference');
  const [v, setV] = useState({
    capital: centsToInput(settings.reference_capital_cents),
    unitCost: centsToInput(settings.unit_cost_cents),
    shipping: centsToInput(settings.supplier_shipping_cents),
    other: centsToInput(settings.other_order_costs_cents),
    price: centsToInput(settings.avg_sale_price_cents),
    sellerShipping: centsToInput(settings.seller_shipping_cents),
    fee: String(settings.platform_fee_bps / 100),
    reinvest: String(settings.reinvest_bps / 100),
    reserve: String(settings.reserve_bps / 100),
    units: '',
  });
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const c = (s: string) => parseEuroToCents(s) ?? 0;
  const pct = (s: string) => Math.round(Math.min(Math.max(Number(s.replace(',', '.')) || 0, 0), 100) * 100);
  const available = source === 'cash' ? cashCents : c(v.capital);

  const input = {
    availableCents: available,
    reinvestBps: pct(v.reinvest),
    reserveBps: pct(v.reserve),
    unitCostCents: c(v.unitCost),
    supplierShippingCents: c(v.shipping),
    otherCostsCents: c(v.other),
    salePriceCents: c(v.price),
    platformFeeBps: pct(v.fee),
    sellerShippingCents: c(v.sellerShipping),
    units: v.units ? Number.parseInt(v.units, 10) : null,
  };
  const r = simulate(input, scenarios);
  const weeksToSell = weeklyRate > 0 && r.units > 0 ? r.units / weeklyRate : null;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-graphite-deep/60 p-1">
          {(['cash', 'reference'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} className={cx('min-h-10 rounded-xl text-sm font-medium', source === s ? 'bg-card-hi text-ink' : 'text-muted')}>
              {s === 'cash' ? `Caja real (${formatEUR(cashCents)})` : 'Capital de referencia'}
            </button>
          ))}
        </div>
        {source === 'reference' && <Field label="Capital disponible de referencia"><MoneyInput value={v.capital} onChange={set('capital')} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coste unitario" hint="Incluido empaquetado"><MoneyInput value={v.unitCost} onChange={set('unitCost')} /></Field>
          <Field label="Envío del proveedor" hint="Por pedido"><MoneyInput value={v.shipping} onChange={set('shipping')} /></Field>
          <Field label="Otros costes del pedido"><MoneyInput value={v.other} onChange={set('other')} /></Field>
          <Field label="Precio de venta medio"><MoneyInput value={v.price} onChange={set('price')} /></Field>
          <Field label="Comisión plataforma (%)"><Input inputMode="decimal" value={v.fee} onChange={set('fee')} /></Field>
          <Field label="Envío asumido por venta" hint="0 si lo paga el comprador"><MoneyInput value={v.sellerShipping} onChange={set('sellerShipping')} /></Field>
          <Field label="Objetivo de reinversión (%)"><Input inputMode="decimal" value={v.reinvest} onChange={set('reinvest')} /></Field>
          <Field label="Reserva (%)" hint="Devoluciones, incidencias, impuestos"><Input inputMode="decimal" value={v.reserve} onChange={set('reserve')} /></Field>
        </div>
        <Field label="Unidades a comprar" hint={`Máximo con este presupuesto: ${r.maxUnits}. Vacío = máximo.`}>
          <Input type="number" inputMode="numeric" min={0} max={r.maxUnits} value={v.units} onChange={set('units')} placeholder={String(r.maxUnits)} />
        </Field>
        {r.clamped && <Notice tone="warn">Esa cantidad supera el presupuesto. Se limita a {r.maxUnits} unidades.</Notice>}
      </Card>

      <SectionTitle>Resultado del pedido</SectionTitle>
      <Card>
        <Row label="Presupuesto para el pedido" value={formatEUR(r.budgetCents)} hint={`Reserva apartada: ${formatEUR(r.reserveCents)}`} />
        <Row label="Unidades" value={`${r.units} ud`} strong />
        <Row label="Coste del pedido" value={formatEUR(r.orderCostCents)} hint={`${r.units} × ${formatEUR(input.unitCostCents)} + ${formatEUR(r.fixedCostsCents)} fijos`} />
        <Row label="Dinero restante tras comprar" value={formatEUR(r.remainingCents)} />
        <div className="my-1 border-t border-line" />
        <Row label="Facturación potencial" value={formatEUR(r.potentialRevenueCents)} />
        <Row label="Beneficio potencial (antes de comisiones)" value={formatEUR(r.potentialGrossProfitCents)} />
        <Row label="Beneficio estimado tras costes" value={formatEUR(r.potentialNetProfitCents)} strong tone={r.potentialNetProfitCents >= 0 ? 'positive' : 'negative'} />
        <Row label="Capital esperado al vender todo" value={formatEUR(r.expectedCapitalAfterCents)} />
        {r.breakEvenUnits != null && <Row label="Unidades para recuperar la inversión" value={`${r.breakEvenUnits} ud`} />}
        {weeksToSell != null && <Row label="Tiempo estimado de venta" value={`~${Math.ceil(weeksToSell)} semanas`} hint={`Según tu ritmo real (${weeklyRate.toFixed(1).replace('.', ',')} ud/semana)`} />}
      </Card>

      <SectionTitle>Escenarios</SectionTitle>
      <p className="-mt-1 mb-3 px-1 text-xs text-faint">No se asume que vendas todo de inmediato. Ajusta qué parte del lote vendes y a qué precio.</p>
      <div className="grid gap-2">
        {r.scenarios.map((sc, idx) => (
          <Card key={sc.key}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">{sc.label}</p>
              <p className={cx('num font-semibold', sc.cashProfitCents >= 0 ? 'text-sage' : 'text-danger')}>{formatEUR(sc.cashProfitCents, { sign: true })}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendo del lote (%)"><Input inputMode="decimal" value={String(Math.round(scenarios[idx].sellThrough * 100))}
                onChange={(e) => setScenarios((s) => s.map((x, i) => (i === idx ? { ...x, sellThrough: (Number(e.target.value) || 0) / 100 } : x)))} /></Field>
              <Field label="Precio vs previsto (%)"><Input inputMode="decimal" value={String(Math.round(scenarios[idx].priceFactor * 100))}
                onChange={(e) => setScenarios((s) => s.map((x, i) => (i === idx ? { ...x, priceFactor: (Number(e.target.value) || 0) / 100 } : x)))} /></Field>
            </div>
            <div className="mt-2 text-xs text-muted">
              {sc.unitsSold} vendidas · facturación {formatEUR(sc.revenueCents)} · caja final {formatEUR(sc.cashAfterCents)}
              {sc.unsoldUnits > 0 && ` · quedan ${sc.unsoldUnits} ud en stock (${formatEUR(sc.unsoldStockCostCents)} a coste)`}
            </div>
          </Card>
        ))}
      </div>

      <MixComparison products={products} budgetCents={r.budgetCents} fixedCostsCents={input.supplierShippingCents + input.otherCostsCents} feeBps={input.platformFeeBps} sellerShippingCents={input.sellerShippingCents} defaults={{ unitCostCents: input.unitCostCents, priceCents: input.salePriceCents }} />

      <SaveDefaults values={{ ...v, capital: v.capital }} settings={settings} />
    </>
  );
}

type MixLineState = { key: number; productId: string; units: string };

function MixComparison({ products, budgetCents, fixedCostsCents, feeBps, sellerShippingCents, defaults }: { products: ProductOption[]; budgetCents: number; fixedCostsCents: number; feeBps: number; sellerShippingCents: number; defaults: { unitCostCents: number; priceCents: number } }) {
  const options = useMemo(() => [{ id: 'generic', label: 'Producto genérico (valores de arriba)', unitCostCents: defaults.unitCostCents, priceCents: defaults.priceCents }, ...products], [products, defaults]);
  const [mixes, setMixes] = useState<MixLineState[][]>([[{ key: 0, productId: 'generic', units: '4' }], []]);
  const byId = new Map(options.map((o) => [o.id, o]));

  return (
    <>
      <SectionTitle>Comparar combinaciones</SectionTitle>
      <div className="grid gap-2">
        {mixes.map((mix, mi) => {
          const lines = mix.map((l) => {
            const o = byId.get(l.productId) ?? options[0];
            return { label: o.label, unitCostCents: o.unitCostCents, salePriceCents: o.priceCents, units: Number.parseInt(l.units, 10) || 0 };
          });
          const res = evaluateMix(lines, budgetCents, fixedCostsCents, feeBps, sellerShippingCents);
          const update = (fn: (m: MixLineState[]) => MixLineState[]) => setMixes((ms) => ms.map((m, i) => (i === mi ? fn(m) : m)));
          return (
            <Card key={mi} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Opción {String.fromCharCode(65 + mi)}</p>
                {mix.length > 0 && <span className={cx('text-xs font-medium', res.fits ? 'text-sage' : 'text-danger')}>{res.fits ? 'Dentro del presupuesto' : `Excede ${formatEUR(res.overBudgetCents)}`}</span>}
              </div>
              {mix.map((l) => (
                <div key={l.key} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={l.productId} onChange={(e) => update((m) => m.map((x) => (x.key === l.key ? { ...x, productId: e.target.value } : x)))} aria-label="Producto">
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  </div>
                  <Input className="!w-20" type="number" inputMode="numeric" min={0} value={l.units} aria-label="Unidades" onChange={(e) => update((m) => m.map((x) => (x.key === l.key ? { ...x, units: e.target.value } : x)))} />
                  <button type="button" aria-label="Quitar" onClick={() => update((m) => m.filter((x) => x.key !== l.key))} className="grid size-12 shrink-0 place-items-center rounded-2xl text-muted hover:text-danger"><Trash2 className="size-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => update((m) => [...m, { key: Date.now(), productId: 'generic', units: '1' }])} className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted hover:text-ink">
                <Plus className="size-4" />Añadir línea
              </button>
              {mix.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-sm font-semibold">{formatEUR(res.totalCents)}</p><p className="text-faint">Coste</p></div>
                  <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-sm font-semibold">{formatEUR(res.netProfitCents)}</p><p className="text-faint">Beneficio</p></div>
                  <div className="rounded-xl bg-graphite-deep/50 p-2"><p className="num text-sm font-semibold">{formatPct(res.marginRatio)}</p><p className="text-faint">Margen</p></div>
                </div>
              )}
            </Card>
          );
        })}
        {mixes.length < 3 && <button type="button" onClick={() => setMixes((m) => [...m, []])} className="min-h-11 rounded-2xl border border-dashed border-line text-sm text-muted hover:text-ink">Añadir otra opción</button>}
      </div>
    </>
  );
}

function SaveDefaults({ values, settings }: { values: Record<string, string>; settings: PlannerSettings }) {
  const [state, action] = useActionState(savePlannerSettings, null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-2">
      <input type="hidden" name="reference_capital_cents" value={values.capital} />
      <input type="hidden" name="unit_cost_cents" value={values.unitCost} />
      <input type="hidden" name="supplier_shipping_cents" value={values.shipping} />
      <input type="hidden" name="other_order_costs_cents" value={values.other} />
      <input type="hidden" name="avg_sale_price_cents" value={values.price} />
      <input type="hidden" name="seller_shipping_cents" value={values.sellerShipping} />
      <input type="hidden" name="platform_fee_bps" value={values.fee.replace(',', '.')} />
      <input type="hidden" name="reinvest_bps" value={values.reinvest.replace(',', '.')} />
      <input type="hidden" name="reserve_bps" value={values.reserve.replace(',', '.')} />
      <input type="hidden" name="coverage_days" value={settings.coverage_days} />
      <input type="hidden" name="default_lead_time_days" value={settings.default_lead_time_days} />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="md">Guardar como valores de referencia</SubmitButton>
      <p className="text-center text-xs text-faint">Las simulaciones no crean pedidos ni movimientos.</p>
    </form>
  );
}
