/**
 * Pruebas de integración de la base de datos contra una pila real (GoTrue + PostgREST + Postgres).
 * Arranque: `bash scripts/test-stack/up.sh` y después `npm run test:db`.
 * Usa usuarios y datos de prueba que solo existen en la base de datos local.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = 'http://127.0.0.1:54321';
const keys = Object.fromEntries(
  readFileSync(process.env.STACK_KEYS ?? '/tmp/mlsupply-stack/keys.env', 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.split('=') as [string, string]),
);
const ANON = keys.ANON_KEY;
const SERVICE = keys.SERVICE_ROLE_KEY;
const OWNER = { email: 'owner@mlsupply.test', password: 'Owner-Password-123' };
const STRANGER = { email: 'stranger@mlsupply.test', password: 'Stranger-Password-123' };

function sql(query: string): string {
  return execFileSync('su', ['postgres', '-c', `psql -tA -v ON_ERROR_STOP=1 -c "${query.replace(/"/g, '\\"')}"`], {
    encoding: 'utf8',
  }).trim();
}

async function signedIn(user: typeof OWNER): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword(user);
  if (error) throw error;
  return client;
}

let db: SupabaseClient;
let stranger: SupabaseClient;
const ids: Record<string, string> = {};

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
async function rpcError(fn: string, args: Record<string, unknown>): Promise<string> {
  const { error } = await db.rpc(fn, args);
  expect(error, `${fn} debería fallar`).not.toBeNull();
  return error!.message;
}
async function summary() {
  return rpc<Record<string, number>>('dashboard_summary', {});
}
async function stockOf(productId: string) {
  const { data, error } = await db.from('product_metrics').select('*').eq('id', productId).single();
  if (error) throw error;
  return data;
}
function sale(productId: string, overrides: Record<string, unknown> = {}) {
  return {
    p_client_request_id: randomUUID(),
    p_sale_date: '2026-10-10',
    p_product_id: productId,
    p_quantity: 1,
    p_unit_price_cents: 7000,
    p_discount_cents: 0,
    p_platform_fee_cents: 0,
    p_shipping_cost_cents: 0,
    p_other_costs_cents: 0,
    p_payment_status: 'paid',
    p_delivery_status: 'pending',
    p_channel: 'Vinted',
    p_customer: null,
    p_notes: null,
    ...overrides,
  };
}
function order(lines: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    p_id: null,
    p_client_request_id: randomUUID(),
    p_reference: null,
    p_supplier_id: ids.supplier,
    p_order_date: '2026-10-01',
    p_status: 'pending_payment',
    p_discount_cents: 0,
    p_shipping_cents: 0,
    p_packaging_cents: 0,
    p_other_costs_cents: 0,
    p_tracking_number: null,
    p_carrier: null,
    p_notes: null,
    p_lines: lines,
    ...overrides,
  };
}

beforeAll(async () => {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  for (const u of [OWNER, STRANGER]) {
    const { error } = await admin.auth.admin.createUser({ ...u, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw error;
  }
  sql(`select private.authorize_owner('${OWNER.email}')`);
  db = await signedIn(OWNER);
  stranger = await signedIn(STRANGER);
});

describe('seguridad y acceso', () => {
  it('el registro público está desactivado', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error } = await anon.auth.signUp({ email: 'nuevo@mlsupply.test', password: 'Password-123456' });
    expect(error?.message).toMatch(/signups not allowed/i);
  });

  it('un visitante sin sesión no puede leer ni escribir', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const read = await anon.from('ledger_entries').select('*');
    expect(read.error?.message).toMatch(/permission denied/);
    const write = await anon.from('products').insert({ name: 'X' });
    expect(write.error).not.toBeNull();
    const call = await anon.rpc('dashboard_summary');
    expect(call.error?.message).toMatch(/permission denied/);
  });

  it('un usuario autenticado pero no autorizado no ve ni modifica nada', async () => {
    const ins = await stranger.from('products').insert({ name: 'Intruso' });
    expect(ins.error?.message).toMatch(/row-level security/);
    const op = await stranger.rpc('record_ledger_entry', {
      p_client_request_id: randomUUID(), p_entry_date: null, p_category: 'capital_contribution',
      p_amount_cents: 100, p_description: 'x',
    });
    expect(op.error?.message).toMatch(/No autorizado/);
    const self = await stranger.from('authorized_users').insert({ user_id: randomUUID(), email: 'x' });
    expect(self.error).not.toBeNull();
  });
});

describe('recorrido completo de compra, venta y devolución', () => {
  it('registra el capital inicial una sola vez y de forma idempotente', async () => {
    const req = randomUUID();
    const args = { p_client_request_id: req, p_entry_date: '2026-10-01', p_category: 'initial_capital', p_amount_cents: 15000, p_description: 'Capital inicial' };
    const a = await rpc<string>('record_ledger_entry', args);
    const b = await rpc<string>('record_ledger_entry', args); // reintento tras corte de conexión
    expect(b).toBe(a);
    const msg = await rpcError('record_ledger_entry', { ...args, p_client_request_id: randomUUID() });
    expect(msg).toMatch(/ya está registrado/);
    expect((await summary()).cash_cents).toBe(15000);
  });

  it('no permite escribir el libro de caja directamente', async () => {
    const ins = await db.from('ledger_entries').insert({ entry_date: '2026-10-01', category: 'sale_income', amount_cents: 999999, description: 'trampa' });
    expect(ins.error?.message).toMatch(/permission denied/);
    const upd = await db.from('ledger_entries').update({ amount_cents: 1 }).neq('id', randomUUID());
    expect(upd.error?.message).toMatch(/permission denied/);
    const del = await db.from('stock_lots').delete().neq('id', randomUUID());
    expect(del.error?.message).toMatch(/permission denied/);
  });

  it('crea proveedor y variantes separadas', async () => {
    const s = await db.from('suppliers').insert({ name: 'Proveedor Test' }).select().single();
    ids.supplier = s.data!.id;
    const a = await db.from('products').insert({ name: 'Zapatilla X', brand: 'Marca', model: 'X1', variant: 'Talla 42', sku: 'ZX-42', expected_price_cents: 7000, supplier_id: ids.supplier }).select().single();
    const b = await db.from('products').insert({ name: 'Zapatilla X', brand: 'Marca', model: 'X1', variant: 'Talla 43', sku: 'ZX-43', expected_price_cents: 7500 }).select().single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    ids.a = a.data!.id;
    ids.b = b.data!.id;
    const dup = await db.from('products').insert({ name: 'zapatilla x', brand: 'marca', model: 'x1', variant: 'talla 42' });
    expect(dup.error?.message).toMatch(/duplicate key/);
  });

  it('pagar un pedido descuenta caja pero no crea stock', async () => {
    const id = await rpc<string>('save_purchase_order', order(
      [
        { product_id: ids.a, quantity: 4, unit_price_cents: 1500 },
        { product_id: ids.b, quantity: 2, unit_price_cents: 2000 },
      ],
      { p_shipping_cents: 2000, p_packaging_cents: 300, p_discount_cents: 500 },
    ));
    ids.po1 = id;
    expect(await rpc<number>('purchase_order_total', { p_order_id: id })).toBe(11800);
    await rpc('pay_purchase_order', { p_id: id, p_paid_on: '2026-10-02' });
    expect((await summary()).cash_cents).toBe(3200);
    expect((await stockOf(ids.a)).stock_qty).toBe(0);
    expect(await rpcError('pay_purchase_order', { p_id: id, p_paid_on: null })).toMatch(/ya está pagado/);
    const edit = await rpcError('save_purchase_order', { ...order([{ product_id: ids.a, quantity: 40, unit_price_cents: 1 }]), p_id: id });
    expect(edit).toMatch(/no se pueden modificar/);
  });

  it('recibir el pedido crea lotes con coste real repartido al céntimo y no se duplica', async () => {
    await rpc('receive_purchase_order', { p_id: ids.po1, p_received_on: '2026-10-05' });
    const a = await stockOf(ids.a);
    const b = await stockOf(ids.b);
    expect([a.stock_qty, b.stock_qty]).toEqual([4, 2]);
    // A: 6000 + envío 1200 + (300 - 500) * 0,6 = 7080 → 17,70 €/ud
    expect(a.stock_cost_cents).toBe(7080);
    expect(b.stock_cost_cents).toBe(4720);
    expect(a.stock_cost_cents + b.stock_cost_cents).toBe(11800);
    expect(await rpcError('receive_purchase_order', { p_id: ids.po1, p_received_on: null })).toMatch(/ya fue recibido/);
    expect((await stockOf(ids.a)).stock_qty).toBe(4);
  });

  it('venta parcial de un lote: reduce stock, registra caja y beneficio con coste real', async () => {
    ids.sale1 = await rpc<string>('register_sale', sale(ids.a, { p_platform_fee_cents: 500 }));
    expect((await stockOf(ids.a)).stock_qty).toBe(3);
    const s = await db.from('sale_overview').select('*').eq('id', ids.sale1).single();
    expect(s.data!.cogs_cents).toBe(1770);
    expect(s.data!.profit_cents).toBe(7000 - 500 - 1770);
    expect((await summary()).cash_cents).toBe(3200 + 7000 - 500);
  });

  it('stock insuficiente: la operación se rechaza entera y no deja rastro', async () => {
    const before = await summary();
    const req = sale(ids.a, { p_quantity: 5 });
    expect(await rpcError('register_sale', req)).toMatch(/Stock insuficiente: hay 3/);
    const after = await summary();
    expect(after).toEqual(before);
    const { count } = await db.from('sales').select('*', { count: 'exact', head: true }).eq('client_request_id', req.p_client_request_id);
    expect(count).toBe(0);
  });

  it('reintentos y dobles pulsaciones simultáneas no duplican la venta', async () => {
    const req = sale(ids.a, { p_payment_status: 'pending', p_unit_price_cents: 6500 });
    const [x, y, z] = await Promise.all([rpc<string>('register_sale', req), rpc<string>('register_sale', req), rpc<string>('register_sale', req)]);
    expect(new Set([x, y, z]).size).toBe(1);
    ids.sale2 = x;
    expect((await stockOf(ids.a)).stock_qty).toBe(2);
    const cashBefore = (await summary()).cash_cents;
    await rpc('mark_sale_paid', { p_id: ids.sale2, p_paid_on: '2026-10-11' });
    expect((await summary()).cash_cents).toBe(cashBefore + 6500);
    expect(await rpcError('mark_sale_paid', { p_id: ids.sale2, p_paid_on: null })).toMatch(/ya está cobrada/);
  });

  it('venta cancelada: repone stock y crea asientos inversos sin borrar el historial', async () => {
    const cashBefore = (await summary()).cash_cents;
    await rpc('cancel_sale', { p_id: ids.sale2, p_reason: 'El comprador se arrepintió', p_date: '2026-10-12' });
    expect((await stockOf(ids.a)).stock_qty).toBe(3);
    expect((await summary()).cash_cents).toBe(cashBefore - 6500);
    const entries = await db.from('ledger_entries').select('*').eq('sale_id', ids.sale2);
    expect(entries.data!.length).toBe(2);
    expect(entries.data!.reduce((t, e) => t + e.amount_cents, 0)).toBe(0);
    const s = await db.from('sale_overview').select('*').eq('id', ids.sale2).single();
    expect(s.data!.status).toBe('cancelled');
    expect(s.data!.profit_cents).toBe(0);
    expect(await rpcError('cancel_sale', { p_id: ids.sale2, p_reason: null, p_date: null })).toMatch(/ya está cancelada/);
  });

  it('devoluciones: una reponible y otra defectuosa', async () => {
    ids.sale3 = await rpc<string>('register_sale', sale(ids.a, { p_quantity: 2, p_sale_date: '2026-10-13' }));
    expect((await stockOf(ids.a)).stock_qty).toBe(1);
    const cash0 = (await summary()).cash_cents;

    await rpc('register_sale_return', { p_client_request_id: randomUUID(), p_sale_id: ids.sale3, p_return_date: '2026-10-15', p_quantity: 1, p_refund_cents: 7000, p_restock: true, p_reason: 'No le quedaba bien' });
    expect((await stockOf(ids.a)).stock_qty).toBe(2);
    expect((await summary()).cash_cents).toBe(cash0 - 7000);

    await rpc('register_sale_return', { p_client_request_id: randomUUID(), p_sale_id: ids.sale3, p_return_date: '2026-10-16', p_quantity: 1, p_refund_cents: 7000, p_restock: false, p_reason: 'Defectuoso' });
    const a = await stockOf(ids.a);
    expect(a.stock_qty).toBe(2);
    const s = await db.from('sale_overview').select('*').eq('id', ids.sale3).single();
    expect(s.data!.delivery_status).toBe('returned');
    expect(s.data!.returned_quantity).toBe(2);
    // Ingreso 14000 - reembolsos 14000 - coste de la unidad defectuosa perdida (1770) = -1770
    expect(s.data!.profit_cents).toBe(-1770);
    const over = await rpcError('register_sale_return', { p_client_request_id: randomUUID(), p_sale_id: ids.sale3, p_return_date: null, p_quantity: 1, p_refund_cents: 0, p_restock: true, p_reason: null });
    expect(over).toMatch(/Solo quedan 0/);
  });

  it('venta de la última unidad deja el lote exactamente a cero', async () => {
    await rpc('register_sale', sale(ids.b, { p_quantity: 2, p_unit_price_cents: 7500 }));
    const b = await stockOf(ids.b);
    expect(b.stock_qty).toBe(0);
    expect(b.stock_cost_cents).toBe(0);
    expect(b.profit_cents).toBe(15000 - 4720);
    expect(await rpcError('register_sale', sale(ids.b))).toMatch(/Stock insuficiente: hay 0/);
  });

  it('gasto adicional y gasto que supera la caja', async () => {
    const cash = (await summary()).cash_cents;
    await rpc('record_ledger_entry', { p_client_request_id: randomUUID(), p_entry_date: '2026-10-14', p_category: 'expense', p_amount_cents: 1200, p_description: 'Bolsas y etiquetas' });
    const s = await summary();
    expect(s.cash_cents).toBe(cash - 1200);
    expect(s.general_expenses_cents).toBe(1200);
    expect(await rpcError('record_ledger_entry', { p_client_request_id: randomUUID(), p_entry_date: null, p_category: 'expense', p_amount_cents: 10_000_000, p_description: 'Demasiado' })).toMatch(/Saldo insuficiente/);
    expect(await rpcError('record_ledger_entry', { p_client_request_id: randomUUID(), p_entry_date: null, p_category: 'sale_income', p_amount_cents: 100, p_description: 'x' })).toMatch(/automáticamente/);
  });

  it('producto defectuoso en stock: baja con su coste como pérdida', async () => {
    await rpc('write_off_stock', { p_client_request_id: randomUUID(), p_product_id: ids.a, p_quantity: 1, p_reason: 'Llegó roto', p_date: '2026-10-16' });
    const a = await stockOf(ids.a);
    expect(a.stock_qty).toBe(1);
    expect(a.units_written_off).toBe(1);
    expect(a.written_off_cost_cents).toBe(1770);
  });

  it('pedido cancelado: con reembolso del proveedor y sin poder cancelar uno recibido', async () => {
    const cash = (await summary()).cash_cents;
    const id = await rpc<string>('save_purchase_order', order([{ product_id: ids.b, quantity: 1, unit_price_cents: 2000 }], { p_shipping_cents: 500 }));
    await rpc('pay_purchase_order', { p_id: id, p_paid_on: null });
    expect((await summary()).cash_cents).toBe(cash - 2500);
    expect((await summary()).pending_orders).toBe(1);
    await rpc('cancel_purchase_order', { p_id: id, p_refund_received: true, p_refund_date: null });
    expect((await summary()).cash_cents).toBe(cash);
    expect(await rpcError('receive_purchase_order', { p_id: id, p_received_on: null })).toMatch(/cancelado/);
    expect(await rpcError('cancel_purchase_order', { p_id: ids.po1, p_refund_received: false, p_refund_date: null })).toMatch(/ya fue recibido/);
  });

  it('corrección de un movimiento manual con asiento inverso', async () => {
    const id = await rpc<string>('record_ledger_entry', { p_client_request_id: randomUUID(), p_entry_date: null, p_category: 'capital_contribution', p_amount_cents: 5000, p_description: 'Aportación por error' });
    const cash = (await summary()).cash_cents;
    await rpc('reverse_ledger_entry', { p_id: id, p_reason: 'Duplicado' });
    expect((await summary()).cash_cents).toBe(cash - 5000);
    expect(await rpcError('reverse_ledger_entry', { p_id: id, p_reason: null })).toMatch(/ya está anulado/);
  });

  it('invariantes: caja, inventario y beneficio cuadran', async () => {
    const s = await summary();
    // Caja = suma del libro
    expect(Number(sql('select sum(amount_cents) from public.ledger_entries'))).toBe(s.cash_cents);
    // Cada lote cuadra con sus movimientos
    expect(sql(`select count(*) from public.stock_lots l where l.quantity_remaining <> (select sum(quantity) from public.inventory_movements m where m.lot_id = l.id) or l.cost_remaining_cents <> (select sum(cost_cents) from public.inventory_movements m where m.lot_id = l.id)`)).toBe('0');
    expect(Number(sql('select sum(cost_cents) from public.inventory_movements'))).toBe(s.inventory_cost_cents);
    // Conservación del valor: compras recibidas = inventario + coste vendido + pérdidas
    const received = Number(sql('select sum(cost_total_cents) from public.stock_lots'));
    expect(received).toBe(s.inventory_cost_cents + s.cogs_cents + s.write_off_losses_cents);
    // Caja = capital + ventas cobradas - costes de venta - gastos - compras pagadas (ningún cobro pendiente aquí)
    expect(s.pending_collections_cents).toBe(0);
    expect(s.cash_cents).toBe(s.capital_contributed_cents + s.revenue_cents - s.selling_costs_cents - s.general_expenses_cents - s.purchases_paid_cents - s.withdrawals_cents);
    // Valores esperados del recorrido
    expect(s.revenue_cents).toBe(7000 + 15000); // venta1 + venta B (venta3 reembolsada entera)
    expect(s.net_profit_cents).toBe(s.revenue_cents - s.cogs_cents - s.selling_costs_cents - s.general_expenses_cents - s.write_off_losses_cents);
    expect(s.units_in_stock).toBe(1);
  });
});
