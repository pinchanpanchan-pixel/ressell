-- ML Supply · Sincronización en tiempo real entre dispositivos
-- Añade las tablas del negocio a la publicación de Supabase Realtime. Realtime respeta RLS:
-- cada cliente solo recibe los cambios de las filas que puede leer (las del propietario autorizado).
-- No modifica ni borra datos. Se puede ejecutar más de una vez sin efectos secundarios.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['products', 'suppliers', 'purchase_orders', 'purchase_order_lines', 'stock_lots',
                           'sales', 'sale_returns', 'stock_write_offs', 'inventory_movements',
                           'ledger_entries', 'planner_settings', 'attachments'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
