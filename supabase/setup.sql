-- ML Supply · Instalación completa (generado desde supabase/migrations). Ejecutar UNA sola vez.
begin;

-- ===== 20261020000001_core_schema.sql =====
-- ML Supply · Esquema principal
-- Todos los importes se guardan en céntimos (bigint) para evitar errores de coma flotante.
-- El historial financiero y de inventario es inmutable: las correcciones se hacen
-- con movimientos inversos, nunca borrando ni editando registros.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Usuarios autorizados (solo el propietario del negocio)
-- ---------------------------------------------------------------------------
create table public.authorized_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.authorized_users enable row level security;
create policy "authorized_users: leer la propia fila" on public.authorized_users
  for select to authenticated using (user_id = (select auth.uid()));
-- Sin políticas de escritura: solo se modifica desde el SQL editor (rol postgres).

create function private.is_authorized() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.authorized_users where user_id = (select auth.uid()));
$$;
revoke all on function private.is_authorized() from public, anon;
grant execute on function private.is_authorized() to authenticated;

create function private.require_owner() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.authorized_users where user_id = uid) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke all on function private.require_owner() from public, anon, authenticated;

-- Autoriza al propietario por email. Se ejecuta una vez desde el SQL editor:
--   select private.authorize_owner('tu@email.com');
create function private.authorize_owner(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No existe ningún usuario con el email %. Créalo primero en Authentication > Users.', p_email;
  end if;
  insert into public.authorized_users (user_id, email) values (uid, lower(trim(p_email)))
  on conflict (user_id) do nothing;
  return 'Usuario autorizado: ' || p_email;
end;
$$;
revoke all on function private.authorize_owner(text) from public, anon, authenticated;

create function private.today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;
grant execute on function private.today() to authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.authenticity_status as enum ('pending', 'verified', 'documented', 'doubtful');
create type public.po_status as enum ('draft', 'pending_payment', 'paid', 'shipped', 'received', 'reviewed', 'cancelled');
create type public.sale_status as enum ('confirmed', 'cancelled');
create type public.sale_payment_status as enum ('pending', 'paid');
create type public.delivery_status as enum ('pending', 'shipped', 'delivered', 'returned');
create type public.movement_type as enum ('purchase_in', 'sale_out', 'sale_cancel_in', 'return_in', 'write_off');
create type public.ledger_category as enum (
  'initial_capital', 'capital_contribution', 'sale_income', 'platform_fee', 'sale_shipping',
  'sale_other_cost', 'supplier_payment', 'purchase_shipping', 'expense', 'supplier_refund',
  'customer_refund', 'withdrawal', 'adjustment'
);

-- ---------------------------------------------------------------------------
-- Proveedores y productos
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  contact text,
  default_lead_time_days int not null default 14 check (default_lead_time_days between 0 and 365),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index suppliers_owner_name_uq on public.suppliers (owner_id, lower(name));
create trigger suppliers_touch before update on public.suppliers
  for each row execute function private.touch_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  brand text,
  model text,
  variant text,
  category text,
  sku text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  expected_price_cents bigint check (expected_price_cents >= 0),
  reference_unit_cost_cents bigint check (reference_unit_cost_cents >= 0),
  lead_time_days int check (lead_time_days between 0 and 365),
  authenticity_status public.authenticity_status not null default 'pending',
  documentation_notes text,
  notes text,
  photo_path text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_owner_sku_uq on public.products (owner_id, lower(sku)) where sku is not null and sku <> '';
-- Cada variante exacta se registra por separado y no puede duplicarse.
create unique index products_owner_variant_uq on public.products (
  owner_id, lower(name), lower(coalesce(brand, '')), lower(coalesce(model, '')), lower(coalesce(variant, ''))
);
create index products_supplier_idx on public.products (supplier_id);
create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pedidos a proveedores
-- ---------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reference text not null,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  order_date date not null default private.today(),
  status public.po_status not null default 'draft',
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  packaging_cents bigint not null default 0 check (packaging_cents >= 0),
  other_costs_cents bigint not null default 0 check (other_costs_cents >= 0),
  tracking_number text,
  carrier text,
  incidents text,
  notes text,
  paid_at date,
  paid_amount_cents bigint,
  received_at date,
  cancelled_at date,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index purchase_orders_ref_uq on public.purchase_orders (owner_id, reference);
create unique index purchase_orders_req_uq on public.purchase_orders (owner_id, client_request_id) where client_request_id is not null;
create index purchase_orders_status_idx on public.purchase_orders (owner_id, status);
create trigger purchase_orders_touch before update on public.purchase_orders
  for each row execute function private.touch_updated_at();

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  created_at timestamptz not null default now(),
  check (discount_cents <= quantity * unit_price_cents)
);
create index pol_order_idx on public.purchase_order_lines (purchase_order_id);
create index pol_product_idx on public.purchase_order_lines (product_id);

