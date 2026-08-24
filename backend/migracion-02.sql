-- =====================================================================
-- MIGRACIÓN 02 · Estados de moderación, edición y borrado
--
-- Ejecutar entera en Supabase → SQL Editor, después de migracion-01.sql.
-- Es idempotente: se puede repetir sin romper nada ni perder datos.
--
-- QUÉ CAMBIA, EN UNA FRASE
-- Hasta ahora una fila sólo podía estar publicada o no. Ahora se guarda
-- además si alguien la miró (`moderado`) y si un moderador la retiró
-- (`eliminado`), que son cosas distintas de estar publicada.
--
-- Los cuatro estados que salen de eso:
--   1 · No moderado y publicado ....... entró y salió sin que nadie lo viera
--   2 · Moderado y publicado .......... alguien lo revisó y lo dejó fuera
--   3 · Moderado y eliminado .......... alguien lo revisó y lo retiró
--   4 · En espera de moderación ....... entró y no ha salido
-- =====================================================================


-- =====================================================================
-- A · LAS DOS COLUMNAS NUEVAS
-- =====================================================================

alter table public.reportes      add column if not exists moderado  boolean not null default false;
alter table public.reportes      add column if not exists eliminado boolean not null default false;
alter table public.voluntarios   add column if not exists moderado  boolean not null default false;
alter table public.voluntarios   add column if not exists eliminado boolean not null default false;
alter table public.puntos_acopio add column if not exists moderado  boolean not null default false;
alter table public.puntos_acopio add column if not exists eliminado boolean not null default false;

comment on column public.reportes.moderado  is 'Alguien del equipo lo miró. Distinto de estar publicado.';
comment on column public.reportes.eliminado is 'Un moderador lo retiró. La fila sigue ahí para poder deshacerlo.';

-- Lo que ya estaba publicado antes de esta migración se revisó a mano en
-- su momento, así que cuenta como moderado.
--
-- Con los triggers apagados a propósito: `sella_revision` reescribiría
-- `revisado_por` con el usuario de esta migración, que no es nadie, y se
-- perdería el rastro de quién revisó de verdad cada fila.
alter table public.reportes      disable trigger user;
alter table public.voluntarios   disable trigger user;
alter table public.puntos_acopio disable trigger user;

update public.reportes      set moderado = true where publicado and not moderado;
update public.voluntarios   set moderado = true where publicado and not moderado;
update public.puntos_acopio set moderado = true where publicado and not moderado;

alter table public.reportes      enable trigger user;
alter table public.voluntarios   enable trigger user;
alter table public.puntos_acopio enable trigger user;


-- =====================================================================
-- B · PUBLICAR AUTOMÁTICAMENTE LO QUE LLEGA
--
-- Con esto encendido, un envío sale publicado en el momento sin que
-- nadie lo mire. Gana velocidad y pierde el filtro: hay que saber que
-- los teléfonos de quien marcó la casilla de autorización se publican
-- sin revisión previa. El aviso de datos del sitio lo dice tal cual.
--
-- Se apaga desde la propia pantalla de moderación, sin tocar SQL.
-- =====================================================================

create table if not exists public.ajustes (
  clave        text primary key,
  valor        boolean not null,
  cambiado_en  timestamptz not null default now(),
  cambiado_por text
);

insert into public.ajustes (clave, valor) values ('autopublicar', true)
  on conflict (clave) do nothing;

alter table public.ajustes enable row level security;

drop policy if exists mod_lee_ajustes   on public.ajustes;
drop policy if exists mod_edita_ajustes on public.ajustes;
create policy mod_lee_ajustes   on public.ajustes for select using (public.es_moderador());
create policy mod_edita_ajustes on public.ajustes for update using (public.es_moderador());

-- Las funciones de inserción la consultan siendo `security definer`, así
-- que el público nunca lee esta tabla ni sabe cómo está el interruptor.
create or replace function public.autopublicar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.ajustes where clave = 'autopublicar'), false)
$$;

-- Quién cambió el interruptor y cuándo, sin fiarse del navegador.
create or replace function public.sellar_ajuste() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.cambiado_en  := now();
  new.cambiado_por := nullif(auth.jwt() ->> 'email', '');
  return new;
end $$;

drop trigger if exists sella_ajuste on public.ajustes;
create trigger sella_ajuste before update on public.ajustes
  for each row execute function public.sellar_ajuste();


-- =====================================================================
-- C · LAS VISTAS PÚBLICAS NO MUESTRAN LO RETIRADO
-- =====================================================================

