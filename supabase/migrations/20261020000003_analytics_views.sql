-- ML Supply · Vistas analíticas
-- security_invoker = true: las vistas aplican las políticas RLS de quien consulta.

create view public.sale_overview with (security_invoker = true) as
select
  s.*,
  p.name as product_name,
  p.brand as product_brand,
  p.model as product_model,
  p.variant as product_variant,
  p.sku as product_sku,
  (s.quantity * s.unit_price_cents - s.discount_cents) as revenue_cents,
  coalesce(a.cogs, 0)::bigint as cogs_cents,
  coalesce(r.qty, 0)::int as returned_quantity,
  coalesce(r.refund, 0)::bigint as refunded_cents,
  coalesce(r.restocked_cost, 0)::bigint as restocked_cost_cents,
  case when s.status = 'confirmed' then
    (s.quantity * s.unit_price_cents - s.discount_cents) - coalesce(r.refund, 0)
    - s.platform_fee_cents - s.shipping_cost_cents - s.other_costs_cents
    - (coalesce(a.cogs, 0) - coalesce(r.restocked_cost, 0))
  else 0 end::bigint as profit_cents
from public.sales s
join public.products p on p.id = s.product_id
left join lateral (
  select sum(cost_cents) as cogs from public.sale_lot_allocations where sale_id = s.id
) a on true
left join lateral (
  select sum(quantity) as qty, sum(refund_cents) as refund,
         sum(cost_cents) filter (where restocked) as restocked_cost
    from public.sale_returns where sale_id = s.id
) r on true;

create view public.purchase_order_overview with (security_invoker = true) as
select
  o.*,
  sup.name as supplier_name,
  coalesce(l.units, 0)::int as total_units,
  coalesce(l.lines, 0)::int as line_count,
  coalesce(l.goods, 0)::bigint as goods_cents,
  (coalesce(l.goods, 0) - o.discount_cents + o.shipping_cents + o.packaging_cents + o.other_costs_cents)::bigint as total_cents
from public.purchase_orders o
left join public.suppliers sup on sup.id = o.supplier_id
left join lateral (
  select sum(quantity) as units, count(*) as lines, sum(quantity * unit_price_cents - discount_cents) as goods
    from public.purchase_order_lines where purchase_order_id = o.id
) l on true;

create view public.product_metrics with (security_invoker = true) as
with today as (select private.today() as d)
select
  p.id,
  p.owner_id,
  p.name,
  p.brand,
  p.model,
  p.variant,
  p.category,
  p.sku,
  p.supplier_id,
  sup.name as supplier_name,
  p.expected_price_cents,
  p.reference_unit_cost_cents,
  coalesce(p.lead_time_days, sup.default_lead_time_days) as lead_time_days,
  p.authenticity_status,
  p.documentation_notes,
  p.notes,
  p.photo_path,
  p.archived,
  p.created_at,
  coalesce(l.stock_qty, 0)::int as stock_qty,
  coalesce(l.stock_cost, 0)::bigint as stock_cost_cents,
  coalesce(l.purchased_qty, 0)::int as purchased_qty,
  coalesce(l.purchased_cost, 0)::bigint as purchased_cost_cents,
  coalesce(l.base_cost, 0)::bigint as purchased_base_cents,
  coalesce(l.ship_cost, 0)::bigint as purchased_shipping_cents,
  coalesce(l.extra_cost, 0)::bigint as purchased_extra_cents,
  l.first_received_on,
  l.last_received_on,
  coalesce(inc.qty, 0)::int as incoming_qty,
  coalesce(sv.units_sold, 0)::int as units_sold,
  coalesce(sv.revenue, 0)::bigint as revenue_cents,
  coalesce(sv.profit, 0)::bigint as profit_cents,
  coalesce(sv.sold_7, 0)::int as sold_7d,
  coalesce(sv.sold_30, 0)::int as sold_30d,
  coalesce(sv.sold_90, 0)::int as sold_90d,
  coalesce(sv.sold_prev_30, 0)::int as sold_prev_30d,
  sv.last_sale_date,
  coalesce(sv.confirmed_sales, 0)::int as sales_count,
  d.avg_days_to_sell,
  coalesce(wo.qty, 0)::int as units_written_off,
  coalesce(wo.cost, 0)::bigint as written_off_cost_cents,
  (select d from today) - l.first_received_on as days_since_first_stock
from public.products p
left join public.suppliers sup on sup.id = p.supplier_id
left join lateral (
  select sum(quantity_remaining) as stock_qty, sum(cost_remaining_cents) as stock_cost,
         sum(quantity_initial) as purchased_qty, sum(cost_total_cents) as purchased_cost,
         sum(base_cost_cents) as base_cost, sum(shipping_cost_cents) as ship_cost,
         sum(extra_cost_cents) as extra_cost,
         min(received_on) as first_received_on, max(received_on) as last_received_on
    from public.stock_lots where product_id = p.id
) l on true
left join lateral (
  select sum(pl.quantity) as qty
    from public.purchase_order_lines pl
    join public.purchase_orders po on po.id = pl.purchase_order_id
   where pl.product_id = p.id and po.received_at is null and po.status <> 'cancelled'
) inc on true
left join lateral (
  select
    count(*) as confirmed_sales,
    sum(so.quantity - so.returned_quantity) as units_sold,
    sum(so.revenue_cents - so.refunded_cents) as revenue,
    sum(so.profit_cents) as profit,
    sum(so.quantity - so.returned_quantity) filter (where so.sale_date > (select d from today) - 7) as sold_7,
    sum(so.quantity - so.returned_quantity) filter (where so.sale_date > (select d from today) - 30) as sold_30,
    sum(so.quantity - so.returned_quantity) filter (where so.sale_date > (select d from today) - 90) as sold_90,
    sum(so.quantity - so.returned_quantity) filter (
      where so.sale_date <= (select d from today) - 30 and so.sale_date > (select d from today) - 60) as sold_prev_30,
    max(so.sale_date) as last_sale_date
  from public.sale_overview so
  where so.product_id = p.id and so.status = 'confirmed'
) sv on true
left join lateral (
  select round(sum((s.sale_date - sl.received_on) * (a.quantity - a.returned_quantity))::numeric
               / nullif(sum(a.quantity - a.returned_quantity), 0), 1) as avg_days_to_sell
    from public.sale_lot_allocations a
    join public.sales s on s.id = a.sale_id and s.status = 'confirmed'
    join public.stock_lots sl on sl.id = a.lot_id
   where s.product_id = p.id
) d on true
left join lateral (
  select sum(quantity) as qty, sum(cost_cents) as cost from public.stock_write_offs where product_id = p.id
) wo on true;

