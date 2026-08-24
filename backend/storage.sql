-- =====================================================================
-- Almacenamiento de las fotos de los reportes
-- Ejecutar en Supabase -> SQL Editor, después de schema.sql
-- =====================================================================

-- Depósito público: las fotos de un punto de acumulación se ven en el mapa.
-- No contienen datos personales; aun así, la moderación debe revisarlas antes
-- de publicar el reporte al que van asociadas.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Cualquiera puede subir una foto (reportar no exige tener cuenta)...
create policy "anon sube fotos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fotos');

-- ...y cualquiera puede verlas.
create policy "todos ven fotos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'fotos');

-- Nadie del público puede borrar ni sobrescribir: no se conceden
-- políticas de update ni de delete.
