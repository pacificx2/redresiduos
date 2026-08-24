-- =====================================================================
-- MIGRACIÓN 01 · Moderación, límite de envíos y cierre de permisos
--
-- Ejecutar entera en Supabase → SQL Editor, sobre una base que ya tenga
-- aplicados `schema.sql` y `storage.sql`.
--
-- Es idempotente: volver a ejecutarla no rompe nada ni borra datos.
--
-- Si la base es nueva, no hace falta: `schema.sql` ya incluye todo esto.
-- =====================================================================


-- =====================================================================
-- A · LÍMITE DE ENVÍOS
--
-- Hasta ahora nada impedía llenar la base de ruido. Se cuenta por
-- dirección IP y por hora, dentro de las mismas funciones que insertan,
-- para que no se pueda saltar desde el navegador.
--
-- DECISIÓN IMPORTANTE: si no se puede averiguar la IP, el envío SE
-- PERMITE. En una emergencia, perder un reporte real es peor que aceptar
-- uno falso. El límite frena el ruido masivo, no al que insiste.
-- =====================================================================

-- La IP real del que envía. Detrás del proxy de Supabase, la conexión
-- siempre viene de la misma máquina, así que hay que leer las cabeceras.
create or replace function public.ip_cliente() returns inet
language plpgsql stable security definer set search_path = public as $$
declare
  cabeceras json;
  crudo text;
begin
  begin
    cabeceras := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  if cabeceras is null then
    return null;
  end if;

  crudo := coalesce(
    cabeceras ->> 'cf-connecting-ip',
    cabeceras ->> 'x-real-ip',
    -- x-forwarded-for es una lista; el primero es el cliente.
    nullif(split_part(coalesce(cabeceras ->> 'x-forwarded-for', ''), ',', 1), ''));

  crudo := trim(coalesce(crudo, ''));
  if crudo = '' then
    return null;
  end if;

  begin
    return crudo::inet;
  exception when others then
    return null;
  end;
end $$;

-- Un contador por IP y por hora. Nada más: ni qué se envió, ni cuándo
-- exactamente, ni desde qué formulario. No es un registro de actividad.
create table if not exists public.envios_ip (
  ip      inet        not null,
  ventana timestamptz not null,
  n       integer     not null default 0,
  primary key (ip, ventana)
);

alter table public.envios_ip enable row level security;
-- Sin políticas: nadie del público lo lee ni lo escribe. Sólo lo tocan
-- las funciones `security definer` de abajo.
revoke all on public.envios_ip from anon, authenticated;

comment on table public.envios_ip is
  'Contador anti-ruido por IP y hora. Se purga solo a los 2 días.';

-- Cuántos envíos se permiten por IP y hora.
-- Subirlo si un municipio entero comparte una sola conexión y llega al
-- tope de buena fe; bajarlo si aparece ruido. Es el único número a tocar.
create or replace function public.limite_envios_hora() returns integer
language sql immutable as $$ select 20 $$;

create or replace function public.registrar_envio() returns void
language plpgsql security definer set search_path = public as $$
declare
  cliente inet;
  -- Ojo con el nombre: llamarla `ventana` chocaría con la columna del
  -- mismo nombre y el DELETE de abajo no compilaría.
  hora_en_curso timestamptz := date_trunc('hour', now());
  actual  integer;
begin
  cliente := public.ip_cliente();

  -- Sin IP identificable no se bloquea a nadie. Ver la nota de arriba.
  if cliente is null then
    return;
  end if;

  -- La tabla no debe crecer para siempre; se limpia sola.
  delete from public.envios_ip e where e.ventana < now() - interval '2 days';

  insert into public.envios_ip as e (ip, ventana, n)
  values (cliente, hora_en_curso, 1)
  on conflict (ip, ventana) do update set n = e.n + 1
  returning e.n into actual;

  if actual > public.limite_envios_hora() then
    raise exception
      'Se alcanzó el máximo de envíos por hora desde esta conexión. Espere una hora, o avise al equipo por otra vía si es urgente.'
      using errcode = 'P0002';
  end if;
end $$;




-- ---------------------------------------------------------------------
-- Las tres funciones públicas, ahora con el contador delante.
-- El cuerpo es idéntico al de schema.sql salvo la primera línea.
-- ---------------------------------------------------------------------