-- ---------------------------------------------------------------------------
-- Inventario: lotes con coste real y movimientos
-- ---------------------------------------------------------------------------
create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  -- Unicidad: una línea de pedido solo puede generar un lote (evita duplicar stock).
  purchase_order_line_id uuid not null unique references public.purchase_order_lines (id) on delete restrict,
  received_on date not null,
  quantity_initial int not null check (quantity_initial > 0),
  quantity_remaining int not null check (quantity_remaining >= 0),
  base_cost_cents bigint not null check (base_cost_cents >= 0),
  shipping_cost_cents bigint not null check (shipping_cost_cents >= 0),
  extra_cost_cents bigint not null,
  cost_total_cents bigint not null check (cost_total_cents >= 0),
  cost_remaining_cents bigint not null check (cost_remaining_cents >= 0),
  created_at timestamptz not null default now(),
  check (quantity_remaining <= quantity_initial),
  check (cost_remaining_cents <= cost_total_cents),
  check (base_cost_cents + shipping_cost_cents + extra_cost_cents = cost_total_cents),
  check (quantity_remaining > 0 or cost_remaining_cents = 0)
);
create index stock_lots_product_idx on public.stock_lots (product_id, received_on, created_at);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sale_date date not null,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  shipping_cost_cents bigint not null default 0 check (shipping_cost_cents >= 0),
  other_costs_cents bigint not null default 0 check (other_costs_cents >= 0),
  status public.sale_status not null default 'confirmed',
  payment_status public.sale_payment_status not null default 'pending',
  delivery_status public.delivery_status not null default 'pending',
  channel text,
  customer text,
  notes text,
  paid_at date,
  cancelled_at date,
  cancel_reason text,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  check (discount_cents <= quantity * unit_price_cents)
);
create unique index sales_req_uq on public.sales (owner_id, client_request_id);
create index sales_product_date_idx on public.sales (product_id, sale_date);
create index sales_owner_date_idx on public.sales (owner_id, sale_date desc);

create table public.sale_lot_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete restrict,
  lot_id uuid not null references public.stock_lots (id) on delete restrict,
  quantity int not null check (quantity > 0),
  cost_cents bigint not null check (cost_cents >= 0),
  returned_quantity int not null default 0 check (returned_quantity >= 0),
  returned_cost_cents bigint not null default 0 check (returned_cost_cents >= 0),
  created_at timestamptz not null default now(),
  check (returned_quantity <= quantity),
  check (returned_cost_cents <= cost_cents)
);
create index sla_sale_idx on public.sale_lot_allocations (sale_id);
create index sla_lot_idx on public.sale_lot_allocations (lot_id);

create table public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete restrict,
  return_date date not null,
  quantity int not null check (quantity > 0),
  refund_cents bigint not null default 0 check (refund_cents >= 0),
  restocked boolean not null,
  -- Coste de las unidades devueltas. Si se reponen, vuelve al inventario; si no, es una pérdida.
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  reason text,
  client_request_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index sale_returns_req_uq on public.sale_returns (owner_id, client_request_id);
create index sale_returns_sale_idx on public.sale_returns (sale_id);

create table public.stock_write_offs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  write_off_date date not null,
  quantity int not null check (quantity > 0),
  cost_cents bigint not null check (cost_cents >= 0),
  reason text not null,
  client_request_id uuid not null,
  created_at timestamptz not null default now()
);
create unique index stock_write_offs_req_uq on public.stock_write_offs (owner_id, client_request_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  lot_id uuid references public.stock_lots (id) on delete restrict,
  movement_type public.movement_type not null,
  quantity int not null check (quantity <> 0),
  cost_cents bigint not null,
  movement_date date not null,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  sale_id uuid references public.sales (id) on delete restrict,
  sale_return_id uuid references public.sale_returns (id) on delete restrict,
  write_off_id uuid references public.stock_write_offs (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);
create index inv_mov_product_idx on public.inventory_movements (product_id, movement_date);
create index inv_mov_owner_date_idx on public.inventory_movements (owner_id, movement_date);

-- ---------------------------------------------------------------------------
-- Libro de movimientos financieros (caja)
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  category public.ledger_category not null,
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null,
  purchase_order_id uuid references public.purchase_orders (id) on delete restrict,
  sale_id uuid references public.sales (id) on delete restrict,
  sale_return_id uuid references public.sale_returns (id) on delete restrict,
  reverses_entry_id uuid unique references public.ledger_entries (id) on delete restrict,
  client_request_id uuid,
  created_at timestamptz not null default now()
);
create unique index ledger_req_uq on public.ledger_entries (owner_id, client_request_id) where client_request_id is not null;
create index ledger_owner_date_idx on public.ledger_entries (owner_id, entry_date);
create index ledger_sale_idx on public.ledger_entries (sale_id);
create index ledger_po_idx on public.ledger_entries (purchase_order_id);

-- ---------------------------------------------------------------------------
-- Configuración del planificador, adjuntos y registro de errores
-- ---------------------------------------------------------------------------
create table public.planner_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  reference_capital_cents bigint not null default 15000 check (reference_capital_cents >= 0),
  unit_cost_cents bigint not null default 1750 check (unit_cost_cents >= 0),
  supplier_shipping_cents bigint not null default 2000 check (supplier_shipping_cents >= 0),
  other_order_costs_cents bigint not null default 0 check (other_order_costs_cents >= 0),
  avg_sale_price_cents bigint not null default 7000 check (avg_sale_price_cents >= 0),
  platform_fee_bps int not null default 0 check (platform_fee_bps between 0 and 10000),
  seller_shipping_cents bigint not null default 0 check (seller_shipping_cents >= 0),
  reinvest_bps int not null default 10000 check (reinvest_bps between 0 and 10000),
  reserve_bps int not null default 1000 check (reserve_bps between 0 and 10000),
  coverage_days int not null default 30 check (coverage_days between 1 and 365),
  default_lead_time_days int not null default 14 check (default_lead_time_days between 0 and 365),
  updated_at timestamptz not null default now()
);
create trigger planner_settings_touch before update on public.planner_settings
  for each row execute function private.touch_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('product', 'purchase_order', 'sale')),
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