create or replace view public.v_reportes_publicos as
  select id, creado_en, departamento, municipio, referencia,
         lat, lon, tipo_residuo, volumen, riesgo_sanitario,
         necesita_gestor, foto_url, estado, notas
  from public.reportes
  where publicado and not eliminado;

create or replace view public.v_puntos_publicos as
  select id, nombre, tipo, departamento, municipio, direccion, lat, lon,
         materiales_si, materiales_no, horario, recoge_domicilio,
         persona_contacto, telefono, como_llega_material,
         verificacion, fecha_verificacion
  from public.puntos_acopio
  where publicado and not eliminado;

create or replace view public.v_voluntarios_publicos as
  select v.id, v.organizacion, v.departamento, v.municipio, v.zona,
         v.rol, v.disponibilidad, v.tiene_vehiculo, v.verificacion,
         c.nombre, c.whatsapp
  from public.voluntarios v
  join public.voluntarios_contacto c on c.voluntario_id = v.id
  where v.publicado and not v.eliminado and c.publicar_contacto;


-- =====================================================================
-- D · LAS TRES FUNCIONES PÚBLICAS RESPETAN EL INTERRUPTOR
--    Idénticas a las de migracion-01.sql salvo la columna `publicado`.
-- =====================================================================

create or replace function public.crear_reporte(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  insert into public.reportes (
    departamento, municipio, referencia, lat, lon, precision_m,
    tipo_residuo, volumen, riesgo_sanitario, necesita_gestor, foto_url, notas,
    publicado)
  values (
    (p->>'departamento')::departamento,
    p->>'municipio',
    nullif(p->>'referencia',''),
    (p->>'lat')::double precision,
    (p->>'lon')::double precision,
    (p->>'precision_m')::integer,
    (p->>'tipo_residuo')::tipo_residuo,
    nullif(p->>'volumen','')::volumen,
    (p->>'riesgo_sanitario')::sino,
    coalesce((p->>'necesita_gestor')::boolean, false),
    nullif(p->>'foto_url',''),
    nullif(p->>'notas',''),
    public.autopublicar())
  returning id into nuevo;

  insert into public.reportes_contacto (
    reporte_id, quien_reporta, whatsapp, publicar_contacto)
  values (
    nuevo,
    nullif(p->>'quien_reporta',''),
    nullif(p->>'whatsapp',''),
    coalesce((p->>'publicar_contacto')::boolean, false));

  return nuevo;
end $$;

create or replace function public.crear_voluntario(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  -- Sin aceptación de las reglas de seguridad no se registra a nadie.
  if coalesce((p->>'acepto_seguridad')::boolean, false) is not true then
    raise exception 'Debe aceptar las reglas de seguridad';
  end if;

  insert into public.voluntarios (
    organizacion, departamento, municipio, zona, rol,
    disponibilidad, tiene_vehiculo, acepto_seguridad, publicado)
  values (
    nullif(p->>'organizacion',''),
    (p->>'departamento')::departamento,
    p->>'municipio',
    nullif(p->>'zona',''),
    (p->>'rol')::rol_voluntario,
    nullif(p->>'disponibilidad','')::disponibilidad,
    nullif(p->>'tiene_vehiculo','')::sino,
    true,
    public.autopublicar())
  returning id into nuevo;

  insert into public.voluntarios_contacto (
    voluntario_id, nombre, whatsapp, correo, enlace_verificacion, publicar_contacto)
  values (
    nuevo,
    p->>'nombre',
    nullif(p->>'whatsapp',''),
    nullif(p->>'correo',''),
    nullif(p->>'enlace_verificacion',''),
    coalesce((p->>'publicar_contacto')::boolean, false));

  return nuevo;
end $$;

create or replace function public.proponer_punto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  insert into public.puntos_acopio (
    nombre, tipo, departamento, municipio, direccion,
    materiales_si, materiales_no, horario, recoge_domicilio,
    persona_contacto, telefono, como_llega_material, confirmado_por_llamada,
    publicado)
  values (
    p->>'nombre',
    (p->>'tipo')::tipo_gestor,
    (p->>'departamento')::departamento,
    p->>'municipio',
    nullif(p->>'direccion',''),
    p->>'materiales_si',
    nullif(p->>'materiales_no',''),
    nullif(p->>'horario',''),
    nullif(p->>'recoge_domicilio','')::sino,
    nullif(p->>'persona_contacto',''),
    nullif(p->>'telefono',''),
    nullif(p->>'como_llega_material',''),
    coalesce((p->>'confirmado_por_llamada')::boolean, false),
    public.autopublicar())
  returning id into nuevo;
  return nuevo;
end $$;


-- =====================================================================
-- E · MODERAR AHORA ES CORREGIR Y BORRAR, NO SÓLO PUBLICAR
--
-- La migración anterior limitaba la escritura a un par de columnas, para
-- que nadie pudiera reescribir el texto de otra persona sin dejar rastro.
-- Se abre a todo el contenido a petición expresa: la mayoría de lo que
-- llega en una emergencia trae erratas, y rechazar por una tilde no sirve
-- de nada. El rastro se conserva: cada cambio sella quién y cuándo, y eso
-- lo pone el motor, no el navegador.
-- =====================================================================

revoke update on public.reportes, public.voluntarios, public.puntos_acopio
  from authenticated;

grant update (departamento, municipio, referencia, lat, lon, precision_m,
              tipo_residuo, volumen, riesgo_sanitario, necesita_gestor,
              foto_url, notas, estado, publicado, eliminado)
  on public.reportes to authenticated;

grant update (organizacion, departamento, municipio, zona, rol,
              disponibilidad, tiene_vehiculo, verificacion, notas,
              publicado, eliminado)
  on public.voluntarios to authenticated;

grant update (nombre, tipo, departamento, municipio, direccion, lat, lon,
              materiales_si, materiales_no, horario, recoge_domicilio,
              persona_contacto, telefono, como_llega_material,
              confirmado_por_llamada, verificacion, notas, publicado, eliminado)
  on public.puntos_acopio to authenticated;

-- Corregir un teléfono mal escrito es la mitad del trabajo de moderar.
grant update (quien_reporta, whatsapp, publicar_contacto)
  on public.reportes_contacto to authenticated;
grant update (nombre, whatsapp, correo, enlace_verificacion, publicar_contacto)
  on public.voluntarios_contacto to authenticated;

grant select, update on public.ajustes to authenticated;

-- Borrado definitivo. Los contactos se van solos por la clave foránea.
grant delete on public.reportes, public.voluntarios, public.puntos_acopio
  to authenticated;

drop policy if exists mod_edita_rcontacto on public.reportes_contacto;
create policy mod_edita_rcontacto on public.reportes_contacto
  for update using (public.es_moderador());

drop policy if exists mod_edita_vcontacto on public.voluntarios_contacto;
create policy mod_edita_vcontacto on public.voluntarios_contacto
  for update using (public.es_moderador());

drop policy if exists mod_borra_reportes on public.reportes;
create policy mod_borra_reportes on public.reportes
  for delete using (public.es_moderador());

drop policy if exists mod_borra_vol on public.voluntarios;
create policy mod_borra_vol on public.voluntarios
  for delete using (public.es_moderador());

drop policy if exists mod_borra_puntos on public.puntos_acopio;
create policy mod_borra_puntos on public.puntos_acopio
  for delete using (public.es_moderador());


-- =====================================================================
-- F · TOCAR UNA FILA ES HABERLA MODERADO
--     Y quién y cuándo lo sigue poniendo el motor.
-- =====================================================================

create or replace function public.sellar_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quien text := nullif(auth.jwt() ->> 'email', '');
begin
  -- Si un moderador la tocó, está moderada. No hay que acordarse de marcarlo.
  new.moderado := true;

  if tg_table_name = 'reportes' then
    new.revisado_en  := now();
    new.revisado_por := quien;
  elsif tg_table_name = 'voluntarios' then
    new.verificado_por := quien;
  elsif tg_table_name = 'puntos_acopio' then
    new.fecha_verificacion := current_date;
  end if;
  return new;
end $$;


-- =====================================================================
-- G · CERRAR LOS PERMISOS DE LAS FUNCIONES NUEVAS
--
-- PostgreSQL concede EXECUTE a PUBLIC en CADA función que se crea. La
-- revocación general vive en migracion-01.sql, que se ejecutó antes de
-- que existieran `autopublicar()` y `sellar_ajuste()`, así que esas dos
-- nacieron abiertas: con la clave pública se podía preguntar si la
-- publicación automática estaba encendida.
--
-- Por eso este bloque va AL FINAL y no al principio: tiene que correr
-- después de crear las funciones, no antes. Es la misma razón por la que
-- en schema.sql la sección de permisos es lo último del archivo.
-- =====================================================================

revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon, authenticated;

grant execute on function public.crear_reporte(jsonb),
                          public.crear_voluntario(jsonb),
                          public.proponer_punto(jsonb) to anon, authenticated;

grant execute on function public.es_moderador() to authenticated;

-- Comprobación: las dos primeras deben fallar, la tercera debe funcionar.
--   set role anon;           select public.autopublicar();   -- permission denied
--   set role anon;           select public.es_moderador();   -- permission denied
--   set role authenticated;  select public.es_moderador();   -- false o true