create or replace function public.crear_reporte(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  insert into public.reportes (
    departamento, municipio, referencia, lat, lon, precision_m,
    tipo_residuo, volumen, riesgo_sanitario, necesita_gestor, foto_url, notas)
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
    nullif(p->>'notas',''))
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
    disponibilidad, tiene_vehiculo, acepto_seguridad)
  values (
    nullif(p->>'organizacion',''),
    (p->>'departamento')::departamento,
    p->>'municipio',
    nullif(p->>'zona',''),
    (p->>'rol')::rol_voluntario,
    nullif(p->>'disponibilidad','')::disponibilidad,
    nullif(p->>'tiene_vehiculo','')::sino,
    true)
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
    persona_contacto, telefono, como_llega_material, confirmado_por_llamada)
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
    coalesce((p->>'confirmado_por_llamada')::boolean, false))
  returning id into nuevo;
  return nuevo;
end $$;

-- PostgreSQL concede EXECUTE a PUBLIC en cada función que se crea. Sin
-- revocarlo primero, un `revoke ... from anon` no sirve de nada: el
-- permiso le sigue llegando por PUBLIC. Se cierra todo y se abre lo justo.
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon, authenticated;

grant execute on function public.crear_reporte(jsonb),
                          public.crear_voluntario(jsonb),
                          public.proponer_punto(jsonb) to anon, authenticated;

-- La pantalla de moderación pregunta "¿soy moderador?" antes de pedir nada
-- más. Devuelve un booleano sobre quien pregunta: no expone la lista.
grant execute on function public.es_moderador() to authenticated;


-- =====================================================================
-- B · PERMISOS DE MODERACIÓN, COLUMNA POR COLUMNA
--
-- `schema.sql` concedía `update` sobre la tabla entera a cualquier
-- usuario autenticado. Eso permitía a un moderador reescribir el texto
-- de un reporte ajeno, o su fecha de creación, sin dejar rastro.
--
-- Moderar es decidir si algo se publica y en qué estado queda. No es
-- editar lo que otra persona escribió. Los permisos ahora dicen eso.
-- =====================================================================

revoke update on public.reportes, public.voluntarios, public.puntos_acopio
  from authenticated;

-- `notas` de un reporte lo escribe quien reporta: no se toca.
-- `revisado_en` y `revisado_por` los pone el motor, no el cliente (ver C).
grant update (publicado, estado)
  on public.reportes to authenticated;

-- En voluntarios y puntos, `notas` no lo escribe el público: es el
-- cuaderno de la moderación. Ahí sí puede escribir.
grant update (publicado, verificacion, notas)
  on public.voluntarios to authenticated;

grant update (publicado, verificacion, notas)
  on public.puntos_acopio to authenticated;


-- ---------------------------------------------------------------------
-- Quién revisó y cuándo lo sella el motor, no el navegador.
-- Si lo pusiera el cliente, un moderador podría firmar con otro correo.
-- ---------------------------------------------------------------------
create or replace function public.sellar_revision() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quien text := nullif(auth.jwt() ->> 'email', '');
begin
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

drop trigger if exists sella_revision on public.reportes;
create trigger sella_revision before update on public.reportes
  for each row execute function public.sellar_revision();

drop trigger if exists sella_revision on public.voluntarios;
create trigger sella_revision before update on public.voluntarios
  for each row execute function public.sellar_revision();

drop trigger if exists sella_revision on public.puntos_acopio;
create trigger sella_revision before update on public.puntos_acopio
  for each row execute function public.sellar_revision();


-- =====================================================================
-- C · EL DEPÓSITO DE FOTOS DEJA DE SER UN AGUJERO
--
-- `storage.sql` permite a cualquiera subir al depósito `fotos`, que
-- además es público. Sin tope de tamaño ni de tipo, eso sirve para
-- alojar cualquier archivo, de cualquier peso, a costa del proyecto.
--
-- El navegador ya reduce la foto a 1280 px y calidad 0,7: un reporte
-- real pesa entre 100 y 300 KB. 2 MB deja margen de sobra.
-- =====================================================================

update storage.buckets
   set file_size_limit = 2097152,  -- 2 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'fotos';


-- =====================================================================
-- D · EL PRIMER MODERADOR
--
-- Sin al menos una fila aquí, `moderar.html` no deja entrar a nadie:
-- `es_moderador()` devuelve false para todo el mundo, incluido tú.
--
-- Cambiar el correo por el real ANTES de ejecutar. Tiene que ser el
-- mismo con el que se pedirá el enlace de acceso.
-- =====================================================================

-- insert into public.moderadores (correo, nombre)
-- values ('tu@correo.com', 'Nombre y apellido')
-- on conflict (correo) do nothing;


-- =====================================================================
-- COMPROBACIÓN
-- Ejecutar después, para ver que quedó como se esperaba.
-- =====================================================================
-- select count(*) as moderadores from public.moderadores;
-- select public.limite_envios_hora() as tope_por_hora;
-- select id, public.limite_envios_hora(), file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'fotos';
