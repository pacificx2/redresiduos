-- =====================================================================
-- MIGRACIÓN 03 · Volumen en kilos, y dos teléfonos más en los puntos
--
-- Ejecutar entera en Supabase → SQL Editor, después de migracion-02.sql.
-- Es idempotente: se puede repetir sin romper nada ni perder datos.
-- =====================================================================


-- =====================================================================
-- A · EL VOLUMEN SE MIDE EN KILOS
--
-- Metros cúbicos no los estima nadie mirando un montón en la calle. Se
-- renombran las etiquetas del tipo enumerado en vez de crear uno nuevo:
-- así las filas que ya existen conservan su valor y no hay que convertir
-- nada. Cada etiqueta lleva un anclaje concreto («llena una moto») porque
-- el kilo tampoco se estima a ojo sin una referencia.
--
-- Las equivalencias salen de la densidad de reciclable suelto, que ronda
-- los 20-40 kg por metro cúbico.
-- =====================================================================

do $$
declare
  cambios text[][] := array[
    ['Menos de 1 m³ (unas pocas bolsas)',  'Menos de 20 kg (unas pocas bolsas)'],
    ['1 a 5 m³ (un camión pequeño)',       '20 a 100 kg (llena una moto o un carrito)'],
    ['5 a 20 m³ (un camión grande)',       '100 a 500 kg (una camioneta llena)'],
    ['Más de 20 m³',                       'Más de 500 kg (hace falta un camión)']
  ];
  i integer;
begin
  for i in 1 .. array_length(cambios, 1) loop
    -- Sólo si la etiqueta vieja sigue ahí: repetir la migración no falla.
    if exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'volumen' and e.enumlabel = cambios[i][1]
    ) then
      execute format('alter type volumen rename value %L to %L', cambios[i][1], cambios[i][2]);
    end if;
  end loop;
end $$;


-- =====================================================================
-- B · DOS TELÉFONOS MÁS EN UN PUNTO DE ACOPIO
--
--   · `telefono_registra`  quien rellenó el formulario. NO se publica:
--     es su contacto para poder preguntarle, igual que en los reportes.
--   · `telefono_reciclador` el reciclador que trabaja en ese punto. SÍ se
--     publica, porque llegar hasta él es justo para lo que sirve esta
--     pantalla.
--
-- La diferencia entre los dos no la decide el navegador: la decide la
-- vista pública de más abajo, que enumera columna por columna lo que sale.
-- =====================================================================

alter table public.puntos_acopio
  add column if not exists telefono_registra   text check (length(telefono_registra) <= 40);
alter table public.puntos_acopio
  add column if not exists telefono_reciclador text check (length(telefono_reciclador) <= 40);

comment on column public.puntos_acopio.telefono_registra is
  'Contacto de quien propuso el punto. Nunca sale por una vista pública.';
comment on column public.puntos_acopio.telefono_reciclador is
  'Reciclador que trabaja en el punto. Sí es público: es como se llega a él.';

-- La columna nueva va AL FINAL: `create or replace view` sólo sabe añadir
-- al final, no insertar en medio. Renombrar en el sitio da
-- "cannot change name of view column". El orden no importa: quien lee la
-- vista busca los campos por nombre.
create or replace view public.v_puntos_publicos as
  select id, nombre, tipo, departamento, municipio, direccion, lat, lon,
         materiales_si, materiales_no, horario, recoge_domicilio,
         persona_contacto, telefono, como_llega_material,
         verificacion, fecha_verificacion,
         telefono_reciclador
  from public.puntos_acopio
  where publicado and not eliminado;

create or replace function public.proponer_punto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  insert into public.puntos_acopio (
    nombre, tipo, departamento, municipio, direccion,
    materiales_si, materiales_no, horario, recoge_domicilio,
    persona_contacto, telefono, telefono_reciclador, telefono_registra,
    como_llega_material, confirmado_por_llamada, publicado)
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
    nullif(p->>'telefono_reciclador',''),
    nullif(p->>'telefono_registra',''),
    nullif(p->>'como_llega_material',''),
    coalesce((p->>'confirmado_por_llamada')::boolean, false),
    public.autopublicar())
  returning id into nuevo;
  return nuevo;
end $$;

-- La moderación tiene que poder corregir los dos.
grant update (telefono_reciclador, telefono_registra)
  on public.puntos_acopio to authenticated;


-- =====================================================================
-- C · CERRAR LOS PERMISOS DE LO QUE SE ACABA DE CREAR
--     Va al final por la misma razón que en la migración anterior:
--     PostgreSQL concede EXECUTE a PUBLIC en cada función nueva.
-- =====================================================================

revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon, authenticated;

grant execute on function public.crear_reporte(jsonb),
                          public.crear_voluntario(jsonb),
                          public.proponer_punto(jsonb) to anon, authenticated;
grant execute on function public.es_moderador() to authenticated;
