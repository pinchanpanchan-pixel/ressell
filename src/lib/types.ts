// Tipos de las filas que la aplicación lee de Supabase (vistas y tablas).
export type AuthenticityStatus = 'pending' | 'verified' | 'documented' | 'doubtful';
export type PoStatus = 'draft' | 'pending_payment' | 'paid' | 'shipped' | 'received' | 'reviewed' | 'cancelled';
export type SaleStatus = 'confirmed' | 'cancelled';
export type SalePaymentStatus = 'pending' | 'paid';
export type DeliveryStatus = 'pending' | 'shipped' | 'delivered' | 'returned';
export type MovementType = 'purchase_in' | 'sale_out' | 'sale_cancel_in' | 'return_in' | 'write_off';
export type LedgerCategory =
  | 'initial_capital' | 'capital_contribution' | 'sale_income' | 'platform_fee' | 'sale_shipping'
  | 'sale_other_cost' | 'supplier_payment' | 'purchase_shipping' | 'expense' | 'supplier_refund'
  | 'customer_refund' | 'withdrawal' | 'adjustment';

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  default_lead_time_days: number;
  notes: string | null;
}

export interface ProductMetrics {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  variant: string | null;
  category: string | null;
  sku: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  expected_price_cents: number | null;
  reference_unit_cost_cents: number | null;
  lead_time_days: number | null;
  authenticity_status: AuthenticityStatus;
  documentation_notes: string | null;
  notes: string | null;
  photo_path: string | null;
  archived: boolean;
  created_at: string;
  stock_qty: number;
  stock_cost_cents: number;
  purchased_qty: number;
  purchased_cost_cents: number;
  purchased_base_cents: number;
  purchased_shipping_cents: number;
  purchased_extra_cents: number;
  first_received_on: string | null;
  last_received_on: string | null;
  incoming_qty: number;
  units_sold: number;
  revenue_cents: number;
  profit_cents: number;
  sold_7d: number;
  sold_30d: number;
  sold_90d: number;
  sold_prev_30d: number;
  last_sale_date: string | null;
  sales_count: number;
  avg_days_to_sell: number | null;
  units_written_off: number;
  written_off_cost_cents: number;
  days_since_first_stock: number | null;
}

export interface SaleOverview {
  id: string;
  sale_date: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  platform_fee_cents: number;
  shipping_cost_cents: number;
  other_costs_cents: number;
  status: SaleStatus;
  payment_status: SalePaymentStatus;
  delivery_status: DeliveryStatus;
  channel: string | null;
  customer: string | null;
  notes: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  product_name: string;
  product_brand: string | null;
  product_model: string | null;
  product_variant: string | null;
  product_sku: string | null;
  revenue_cents: number;
  cogs_cents: number;
  returned_quantity: number;
  refunded_cents: number;
  restocked_cost_cents: number;
  profit_cents: number;
}

export interface PurchaseOrderOverview {
  id: string;
  reference: string;
  supplier_id: string | null;
  supplier_name: string | null;
  order_date: string;
  status: PoStatus;
  discount_cents: number;
  shipping_cents: number;
  packaging_cents: number;
  other_costs_cents: number;
  tracking_number: string | null;
  carrier: string | null;
  incidents: string | null;
  notes: string | null;
  paid_at: string | null;
  paid_amount_cents: number | null;
  received_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  total_units: number;
  line_count: number;
  goods_cents: number;
  total_cents: number;
}

export interface PurchaseOrderLine {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  category: LedgerCategory;
  amount_cents: number;
  description: string;
  purchase_order_id: string | null;
  sale_id: string | null;
  sale_return_id: string | null;
  reverses_entry_id: string | null;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  lot_id: string | null;
  movement_type: MovementType;
  quantity: number;
  cost_cents: number;
  movement_date: string;
  purchase_order_id: string | null;
  sale_id: string | null;
  note: string | null;
  created_at: string;
}

export interface PlannerSettings {
  reference_capital_cents: number;
  unit_cost_cents: number;
  supplier_shipping_cents: number;
  other_order_costs_cents: number;
  avg_sale_price_cents: number;
  platform_fee_bps: number;
  seller_shipping_cents: number;
  reinvest_bps: number;
  reserve_bps: number;
  coverage_days: number;
  default_lead_time_days: number;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  reference_capital_cents: 15000,
  unit_cost_cents: 1750,
  supplier_shipping_cents: 2000,
  other_order_costs_cents: 0,
  avg_sale_price_cents: 7000,
  platform_fee_bps: 0,
  seller_shipping_cents: 0,
  reinvest_bps: 10000,
  reserve_bps: 1000,
  coverage_days: 30,
  default_lead_time_days: 14,
};

export interface DashboardSummary {
  cash_cents: number;
  initial_capital_cents: number;
  capital_contributed_cents: number;
  withdrawals_cents: number;
  purchases_paid_cents: number;
  reinvested_cents: number;
  inventory_cost_cents: number;
  inventory_potential_cents: number;
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  selling_costs_cents: number;
  general_expenses_cents: number;
  write_off_losses_cents: number;
  expenses_total_cents: number;
  net_profit_cents: number;
  units_in_stock: number;
  products_in_stock: number;
  incoming_units: number;
  units_sold: number;
  sales_count: number;
  pending_collections_cents: number;
  pending_deliveries: number;
  pending_orders: number;
  pending_payments_cents: number;
}

export function productLabel(p: { name: string; brand?: string | null; model?: string | null; variant?: string | null }): string {
  return [p.brand, p.name, p.model].filter(Boolean).join(' ') + (p.variant ? ` · ${p.variant}` : '');
}