create table public.error_logs (
  id bigint generated always as identity primary key,
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade,
  context text not null,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.stock_lots enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lot_allocations enable row level security;
alter table public.sale_returns enable row level security;
alter table public.stock_write_offs enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.planner_settings enable row level security;
alter table public.attachments enable row level security;
alter table public.error_logs enable row level security;

-- Tablas de catálogo editables directamente por el propietario.
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'products', 'planner_settings', 'attachments'] loop
    execute format(
      'create policy "%1$s: propietario" on public.%1$I for all to authenticated
         using (owner_id = (select auth.uid()) and (select private.is_authorized()))
         with check (owner_id = (select auth.uid()) and (select private.is_authorized()))', t);
  end loop;
  -- Tablas transaccionales: solo lectura. Las escrituras pasan por funciones validadas.
  foreach t in array array['purchase_orders', 'purchase_order_lines', 'stock_lots', 'sales',
                           'sale_lot_allocations', 'sale_returns', 'stock_write_offs',
                           'inventory_movements', 'ledger_entries'] loop
    execute format(
      'create policy "%1$s: lectura propietario" on public.%1$I for select to authenticated
         using (owner_id = (select auth.uid()) and (select private.is_authorized()))', t);
  end loop;
end;
$$;

create policy "error_logs: insertar propietario" on public.error_logs for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_authorized()));
create policy "error_logs: leer propietario" on public.error_logs for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_authorized()));

-- Defensa adicional: el rol anónimo no tiene ningún privilegio sobre los datos.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Las tablas transaccionales no se pueden modificar directamente ni siquiera autenticado.
revoke insert, update, delete, truncate on public.purchase_orders, public.purchase_order_lines,
  public.stock_lots, public.sales, public.sale_lot_allocations, public.sale_returns,
  public.stock_write_offs, public.inventory_movements, public.ledger_entries
  from authenticated;
revoke update, delete, truncate on public.error_logs from authenticated;
revoke insert, update, delete, truncate on public.authorized_users from authenticated;

-- ===== 20261020000002_operations.sql =====
-- ML Supply · Operaciones transaccionales
-- Cada función se ejecuta como una única transacción: o se aplica todo o nada.
-- Se serializan por propietario con un bloqueo de asesoramiento para evitar carreras
-- (doble pulsación, dos pestañas abiertas...). Los reintentos con el mismo
-- client_request_id devuelven el registro existente en lugar de duplicarlo.

create function private.lock_owner(p_owner uuid) returns void
language sql as $$ select pg_advisory_xact_lock(hashtext('mlsupply:' || p_owner::text)) $$;