-- Resumen financiero del dashboard.
-- Importante: la caja (dinero disponible) sale exclusivamente del libro de movimientos.
-- El inventario se muestra aparte a coste y a precio de venta potencial; nunca se suma a la caja.
create function public.dashboard_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with
  led as (
    select
      coalesce(sum(amount_cents), 0) as cash,
      coalesce(sum(amount_cents) filter (where category = 'initial_capital'), 0) as initial_capital,
      coalesce(sum(amount_cents) filter (where category in ('initial_capital', 'capital_contribution')), 0) as capital_in,
      coalesce(-sum(amount_cents) filter (where category = 'withdrawal'), 0) as withdrawals,
      coalesce(-sum(amount_cents) filter (where category in ('supplier_payment', 'purchase_shipping', 'supplier_refund')), 0) as purchases_paid,
      coalesce(-sum(amount_cents) filter (where category = 'expense'), 0) as general_expenses,
      coalesce(-sum(amount_cents) filter (where category = 'adjustment'), 0) as adjustments_out
    from public.ledger_entries
  ),
  inv as (
    select
      coalesce(sum(pm.stock_cost_cents), 0) as inventory_cost,
      coalesce(sum(pm.stock_qty * coalesce(pm.expected_price_cents,
        case when pm.units_sold > 0 then pm.revenue_cents / pm.units_sold end, 0)), 0) as inventory_potential,
      coalesce(sum(pm.stock_qty), 0) as units_in_stock,
      count(*) filter (where pm.stock_qty > 0) as products_in_stock,
      coalesce(sum(pm.incoming_qty), 0) as incoming_units,
      coalesce(sum(pm.written_off_cost_cents), 0) as write_off_losses
    from public.product_metrics pm
  ),
  sal as (
    select
      coalesce(sum(revenue_cents - refunded_cents), 0) as revenue,
      coalesce(sum(cogs_cents - restocked_cost_cents), 0) as cogs,
      coalesce(sum(platform_fee_cents + shipping_cost_cents + other_costs_cents), 0) as selling_costs,
      coalesce(sum(quantity - returned_quantity), 0) as units_sold,
      count(*) as sales_count,
      coalesce(sum(revenue_cents - refunded_cents) filter (where payment_status = 'pending'), 0) as pending_collections,
      count(*) filter (where delivery_status in ('pending', 'shipped')) as pending_deliveries
    from public.sale_overview where status = 'confirmed'
  ),
  po as (
    select
      count(*) filter (where status in ('draft', 'pending_payment', 'paid', 'shipped')) as pending_orders,
      coalesce(sum(public.purchase_order_total(id)) filter (where status in ('draft', 'pending_payment')), 0) as pending_payments
    from public.purchase_orders
  )
  select jsonb_build_object(
    'cash_cents', led.cash,
    'initial_capital_cents', led.initial_capital,
    'capital_contributed_cents', led.capital_in,
    'withdrawals_cents', led.withdrawals,
    'purchases_paid_cents', led.purchases_paid,
    'reinvested_cents', greatest(0, least(led.purchases_paid - led.capital_in, sal.revenue)),
    'inventory_cost_cents', inv.inventory_cost,
    'inventory_potential_cents', inv.inventory_potential,
    'revenue_cents', sal.revenue,
    'cogs_cents', sal.cogs,
    'gross_profit_cents', sal.revenue - sal.cogs,
    'selling_costs_cents', sal.selling_costs,
    'general_expenses_cents', led.general_expenses,
    'write_off_losses_cents', inv.write_off_losses,
    'expenses_total_cents', sal.selling_costs + led.general_expenses,
    'net_profit_cents', sal.revenue - sal.cogs - sal.selling_costs - led.general_expenses - inv.write_off_losses,
    'units_in_stock', inv.units_in_stock,
    'products_in_stock', inv.products_in_stock,
    'incoming_units', inv.incoming_units,
    'units_sold', sal.units_sold,
    'sales_count', sal.sales_count,
    'pending_collections_cents', sal.pending_collections,
    'pending_deliveries', sal.pending_deliveries,
    'pending_orders', po.pending_orders,
    'pending_payments_cents', po.pending_payments
  )
  from led, inv, sal, po;
$$;

revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;
revoke all on public.sale_overview, public.purchase_order_overview, public.product_metrics from anon;
grant select on public.sale_overview, public.purchase_order_overview, public.product_metrics to authenticated;
