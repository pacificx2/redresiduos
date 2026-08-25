-- =====================================================================
-- PRUEBAS DEL ESQUEMA
--
-- Comprueban en una PostgreSQL local que las reglas de seguridad hacen
-- lo que prometen, sin tocar Supabase ni un solo dato real.
--
-- Cómo se ejecuta (hace falta postgresql-16 o superior):
--
--   initdb -D /tmp/pg -A trust -U postgres
--   pg_ctl -D /tmp/pg -o '-k /tmp -p 5433' -l /tmp/pg/log start
--   createdb -h /tmp -p 5433 -U postgres prueba
--   psql -h /tmp -p 5433 -U postgres -d prueba -f backend/pruebas.sql
--
-- El archivo aplica schema.sql por su cuenta. Lo que hay que leer es la
-- última columna de cada prueba: `t` o el ERROR esperado.
-- =====================================================================

\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------
-- Remedo mínimo de lo que Supabase trae de fábrica y una PostgreSQL
-- normal no tiene: los dos roles, `auth.jwt()` y la tabla de depósitos.
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);

\set ON_ERROR_STOP on
\i backend/schema.sql
\set ON_ERROR_STOP off

-- =====================================================================
-- LAS PRUEBAS
-- =====================================================================

insert into public.moderadores (correo, nombre) values ('mod@ejemplo.org','Moderadora');

-- Las pruebas T1 a T17 comprueban el filtro de moderación, así que se
-- ejecutan con la publicación automática apagada. El interruptor tiene su
-- propio bloque al final (T18 en adelante).
update public.ajustes set valor = false where clave = 'autopublicar';

-- =========== 1 · anon puede insertar por la función ===========
set role anon;
set request.headers = '{"x-forwarded-for":"200.1.1.9, 10.0.0.1"}';
select 'T1 insertar como anon' as prueba,
       public.crear_reporte('{"departamento":"Chocó","municipio":"Quibdó","tipo_residuo":"Icopor","riesgo_sanitario":"Sí","notas":"prueba local","quien_reporta":"Ana","whatsapp":"3001112233"}'::jsonb) is not null as ok;

-- =========== 2 · anon NO puede leer las tablas ===========
select 'T2 anon lee reportes_contacto' as prueba;
select * from public.reportes_contacto;

select 'T3 anon lee la vista pública (vacía, nada publicado)' as prueba,
       count(*) as filas from public.v_reportes_publicos;

-- =========== 4 · límite de envíos ===========
do $$
declare i int; fallo text := 'no falló nunca';
begin
  for i in 1..40 loop
    begin
      perform public.crear_reporte('{"departamento":"Chocó","municipio":"Quibdó","tipo_residuo":"Icopor","riesgo_sanitario":"No"}'::jsonb);
    exception when others then
      fallo := 'bloqueado en el envío nº ' || i || ': ' || sqlerrm;
      exit;
    end;
  end loop;
  raise notice 'T4 límite -> %', fallo;
end $$;

-- IP distinta: no debe estar bloqueada
set request.headers = '{"x-forwarded-for":"190.5.5.5"}';
select 'T5 otra IP sigue pudiendo enviar' as prueba,
       public.crear_reporte('{"departamento":"Cauca","municipio":"Popayán","tipo_residuo":"Vidrio","riesgo_sanitario":"No"}'::jsonb) is not null as ok;

-- Sin cabecera de IP: se permite (falla abierto, a propósito)
reset request.headers;
select 'T6 sin IP identificable se permite' as prueba,
       public.crear_reporte('{"departamento":"Cauca","municipio":"Popayán","tipo_residuo":"Vidrio","riesgo_sanitario":"No"}'::jsonb) is not null as ok;

reset role;


-- ====== Un usuario autenticado que NO es moderador ======
set role authenticated;
set request.jwt.claims = '{"email":"cualquiera@ejemplo.org"}';
select 'T7 no-moderador ve reportes' as prueba, count(*) as filas from public.reportes;
select 'T8 no-moderador ve contactos' as prueba, count(*) as filas from public.reportes_contacto;

