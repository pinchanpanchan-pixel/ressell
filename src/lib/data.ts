import 'server-only';
import { notFound } from 'next/navigation';
import { requireOwner } from './auth';
import { buildCapitalSeries } from './capital-series';
import {
  DEFAULT_PLANNER_SETTINGS,
  type DashboardSummary,
  type InventoryMovement,
  type LedgerEntry,
  type PlannerSettings,
  type ProductMetrics,
  type PurchaseOrderLine,
  type PurchaseOrderOverview,
  type SaleOverview,
  type Supplier,
} from './types';

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`No se pudo cargar ${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getSummary(): Promise<DashboardSummary> {
  const { supabase } = await requireOwner();
  return must(await supabase.rpc('dashboard_summary'), 'el resumen') as DashboardSummary;
}

export async function getProducts(opts: { archived?: boolean } = {}): Promise<ProductMetrics[]> {
  const { supabase } = await requireOwner();
  const res = await supabase.from('product_metrics').select('*').eq('archived', opts.archived ?? false).order('name');
  return must(res, 'los productos') as ProductMetrics[];
}

export async function getProduct(id: string): Promise<ProductMetrics> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from('product_metrics').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  return data as ProductMetrics;
}

/** Versión actual del producto (updated_at), para detectar ediciones simultáneas. */
export async function getProductVersion(id: string): Promise<string> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from('products').select('updated_at').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  return data.updated_at as string;
}

export async function getProductMovements(productId: string): Promise<InventoryMovement[]> {
  const { supabase } = await requireOwner();
  const res = await supabase.from('inventory_movements').select('*').eq('product_id', productId)
    .order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  return must(res, 'los movimientos') as InventoryMovement[];
}

export async function getSuppliers(): Promise<Supplier[]> {
  const { supabase } = await requireOwner();
  return must(await supabase.from('suppliers').select('*').order('name'), 'los proveedores') as Supplier[];
}

export async function getOrders(status?: string): Promise<PurchaseOrderOverview[]> {
  const { supabase } = await requireOwner();
  let q = supabase.from('purchase_order_overview').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  if (status === 'open') q = q.in('status', ['draft', 'pending_payment', 'paid', 'shipped']);
  else if (status) q = q.eq('status', status);
  return must(await q, 'los pedidos') as PurchaseOrderOverview[];
}

export async function getOrder(id: string) {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from('purchase_order_overview').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const [lines, lots, ledger] = await Promise.all([
    supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('created_at'),
    supabase.from('stock_lots').select('*').eq('purchase_order_id', id),
    supabase.from('ledger_entries').select('*').eq('purchase_order_id', id).order('created_at'),
  ]);
  return {
    order: data as PurchaseOrderOverview,
    lines: must(lines, 'las líneas') as PurchaseOrderLine[],
    lots: must(lots, 'los lotes') as { purchase_order_line_id: string; cost_total_cents: number; quantity_initial: number; base_cost_cents: number; shipping_cost_cents: number; extra_cost_cents: number }[],
    ledger: must(ledger, 'los pagos') as LedgerEntry[],
  };
}

export async function getSales(opts: { productId?: string; filter?: string; limit?: number } = {}): Promise<SaleOverview[]> {
  const { supabase } = await requireOwner();
  let q = supabase.from('sale_overview').select('*').order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.productId) q = q.eq('product_id', opts.productId);
  if (opts.filter === 'unpaid') q = q.eq('status', 'confirmed').eq('payment_status', 'pending');
  if (opts.filter === 'to_ship') q = q.eq('status', 'confirmed').in('delivery_status', ['pending', 'shipped']);
  if (opts.filter === 'returns') q = q.gt('returned_quantity', 0);
  if (opts.filter === 'cancelled') q = q.eq('status', 'cancelled');
  return must(await q, 'las ventas') as SaleOverview[];
}

export async function getSale(id: string) {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from('sale_overview').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const [returns, ledger] = await Promise.all([
    supabase.from('sale_returns').select('*').eq('sale_id', id).order('created_at'),
    supabase.from('ledger_entries').select('*').eq('sale_id', id).order('created_at'),
  ]);
  return {
    sale: data as SaleOverview,
    returns: must(returns, 'las devoluciones') as { id: string; return_date: string; quantity: number; refund_cents: number; restocked: boolean; cost_cents: number; reason: string | null }[],
    ledger: must(ledger, 'los movimientos') as LedgerEntry[],
  };
}

export async function getLedger(category?: string): Promise<LedgerEntry[]> {
  const { supabase } = await requireOwner();
  let q = supabase.from('ledger_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  if (category) q = q.eq('category', category);
  return must(await q, 'el libro de movimientos') as LedgerEntry[];
}

export async function getPlannerSettings(): Promise<PlannerSettings> {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from('planner_settings').select('*').maybeSingle();
  return { ...DEFAULT_PLANNER_SETTINGS, ...(data ?? {}) } as PlannerSettings;
}

export async function getCapitalSeries() {
  const { supabase } = await requireOwner();
  const [ledger, movements] = await Promise.all([
    supabase.from('ledger_entries').select('entry_date, amount_cents').order('entry_date').limit(10000),
    supabase.from('inventory_movements').select('movement_date, cost_cents').order('movement_date').limit(20000),
  ]);
  return buildCapitalSeries(must(ledger, 'la caja'), must(movements, 'el inventario'));
}

export interface AttachmentView {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  storage_path: string;
  url: string | null;
}

export async function getAttachments(entityType: 'product' | 'purchase_order' | 'sale', entityId: string): Promise<AttachmentView[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from('attachments').select('*').eq('entity_type', entityType).eq('entity_id', entityId).order('created_at');
  if (error || !data?.length) return [];
  const signed = await supabase.storage.from('attachments').createSignedUrls(data.map((a) => a.storage_path), 3600);
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((a) => ({ ...a, url: urls.get(a.storage_path) ?? null }));
}
