-- =====================================================================
-- MIGRACIÓN 04 · Ubicación en los puntos de acopio
--
-- Ejecutar entera en Supabase → SQL Editor, después de migracion-03.sql.
-- Es idempotente: se puede repetir sin romper nada ni perder datos.
--
-- `puntos_acopio` ya tenía las columnas `lat` y `lon` y la vista pública
-- ya las exponía, pero el formulario no pedía ubicación y la función de
-- inserción ni siquiera aceptaba esos campos. Resultado: el directorio
-- pintaba un enlace "Cómo llegar" que no podía aparecer nunca, porque las
-- columnas siempre estaban vacías. Esto cierra ese hueco.
-- =====================================================================

-- Cuánto se fía uno de esas coordenadas. Un punto tomado desde la acera de
-- enfrente con ±80 m manda a un camión a la manzana equivocada, así que la
-- moderación tiene que poder verlo.
alter table public.puntos_acopio
  add column if not exists precision_m integer check (precision_m between 0 and 100000);

comment on column public.puntos_acopio.precision_m is
  'Precisión del GPS en metros, tal como la dio el teléfono.';

create or replace function public.proponer_punto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  perform public.registrar_envio();

  insert into public.puntos_acopio (
    nombre, tipo, departamento, municipio, direccion,
    lat, lon, precision_m,
    materiales_si, materiales_no, horario, recoge_domicilio,
    persona_contacto, telefono, telefono_reciclador, telefono_registra,
    como_llega_material, confirmado_por_llamada, publicado)
  values (
    p->>'nombre',
    (p->>'tipo')::tipo_gestor,
    (p->>'departamento')::departamento,
    p->>'municipio',
    nullif(p->>'direccion',''),
    (p->>'lat')::double precision,
    (p->>'lon')::double precision,
    (p->>'precision_m')::integer,
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

-- La precisión se publica junto a las coordenadas: quien va a llevar
-- material merece saber si el punto está marcado con veinte metros de
-- margen o con doscientos.
create or replace view public.v_puntos_publicos as
  select id, nombre, tipo, departamento, municipio, direccion, lat, lon,
         materiales_si, materiales_no, horario, recoge_domicilio,
         persona_contacto, telefono, como_llega_material,
         verificacion, fecha_verificacion,
         telefono_reciclador,
         precision_m
  from public.puntos_acopio
  where publicado and not eliminado;

grant update (precision_m) on public.puntos_acopio to authenticated;

-- Al final, como siempre: PostgreSQL concede EXECUTE a PUBLIC en cada
-- función nueva y hay que volver a cerrarlo después de crearla.
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon, authenticated;
grant execute on function public.crear_reporte(jsonb),
                          public.crear_voluntario(jsonb),
                          public.proponer_punto(jsonb) to anon, authenticated;
grant execute on function public.es_moderador() to authenticated;