-- ====== La moderadora ======
set request.jwt.claims = '{"email":"MOD@Ejemplo.org"}';
select 'T9 es_moderador (correo en otra caja)' as prueba, public.es_moderador() as ok;
select 'T10 moderadora ve reportes' as prueba, count(*) as filas from public.reportes;
select 'T11 moderadora ve el contacto' as prueba, quien_reporta, whatsapp
  from public.reportes_contacto where quien_reporta is not null limit 1;

-- Publicar el reporte de Ana
update public.reportes set publicado = true, estado = 'En gestión'
 where notas = 'prueba local';

select 'T12 quién revisó lo sella el motor' as prueba, revisado_por, revisado_en is not null as con_fecha
  from public.reportes where notas = 'prueba local';

-- Intentar reescribir el texto del reporte ajeno: debe fallar
select 'T13 moderadora reescribe notas ajenas (debe fallar)' as prueba;
update public.reportes set notas = 'texto cambiado' where notas = 'prueba local';

-- Intentar falsificar la firma: debe fallar
select 'T14 moderadora firma con otro correo (debe fallar)' as prueba;
update public.reportes set revisado_por = 'otro@ejemplo.org' where publicado;

reset role;
reset request.jwt.claims;

-- ====== El público ve ya el reporte publicado, sin datos personales ======
set role anon;
select 'T15 la vista pública muestra lo revisado' as prueba,
       departamento, municipio, tipo_residuo, estado from public.v_reportes_publicos;
reset role;

-- ====== Las funciones internas no son del público ======
-- PostgreSQL concede EXECUTE a PUBLIC en cada función nueva. Estas dos
-- pruebas existen porque el primer intento de revocarlo no funcionó:
-- se revocaba de `anon` y el permiso seguía llegando por PUBLIC.
set role anon;
select 'T16 anon llama a registrar_envio (debe fallar)' as prueba;
select public.registrar_envio();

select 'T17 anon llama a ip_cliente (debe fallar)' as prueba;
select public.ip_cliente();
reset role;

-- =====================================================================
-- PUBLICACIÓN AUTOMÁTICA, LOS CUATRO ESTADOS, CORREGIR Y BORRAR
-- =====================================================================
reset role;
reset request.jwt.claims;
set request.headers = '{"x-forwarded-for":"201.4.4.4"}';
update public.ajustes set valor = true where clave = 'autopublicar';

set role anon;
select public.crear_reporte('{"departamento":"Chocó","municipio":"Quibdó","tipo_residuo":"Icopor","riesgo_sanitario":"No","notas":"[T18] autopublicado","quien_reporta":"Ana","whatsapp":"3001112233"}'::jsonb) as _ \gset
reset role;
select 'T18 encendido: entra ya publicado, sin moderar' as prueba, publicado, moderado, eliminado
  from public.reportes where notas = '[T18] autopublicado';

set role anon;
select 'T19 y el público lo ve al momento' as prueba, count(*) as filas
  from public.v_reportes_publicos where notas = '[T18] autopublicado';
select 'T20 anon no lee la tabla de ajustes (debe fallar)' as prueba;
select * from public.ajustes;
reset role;

-- Apagarlo desde la moderación
set role authenticated;
set request.jwt.claims = '{"email":"mod@ejemplo.org"}';
update public.ajustes set valor = false where clave = 'autopublicar';
select 'T21 queda registrado quién apagó el interruptor' as prueba, cambiado_por
  from public.ajustes where clave = 'autopublicar';
reset role;

set role anon;
select public.crear_reporte('{"departamento":"Chocó","municipio":"Quibdó","tipo_residuo":"Vidrio","riesgo_sanitario":"No","notas":"[T22] en espera"}'::jsonb) as _ \gset
reset role;
select 'T22 apagado: entra sin publicar' as prueba, publicado, moderado
  from public.reportes where notas = '[T22] en espera';

-- Moderar: tocarla la marca y la firma
set role authenticated;
set request.jwt.claims = '{"email":"mod@ejemplo.org"}';
update public.reportes set publicado = true where notas = '[T22] en espera';
reset role;
select 'T23 al tocarla queda moderada y firmada' as prueba, moderado, revisado_por
  from public.reportes where notas = '[T22] en espera';

