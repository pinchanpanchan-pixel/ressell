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
