-- ML Supply · Mejoras de noviembre
-- Esta migración NO modifica ni borra ningún dato existente: solo sustituye funciones y una vista
-- y añade funciones nuevas. Se puede ejecutar más de una vez.

-- 1) La caja puede quedar en negativo: se elimina el bloqueo por saldo insuficiente.
create or replace function private.assert_cash(p_owner uuid, p_needed bigint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Sin bloqueo: se permite que el dinero disponible sea negativo.
  return;
end;
$$;
revoke all on function private.assert_cash(uuid, bigint) from public, anon, authenticated;

-- 2) «Comisión de plataforma» pasa a llamarse «Destacado» en los movimientos nuevos.
create or replace function private.book_sale_payment(p_owner uuid, p_sale public.sales, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_label text;
  v_revenue bigint := p_sale.quantity * p_sale.unit_price_cents - p_sale.discount_cents;
begin
  select p.name || coalesce(' ' || p.variant, '') || ' ×' || p_sale.quantity
    into v_label from public.products p where p.id = p_sale.product_id;
  if v_revenue > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id)
    values (p_owner, p_date, 'sale_income', v_revenue, 'Venta · ' || v_label, p_sale.id);
  end if;
  if p_sale.platform_fee_cents > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id)
    values (p_owner, p_date, 'platform_fee', -p_sale.platform_fee_cents, 'Destacado · ' || v_label, p_sale.id);
  end if;
  if p_sale.shipping_cost_cents > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id)
    values (p_owner, p_date, 'sale_shipping', -p_sale.shipping_cost_cents, 'Envío asumido · ' || v_label, p_sale.id);
  end if;
  if p_sale.other_costs_cents > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id)
    values (p_owner, p_date, 'sale_other_cost', -p_sale.other_costs_cents, 'Otros gastos · ' || v_label, p_sale.id);
  end if;
end;
$$;
revoke all on function private.book_sale_payment(uuid, public.sales, date) from public, anon, authenticated;

-- 3) Solo cuentan como mercancía «en camino» los pedidos ya PAGADOS y aún no recibidos.
create or replace view public.product_metrics with (security_invoker = true) as
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
   where pl.product_id = p.id and po.received_at is null
     and po.paid_at is not null and po.status <> 'cancelled'
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

-- 4) Eliminar una venta por completo, como si nunca hubiera existido:
--    devuelve sus unidades a los lotes de origen y quita sus movimientos de caja.
--    Devuelve las rutas de los archivos adjuntos para borrarlos del almacenamiento.
create or replace function public.delete_sale(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_sale public.sales;
  v_lot record;
  v_paths text[];
begin
  perform private.lock_owner(uid);
  select * into v_sale from public.sales where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;

  -- Deshace el efecto neto de la venta en cada lote (salida, cancelación, devoluciones y bajas).
  for v_lot in
    select lot_id, sum(quantity) as q, sum(cost_cents) as c
      from public.inventory_movements
     where sale_id = p_id and owner_id = uid and lot_id is not null
     group by lot_id
  loop
    update public.stock_lots set
      quantity_remaining = quantity_remaining - v_lot.q,
      cost_remaining_cents = cost_remaining_cents - v_lot.c
    where id = v_lot.lot_id and owner_id = uid;
  end loop;

  delete from public.inventory_movements where sale_id = p_id and owner_id = uid;
  delete from public.ledger_entries where sale_id = p_id and owner_id = uid and reverses_entry_id is not null;
  delete from public.ledger_entries where sale_id = p_id and owner_id = uid;
  delete from public.sale_returns where sale_id = p_id and owner_id = uid;
  delete from public.sale_lot_allocations where sale_id = p_id and owner_id = uid;
  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.attachments where entity_type = 'sale' and entity_id = p_id and owner_id = uid;
  delete from public.attachments where entity_type = 'sale' and entity_id = p_id and owner_id = uid;
  delete from public.sales where id = p_id and owner_id = uid;
  return v_paths;
end;
$$;

-- 5) Eliminar un pedido por completo: quita su pago de la caja y su stock.
--    No se permite si alguna de sus unidades ya se vendió o se dio de baja.
create or replace function public.delete_purchase_order(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_order public.purchase_orders;
  v_used text;
  v_paths text[];
begin
  perform private.lock_owner(uid);
  select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;

  select string_agg(distinct p.name || coalesce(' ' || p.variant, ''), ', ') into v_used
    from public.stock_lots l
    join public.products p on p.id = l.product_id
   where l.purchase_order_id = p_id and l.owner_id = uid
     and (l.quantity_remaining <> l.quantity_initial
          or exists (select 1 from public.inventory_movements m
                      where m.lot_id = l.id and m.movement_type <> 'purchase_in'));
  if v_used is not null then
    raise exception 'No se puede eliminar: hay unidades de este pedido vendidas o dadas de baja (%). Elimina antes esas ventas o bajas.', v_used
      using errcode = 'P0001';
  end if;

  delete from public.inventory_movements where purchase_order_id = p_id and owner_id = uid;
  delete from public.stock_lots where purchase_order_id = p_id and owner_id = uid;
  delete from public.ledger_entries where purchase_order_id = p_id and owner_id = uid and reverses_entry_id is not null;
  delete from public.ledger_entries where purchase_order_id = p_id and owner_id = uid;
  delete from public.purchase_order_lines where purchase_order_id = p_id and owner_id = uid;
  select coalesce(array_agg(storage_path), '{}') into v_paths
    from public.attachments where entity_type = 'purchase_order' and entity_id = p_id and owner_id = uid;
  delete from public.attachments where entity_type = 'purchase_order' and entity_id = p_id and owner_id = uid;
  delete from public.purchase_orders where id = p_id and owner_id = uid;
  return v_paths;
end;
$$;

revoke all on function public.delete_sale(uuid) from public, anon;
grant execute on function public.delete_sale(uuid) to authenticated;
revoke all on function public.delete_purchase_order(uuid) from public, anon;
grant execute on function public.delete_purchase_order(uuid) to authenticated;
revoke all on public.product_metrics from anon;
grant select on public.product_metrics to authenticated;