create function private.cash_balance(p_owner uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.ledger_entries where owner_id = p_owner;
$$;
revoke all on function private.cash_balance(uuid) from public, anon, authenticated;

create function private.assert_cash(p_owner uuid, p_needed bigint) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  bal bigint := private.cash_balance(p_owner);
begin
  if p_needed > bal then
    raise exception 'Saldo insuficiente: disponible % €, necesario % €. Registra antes el capital aportado.',
      to_char(bal / 100.0, 'FM999999990.00'), to_char(p_needed / 100.0, 'FM999999990.00')
      using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.assert_cash(uuid, bigint) from public, anon, authenticated;

create function private.fmt_eur(p_cents bigint) returns text
language sql immutable as $$ select to_char(p_cents / 100.0, 'FM999999990.00') || ' €' $$;

-- Total de un pedido: líneas - descuentos + envío + empaquetado + otros
create function public.purchase_order_total(p_order_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce((select sum(l.quantity * l.unit_price_cents - l.discount_cents)
                     from public.purchase_order_lines l where l.purchase_order_id = o.id), 0)
         - o.discount_cents + o.shipping_cents + o.packaging_cents + o.other_costs_cents
    from public.purchase_orders o where o.id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create function public.save_purchase_order(
  p_id uuid,
  p_client_request_id uuid,
  p_reference text,
  p_supplier_id uuid,
  p_order_date date,
  p_status public.po_status,
  p_discount_cents bigint,
  p_shipping_cents bigint,
  p_packaging_cents bigint,
  p_other_costs_cents bigint,
  p_tracking_number text,
  p_carrier text,
  p_notes text,
  p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_id uuid;
  v_order public.purchase_orders;
  v_ref text := nullif(trim(p_reference), '');
  v_line jsonb;
  v_lines_net bigint := 0;
  v_count int;
begin
  perform private.lock_owner(uid);

  if p_status not in ('draft', 'pending_payment') then
    raise exception 'Un pedido solo puede guardarse como borrador o pendiente de pago' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'El pedido necesita al menos una línea de producto' using errcode = 'P0001';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = p_supplier_id and owner_id = uid) then
    raise exception 'Proveedor no válido' using errcode = 'P0001';
  end if;

  if p_id is null then
    -- Idempotencia: el mismo formulario reenviado devuelve el pedido ya creado.
    select id into v_id from public.purchase_orders
      where owner_id = uid and client_request_id = p_client_request_id;
    if v_id is not null then
      return v_id;
    end if;
    if v_ref is null then
      select count(*) + 1 into v_count from public.purchase_orders where owner_id = uid;
      loop
        v_ref := 'PED-' || to_char(coalesce(p_order_date, private.today()), 'YYYY') || '-' || lpad(v_count::text, 3, '0');
        exit when not exists (select 1 from public.purchase_orders where owner_id = uid and reference = v_ref);
        v_count := v_count + 1;
      end loop;
    end if;
    insert into public.purchase_orders (
      owner_id, reference, supplier_id, order_date, status, discount_cents, shipping_cents,
      packaging_cents, other_costs_cents, tracking_number, carrier, notes, client_request_id)
    values (
      uid, v_ref, p_supplier_id, coalesce(p_order_date, private.today()), p_status,
      coalesce(p_discount_cents, 0), coalesce(p_shipping_cents, 0), coalesce(p_packaging_cents, 0),
      coalesce(p_other_costs_cents, 0), nullif(trim(p_tracking_number), ''), nullif(trim(p_carrier), ''),
      nullif(trim(p_notes), ''), p_client_request_id)
    returning id into v_id;
  else
    select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
    if not found then
      raise exception 'Pedido no encontrado' using errcode = 'P0002';
    end if;
    if v_order.paid_at is not null or v_order.received_at is not null
       or v_order.status not in ('draft', 'pending_payment') then
      raise exception 'El pedido ya está pagado, enviado, recibido o cancelado: sus líneas y costes no se pueden modificar'
        using errcode = 'P0001';
    end if;
    update public.purchase_orders set
      reference = coalesce(v_ref, reference),
      supplier_id = p_supplier_id,
      order_date = coalesce(p_order_date, order_date),
      status = p_status,
      discount_cents = coalesce(p_discount_cents, 0),
      shipping_cents = coalesce(p_shipping_cents, 0),
      packaging_cents = coalesce(p_packaging_cents, 0),
      other_costs_cents = coalesce(p_other_costs_cents, 0),
      tracking_number = nullif(trim(p_tracking_number), ''),
      carrier = nullif(trim(p_carrier), ''),
      notes = nullif(trim(p_notes), '')
    where id = p_id;
    delete from public.purchase_order_lines where purchase_order_id = p_id;
    v_id := p_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from public.products
                    where id = (v_line->>'product_id')::uuid and owner_id = uid) then
      raise exception 'Producto no válido en una línea del pedido' using errcode = 'P0001';
    end if;
    insert into public.purchase_order_lines (owner_id, purchase_order_id, product_id, quantity, unit_price_cents, discount_cents)
    values (uid, v_id, (v_line->>'product_id')::uuid, (v_line->>'quantity')::int,
            (v_line->>'unit_price_cents')::bigint, coalesce((v_line->>'discount_cents')::bigint, 0));
    v_lines_net := v_lines_net + (v_line->>'quantity')::int * (v_line->>'unit_price_cents')::bigint
                   - coalesce((v_line->>'discount_cents')::bigint, 0);
  end loop;

  if coalesce(p_discount_cents, 0) > v_lines_net then
    raise exception 'El descuento del pedido no puede superar el importe de los productos' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

create function public.update_purchase_order_info(
  p_id uuid, p_tracking_number text, p_carrier text, p_incidents text, p_notes text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
begin
  update public.purchase_orders set
    tracking_number = nullif(trim(p_tracking_number), ''),
    carrier = nullif(trim(p_carrier), ''),
    incidents = nullif(trim(p_incidents), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_id and owner_id = uid;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

create function public.set_purchase_order_status(p_id uuid, p_status public.po_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_order public.purchase_orders;
begin
  perform private.lock_owner(uid);
  select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido está cancelado' using errcode = 'P0001';
  end if;
  if p_status in ('paid', 'received', 'cancelled') then
    raise exception 'Usa la acción específica para pagar, recibir o cancelar el pedido' using errcode = 'P0001';
  end if;
  if p_status in ('draft', 'pending_payment') and (v_order.paid_at is not null or v_order.received_at is not null) then
    raise exception 'Un pedido pagado o recibido no puede volver a borrador' using errcode = 'P0001';
  end if;
  if p_status = 'shipped' and v_order.received_at is not null then
    raise exception 'El pedido ya fue recibido' using errcode = 'P0001';
  end if;
  if p_status = 'reviewed' and v_order.received_at is null then
    raise exception 'Solo se puede revisar un pedido recibido' using errcode = 'P0001';
  end if;
  update public.purchase_orders set status = p_status where id = p_id;
end;
$$;

-- Pago al proveedor: genera los movimientos de caja. No modifica el stock.
create function public.pay_purchase_order(p_id uuid, p_paid_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_order public.purchase_orders;
  v_total bigint;
  v_goods bigint;
begin
  perform private.lock_owner(uid);
  select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'No se puede pagar un pedido cancelado' using errcode = 'P0001';
  end if;
  if v_order.paid_at is not null then
    raise exception 'Este pedido ya está pagado (%). No se registra un pago duplicado.', v_order.paid_at using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = p_id) then
    raise exception 'El pedido no tiene líneas' using errcode = 'P0001';
  end if;

  v_total := public.purchase_order_total(p_id);
  v_goods := v_total - v_order.shipping_cents;
  perform private.assert_cash(uid, v_total);

  if v_goods > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, purchase_order_id)
    values (uid, coalesce(p_paid_on, private.today()), 'supplier_payment', -v_goods,
            'Pago a proveedor · ' || v_order.reference, p_id);
  end if;
  if v_order.shipping_cents > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, purchase_order_id)
    values (uid, coalesce(p_paid_on, private.today()), 'purchase_shipping', -v_order.shipping_cents,
            'Envío del proveedor · ' || v_order.reference, p_id);
  end if;

  update public.purchase_orders set
    paid_at = coalesce(p_paid_on, private.today()),
    paid_amount_cents = v_total,
    status = case when status in ('draft', 'pending_payment') then 'paid'::public.po_status else status end
  where id = p_id;
end;
$$;

-- Recepción: crea un lote por línea con el coste real (precio + parte proporcional
-- de envío, empaquetado y otros costes, menos el descuento del pedido).
-- El stock solo aumenta aquí, nunca al pagar.
create function public.receive_purchase_order(p_id uuid, p_received_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_order public.purchase_orders;
  v_line record;
  v_lines_net bigint;
  v_extra bigint;
  v_units bigint;
  v_n int;
  v_i int := 0;
  v_ship_left bigint;
  v_extra_left bigint;
  v_ship bigint;
  v_ext bigint;
  v_net bigint;
  v_lot uuid;
  v_date date := coalesce(p_received_on, private.today());
begin
  perform private.lock_owner(uid);
  select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'No se puede recibir un pedido cancelado' using errcode = 'P0001';
  end if;
  if v_order.received_at is not null or exists (select 1 from public.stock_lots where purchase_order_id = p_id) then
    raise exception 'Este pedido ya fue recibido el %. El stock no se duplica.', v_order.received_at using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity * unit_price_cents - discount_cents), 0), coalesce(sum(quantity), 0), count(*)
    into v_lines_net, v_units, v_n
    from public.purchase_order_lines where purchase_order_id = p_id;
  if v_n = 0 then
    raise exception 'El pedido no tiene líneas' using errcode = 'P0001';
  end if;

  v_extra := v_order.packaging_cents + v_order.other_costs_cents - v_order.discount_cents;
  v_ship_left := v_order.shipping_cents;
  v_extra_left := v_extra;

  -- Reparto proporcional al valor de cada línea (o a las unidades si todo es gratis).
  -- La última línea recibe el resto para que la suma cuadre al céntimo.
  for v_line in
    select * from public.purchase_order_lines where purchase_order_id = p_id order by created_at, id
  loop
    v_i := v_i + 1;
    v_net := v_line.quantity * v_line.unit_price_cents - v_line.discount_cents;
    if v_i = v_n then
      v_ship := v_ship_left;
      v_ext := v_extra_left;
    elsif v_lines_net > 0 then
      v_ship := round(v_order.shipping_cents::numeric * v_net / v_lines_net)::bigint;
      v_ext := round(v_extra::numeric * v_net / v_lines_net)::bigint;
    else
      v_ship := round(v_order.shipping_cents::numeric * v_line.quantity / v_units)::bigint;
      v_ext := round(v_extra::numeric * v_line.quantity / v_units)::bigint;
    end if;
    v_ship_left := v_ship_left - v_ship;
    v_extra_left := v_extra_left - v_ext;

    if v_net + v_ship + v_ext < 0 then
      raise exception 'El descuento deja una línea con coste negativo' using errcode = 'P0001';
    end if;

    insert into public.stock_lots (
      owner_id, product_id, purchase_order_id, purchase_order_line_id, received_on,
      quantity_initial, quantity_remaining, base_cost_cents, shipping_cost_cents, extra_cost_cents,
      cost_total_cents, cost_remaining_cents)
    values (uid, v_line.product_id, p_id, v_line.id, v_date, v_line.quantity, v_line.quantity,
            v_net, v_ship, v_ext, v_net + v_ship + v_ext, v_net + v_ship + v_ext)
    returning id into v_lot;

    insert into public.inventory_movements (owner_id, product_id, lot_id, movement_type, quantity, cost_cents,
                                            movement_date, purchase_order_id, note)
    values (uid, v_line.product_id, v_lot, 'purchase_in', v_line.quantity, v_net + v_ship + v_ext,
            v_date, p_id, 'Recepción ' || v_order.reference);
  end loop;

  update public.purchase_orders set received_at = v_date, status = 'received' where id = p_id;
end;
$$;

-- Cancelación: solo antes de recibir. Si estaba pagado y el proveedor devuelve el dinero,
-- se registran movimientos inversos; el pago original permanece en el historial.
create function public.cancel_purchase_order(p_id uuid, p_refund_received boolean, p_refund_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_order public.purchase_orders;
  v_entry public.ledger_entries;
begin
  perform private.lock_owner(uid);
  select * into v_order from public.purchase_orders where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'El pedido ya está cancelado' using errcode = 'P0001';
  end if;
  if v_order.received_at is not null then
    raise exception 'El pedido ya fue recibido: registra las unidades defectuosas como baja de stock en lugar de cancelarlo'
      using errcode = 'P0001';
  end if;

  if v_order.paid_at is not null and coalesce(p_refund_received, false) then
    for v_entry in
      select * from public.ledger_entries e
       where e.purchase_order_id = p_id and e.reverses_entry_id is null
         and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)
    loop
      insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description,
                                         purchase_order_id, reverses_entry_id)
      values (uid, coalesce(p_refund_date, private.today()), 'supplier_refund', -v_entry.amount_cents,
              'Reembolso por cancelación · ' || v_order.reference, p_id, v_entry.id);
    end loop;
  end if;

  update public.purchase_orders set status = 'cancelled', cancelled_at = coalesce(p_refund_date, private.today())
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consumo FIFO de lotes (uso interno)
-- ---------------------------------------------------------------------------
create function private.consume_fifo(
  p_owner uuid, p_product uuid, p_quantity int, p_date date, p_type public.movement_type,
  p_sale_id uuid, p_write_off_id uuid, p_note text
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_available int;
  v_left int := p_quantity;
  v_lot public.stock_lots;
  v_take int;
  v_cost bigint;
  v_total bigint := 0;
begin
  select coalesce(sum(quantity_remaining), 0) into v_available
    from public.stock_lots where owner_id = p_owner and product_id = p_product;
  if v_available < p_quantity then
    raise exception 'Stock insuficiente: hay % unidades disponibles y se necesitan %', v_available, p_quantity
      using errcode = 'P0001';
  end if;

  for v_lot in
    select * from public.stock_lots
     where owner_id = p_owner and product_id = p_product and quantity_remaining > 0
     order by received_on, created_at, id
     for update
  loop
    exit when v_left = 0;
    v_take := least(v_left, v_lot.quantity_remaining);
    -- Coste proporcional del lote; la última unidad se lleva el resto exacto.
    if v_take = v_lot.quantity_remaining then
      v_cost := v_lot.cost_remaining_cents;
    else
      v_cost := round(v_lot.cost_remaining_cents::numeric * v_take / v_lot.quantity_remaining)::bigint;
    end if;

    update public.stock_lots set
      quantity_remaining = quantity_remaining - v_take,
      cost_remaining_cents = cost_remaining_cents - v_cost
    where id = v_lot.id;

    if p_sale_id is not null then
      insert into public.sale_lot_allocations (owner_id, sale_id, lot_id, quantity, cost_cents)
      values (p_owner, p_sale_id, v_lot.id, v_take, v_cost);
    end if;

    insert into public.inventory_movements (owner_id, product_id, lot_id, movement_type, quantity, cost_cents,
                                            movement_date, sale_id, write_off_id, note)
    values (p_owner, p_product, v_lot.id, p_type, -v_take, -v_cost, p_date, p_sale_id, p_write_off_id, p_note);

    v_total := v_total + v_cost;
    v_left := v_left - v_take;
  end loop;

  return v_total;
end;
$$;
revoke all on function private.consume_fifo(uuid, uuid, int, date, public.movement_type, uuid, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------------
create function private.book_sale_payment(p_owner uuid, p_sale public.sales, p_date date) returns void
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
    values (p_owner, p_date, 'platform_fee', -p_sale.platform_fee_cents, 'Comisión · ' || v_label, p_sale.id);
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

create function public.register_sale(
  p_client_request_id uuid,
  p_sale_date date,
  p_product_id uuid,
  p_quantity int,
  p_unit_price_cents bigint,
  p_discount_cents bigint,
  p_platform_fee_cents bigint,
  p_shipping_cost_cents bigint,
  p_other_costs_cents bigint,
  p_payment_status public.sale_payment_status,
  p_delivery_status public.delivery_status,
  p_channel text,
  p_customer text,
  p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_sale public.sales;
  v_existing uuid;
  v_date date := coalesce(p_sale_date, private.today());
begin
  perform private.lock_owner(uid);
  if p_client_request_id is null then
    raise exception 'Falta el identificador de la operación' using errcode = 'P0001';
  end if;
  select id into v_existing from public.sales where owner_id = uid and client_request_id = p_client_request_id;
  if v_existing is not null then
    return v_existing;
  end if;
  if not exists (select 1 from public.products where id = p_product_id and owner_id = uid) then
    raise exception 'Producto no válido' using errcode = 'P0001';
  end if;
  if p_delivery_status = 'returned' then
    raise exception 'Registra las devoluciones con la acción de devolución' using errcode = 'P0001';
  end if;

  insert into public.sales (
    owner_id, sale_date, product_id, quantity, unit_price_cents, discount_cents, platform_fee_cents,
    shipping_cost_cents, other_costs_cents, status, payment_status, delivery_status, channel, customer,
    notes, paid_at, client_request_id)
  values (
    uid, v_date, p_product_id, p_quantity, p_unit_price_cents, coalesce(p_discount_cents, 0),
    coalesce(p_platform_fee_cents, 0), coalesce(p_shipping_cost_cents, 0), coalesce(p_other_costs_cents, 0),
    'confirmed', coalesce(p_payment_status, 'pending'), coalesce(p_delivery_status, 'pending'),
    nullif(trim(p_channel), ''), nullif(trim(p_customer), ''), nullif(trim(p_notes), ''),
    case when p_payment_status = 'paid' then v_date end, p_client_request_id)
  returning * into v_sale;

  perform private.consume_fifo(uid, p_product_id, p_quantity, v_date, 'sale_out', v_sale.id, null, 'Venta');

  if v_sale.payment_status = 'paid' then
    perform private.book_sale_payment(uid, v_sale, v_date);
  end if;

  return v_sale.id;
end;
$$;

create function public.mark_sale_paid(p_id uuid, p_paid_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_sale public.sales;
  v_date date := coalesce(p_paid_on, private.today());
begin
  perform private.lock_owner(uid);
  select * into v_sale from public.sales where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'La venta está cancelada' using errcode = 'P0001';
  end if;
  if v_sale.payment_status = 'paid' then
    raise exception 'La venta ya está cobrada' using errcode = 'P0001';
  end if;
  update public.sales set payment_status = 'paid', paid_at = v_date where id = p_id returning * into v_sale;
  perform private.book_sale_payment(uid, v_sale, v_date);
end;
$$;

create function public.update_sale_delivery(p_id uuid, p_delivery_status public.delivery_status, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
begin
  if p_delivery_status = 'returned' then
    raise exception 'Registra las devoluciones con la acción de devolución' using errcode = 'P0001';
  end if;
  update public.sales set delivery_status = p_delivery_status, notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = p_id and owner_id = uid and status = 'confirmed';
  if not found then
    raise exception 'Venta no encontrada o cancelada' using errcode = 'P0002';
  end if;
end;
$$;

-- Cancelación completa: repone el stock en sus lotes originales con su coste original
-- y, si estaba cobrada, registra los movimientos de caja inversos.
create function public.cancel_sale(p_id uuid, p_reason text, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_sale public.sales;
  v_alloc public.sale_lot_allocations;
  v_entry public.ledger_entries;
  v_date date := coalesce(p_date, private.today());
  v_cash_out bigint;
begin
  perform private.lock_owner(uid);
  select * into v_sale from public.sales where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'La venta ya está cancelada' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sale_returns where sale_id = p_id) then
    raise exception 'La venta tiene devoluciones registradas: registra el resto como devolución' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents), 0) into v_cash_out from public.ledger_entries
   where sale_id = p_id and reverses_entry_id is null;
  if v_cash_out > 0 then
    perform private.assert_cash(uid, v_cash_out);
  end if;

  for v_alloc in select * from public.sale_lot_allocations where sale_id = p_id for update loop
    update public.stock_lots set
      quantity_remaining = quantity_remaining + v_alloc.quantity,
      cost_remaining_cents = cost_remaining_cents + v_alloc.cost_cents
    where id = v_alloc.lot_id;
    insert into public.inventory_movements (owner_id, product_id, lot_id, movement_type, quantity, cost_cents,
                                            movement_date, sale_id, note)
    values (uid, v_sale.product_id, v_alloc.lot_id, 'sale_cancel_in', v_alloc.quantity, v_alloc.cost_cents,
            v_date, p_id, 'Cancelación de venta');
  end loop;

  for v_entry in
    select * from public.ledger_entries e where e.sale_id = p_id and e.reverses_entry_id is null
  loop
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id, reverses_entry_id)
    values (uid, v_date, v_entry.category, -v_entry.amount_cents, 'Anulación · ' || v_entry.description, p_id, v_entry.id);
  end loop;

  update public.sales set status = 'cancelled', cancelled_at = v_date, cancel_reason = nullif(trim(p_reason), '')
  where id = p_id;
end;
$$;

-- Devolución (total o parcial). Si el producto vuelve en buen estado se repone en su
-- lote original; si está defectuoso se registra como pérdida (baja) sin reponerlo.
create function public.register_sale_return(
  p_client_request_id uuid,
  p_sale_id uuid,
  p_return_date date,
  p_quantity int,
  p_refund_cents bigint,
  p_restock boolean,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_sale public.sales;
  v_existing uuid;
  v_returned int;
  v_refunded bigint;
  v_revenue bigint;
  v_left int := p_quantity;
  v_alloc public.sale_lot_allocations;
  v_take int;
  v_cost bigint;
  v_total_cost bigint := 0;
  v_return_id uuid;
  v_date date := coalesce(p_return_date, private.today());
begin
  perform private.lock_owner(uid);
  select id into v_existing from public.sale_returns where owner_id = uid and client_request_id = p_client_request_id;
  if v_existing is not null then
    return v_existing;
  end if;
  select * into v_sale from public.sales where id = p_sale_id and owner_id = uid for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_sale.status = 'cancelled' then
    raise exception 'La venta está cancelada' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Cantidad de devolución no válida' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0), coalesce(sum(refund_cents), 0) into v_returned, v_refunded
    from public.sale_returns where sale_id = p_sale_id;
  if v_returned + p_quantity > v_sale.quantity then
    raise exception 'Solo quedan % unidades por devolver en esta venta', v_sale.quantity - v_returned using errcode = 'P0001';
  end if;
  v_revenue := v_sale.quantity * v_sale.unit_price_cents - v_sale.discount_cents;
  if coalesce(p_refund_cents, 0) > 0 and v_sale.payment_status <> 'paid' then
    raise exception 'La venta no está cobrada: no se puede registrar un reembolso' using errcode = 'P0001';
  end if;
  if v_refunded + coalesce(p_refund_cents, 0) > v_revenue then
    raise exception 'El reembolso total superaría el importe cobrado (%)', private.fmt_eur(v_revenue) using errcode = 'P0001';
  end if;
  if coalesce(p_refund_cents, 0) > 0 then
    perform private.assert_cash(uid, p_refund_cents);
  end if;

  insert into public.sale_returns (owner_id, sale_id, return_date, quantity, refund_cents, restocked, reason, client_request_id)
  values (uid, p_sale_id, v_date, p_quantity, coalesce(p_refund_cents, 0), coalesce(p_restock, true),
          nullif(trim(p_reason), ''), p_client_request_id)
  returning id into v_return_id;

  -- Se revierten primero las asignaciones más recientes (LIFO sobre lo vendido).
  for v_alloc in
    select * from public.sale_lot_allocations
     where sale_id = p_sale_id and returned_quantity < quantity
     order by created_at desc, id desc
     for update
  loop
    exit when v_left = 0;
    v_take := least(v_left, v_alloc.quantity - v_alloc.returned_quantity);
    if v_take = v_alloc.quantity - v_alloc.returned_quantity then
      v_cost := v_alloc.cost_cents - v_alloc.returned_cost_cents;
    else
      v_cost := round(v_alloc.cost_cents::numeric * v_take / v_alloc.quantity)::bigint;
    end if;

    update public.sale_lot_allocations set
      returned_quantity = returned_quantity + v_take,
      returned_cost_cents = returned_cost_cents + v_cost
    where id = v_alloc.id;

    insert into public.inventory_movements (owner_id, product_id, lot_id, movement_type, quantity, cost_cents,
                                            movement_date, sale_id, sale_return_id, note)
    values (uid, v_sale.product_id, v_alloc.lot_id, 'return_in', v_take, v_cost, v_date, p_sale_id, v_return_id,
            'Devolución');

    if coalesce(p_restock, true) then
      update public.stock_lots set
        quantity_remaining = quantity_remaining + v_take,
        cost_remaining_cents = cost_remaining_cents + v_cost
      where id = v_alloc.lot_id;
    else
      insert into public.inventory_movements (owner_id, product_id, lot_id, movement_type, quantity, cost_cents,
                                              movement_date, sale_id, sale_return_id, note)
      values (uid, v_sale.product_id, v_alloc.lot_id, 'write_off', -v_take, -v_cost, v_date, p_sale_id, v_return_id,
              'Devolución defectuosa: no se repone');
    end if;

    v_total_cost := v_total_cost + v_cost;
    v_left := v_left - v_take;
  end loop;

  update public.sale_returns set cost_cents = v_total_cost where id = v_return_id;

  if coalesce(p_refund_cents, 0) > 0 then
    insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, sale_id, sale_return_id)
    values (uid, v_date, 'customer_refund', -p_refund_cents, 'Reembolso de devolución', p_sale_id, v_return_id);
  end if;

  if v_returned + p_quantity = v_sale.quantity then
    update public.sales set delivery_status = 'returned' where id = p_sale_id;
  end if;

  return v_return_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bajas de stock (producto defectuoso, pérdida, robo...)
-- ---------------------------------------------------------------------------
create function public.write_off_stock(
  p_client_request_id uuid, p_product_id uuid, p_quantity int, p_reason text, p_date date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_id uuid;
  v_cost bigint;
  v_date date := coalesce(p_date, private.today());
begin
  perform private.lock_owner(uid);
  select id into v_id from public.stock_write_offs where owner_id = uid and client_request_id = p_client_request_id;
  if v_id is not null then
    return v_id;
  end if;
  if not exists (select 1 from public.products where id = p_product_id and owner_id = uid) then
    raise exception 'Producto no válido' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Cantidad no válida' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indica el motivo de la baja' using errcode = 'P0001';
  end if;
  insert into public.stock_write_offs (owner_id, product_id, write_off_date, quantity, cost_cents, reason, client_request_id)
  values (uid, p_product_id, v_date, p_quantity, 0, trim(p_reason), p_client_request_id)
  returning id into v_id;
  v_cost := private.consume_fifo(uid, p_product_id, p_quantity, v_date, 'write_off', null, v_id, trim(p_reason));
  update public.stock_write_offs set cost_cents = v_cost where id = v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Movimientos manuales de caja
-- ---------------------------------------------------------------------------
create function public.record_ledger_entry(
  p_client_request_id uuid, p_entry_date date, p_category public.ledger_category,
  p_amount_cents bigint, p_description text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_id uuid;
  v_signed bigint;
begin
  perform private.lock_owner(uid);
  select id into v_id from public.ledger_entries where owner_id = uid and client_request_id = p_client_request_id;
  if v_id is not null then
    return v_id;
  end if;
  if p_category not in ('initial_capital', 'capital_contribution', 'expense', 'withdrawal', 'supplier_refund', 'adjustment') then
    raise exception 'Esta categoría se registra automáticamente desde pedidos o ventas' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'El importe no puede ser cero' using errcode = 'P0001';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception 'Añade una descripción' using errcode = 'P0001';
  end if;
  if p_category = 'initial_capital' and exists (
    select 1 from public.ledger_entries e where e.owner_id = uid and e.category = 'initial_capital'
       and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)) then
    raise exception 'El capital inicial ya está registrado. Usa «Aportación de capital» para añadir más.' using errcode = 'P0001';
  end if;

  v_signed := case
    when p_category in ('expense', 'withdrawal') then -abs(p_amount_cents)
    when p_category = 'adjustment' then p_amount_cents
    else abs(p_amount_cents)
  end;
  if v_signed < 0 then
    perform private.assert_cash(uid, -v_signed);
  end if;

  insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, client_request_id)
  values (uid, coalesce(p_entry_date, private.today()), p_category, v_signed, trim(p_description), p_client_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Corrige un movimiento manual erróneo con un asiento inverso (sin borrar el original).
create function public.reverse_ledger_entry(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_owner();
  v_entry public.ledger_entries;
  v_id uuid;
begin
  perform private.lock_owner(uid);
  select * into v_entry from public.ledger_entries where id = p_id and owner_id = uid for update;
  if not found then
    raise exception 'Movimiento no encontrado' using errcode = 'P0002';
  end if;
  if v_entry.sale_id is not null or v_entry.purchase_order_id is not null then
    raise exception 'Este movimiento pertenece a una venta o pedido: anúlalo desde allí' using errcode = 'P0001';
  end if;
  if v_entry.reverses_entry_id is not null then
    raise exception 'No se puede anular una anulación' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ledger_entries where reverses_entry_id = p_id) then
    raise exception 'Este movimiento ya está anulado' using errcode = 'P0001';
  end if;
  if v_entry.amount_cents > 0 then
    perform private.assert_cash(uid, v_entry.amount_cents);
  end if;
  insert into public.ledger_entries (owner_id, entry_date, category, amount_cents, description, reverses_entry_id)
  values (uid, private.today(), v_entry.category, -v_entry.amount_cents,
          'Anulación · ' || v_entry.description || coalesce(' (' || nullif(trim(p_reason), '') || ')', ''), p_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución: solo usuarios autenticados (y la función valida al propietario).
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;

-- ===== 20261020000003_analytics_views.sql =====
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

-- ===== 20261020000004_storage.sql =====
-- ML Supply · Almacenamiento privado para fotos, facturas y documentos.
-- Ruta de cada archivo: <user_id>/<tipo>/<entidad>/<archivo>. Solo el propietario autorizado accede.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Esquema storage no disponible (entorno de pruebas): se omite la configuración de Storage';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attachments', 'attachments', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "attachments: propietario lee" on storage.objects for select to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
             and (select private.is_authorized()))
  $p$;
  execute $p$
    create policy "attachments: propietario sube" on storage.objects for insert to authenticated
      with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
                  and (select private.is_authorized()))
  $p$;
  execute $p$
    create policy "attachments: propietario borra" on storage.objects for delete to authenticated
      using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
             and (select private.is_authorized()))
  $p$;
end;
$$;

commit;
