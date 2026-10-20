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