select 'T24 los cuatro estados se distinguen' as prueba,
  count(*) filter (where publicado and not moderado and not eliminado)     as sin_moderar_publicado,
  count(*) filter (where publicado and moderado and not eliminado)         as moderado_publicado,
  count(*) filter (where moderado and eliminado)                           as moderado_eliminado,
  count(*) filter (where not publicado and not moderado and not eliminado) as en_espera
  from public.reportes;

-- Corregir contenido: antes estaba prohibido, ahora se permite a petición
set role authenticated;
set request.jwt.claims = '{"email":"mod@ejemplo.org"}';
update public.reportes set notas = '[T22] corregido', municipio = 'Istmina'
  where notas = '[T22] en espera';
select 'T25 el moderador corrige texto y municipio' as prueba, notas, municipio
  from public.reportes where notas like '[T22]%';
update public.reportes_contacto set whatsapp = '3009998877'
  where reporte_id = (select id from public.reportes where notas = '[T18] autopublicado');
select 'T26 y corrige un teléfono mal escrito' as prueba, whatsapp
  from public.reportes_contacto where whatsapp = '3009998877';

-- Retirar
update public.reportes set eliminado = true where notas like '[T22]%';
reset role;
set role anon;
select 'T27 lo retirado desaparece de lo público' as prueba, count(*) as debe_ser_cero
  from public.v_reportes_publicos where notas like '[T22]%';
reset role;

-- Borrado definitivo
set role authenticated;
set request.jwt.claims = '{"email":"mod@ejemplo.org"}';
delete from public.reportes where notas like '[T22]%';
reset role;
select 'T28 borrado definitivo' as prueba, count(*) as quedan
  from public.reportes where notas like '[T22]%';
select 'T29 ningún contacto queda huérfano' as prueba, count(*) as huerfanos
  from public.reportes_contacto rc
  left join public.reportes r on r.id = rc.reporte_id where r.id is null;

-- Quien no modera no borra
set role authenticated;
set request.jwt.claims = '{"email":"cualquiera@ejemplo.org"}';
delete from public.reportes;
reset role;
select 'T30 un no-moderador no pudo borrar nada' as prueba, count(*) > 0 as siguen_ahi
  from public.reportes;

-- Las funciones internas nuevas tampoco son del público. Esta prueba existe
-- porque `autopublicar()` nació abierta en la base migrada: la revocación
-- general estaba en la migración anterior y corrió antes de crearla.
set role anon;
select 'T31 anon llama a autopublicar (debe fallar)' as prueba;
select public.autopublicar();
reset role;

-- La promesa nueva del formulario de reportes: el contacto de quien reporta
-- no sale por ninguna vista pública, marque lo que marque. Se comprueba
-- contra la definición de la vista, no contra los datos, para que siga
-- valiendo aunque la tabla esté vacía.
select 'T32 la vista pública de reportes no expone contacto' as prueba,
  not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v_reportes_publicos'
      and column_name in ('quien_reporta','whatsapp','publicar_contacto')
  ) as ok;

-- El volumen se mide en kilos. Se comprueba sobre el tipo enumerado y no
-- sobre el HTML: si alguien deja una etiqueta en metros cúbicos en un sitio
-- y en kilos en el otro, el envío falla al guardar y nadie sabe por qué.
select 'T33 el volumen ya no se mide en metros cúbicos' as prueba,
  not exists (select 1 from unnest(enum_range(null::volumen)) v where v::text like '%m³%') as ok,
  exists     (select 1 from unnest(enum_range(null::volumen)) v where v::text like '%kg%')  as hay_kilos;

-- El teléfono de quien aporta un punto no sale por la vista pública; el del
-- reciclador sí, porque llegar hasta él es para lo que sirve el directorio.
select 'T34 de un punto se publica el reciclador, no quien lo aportó' as prueba,
  exists (select 1 from information_schema.columns
          where table_name='v_puntos_publicos' and column_name='telefono_reciclador') as reciclador_si,
  not exists (select 1 from information_schema.columns
          where table_name='v_puntos_publicos' and column_name='telefono_registra') as registra_no;
