-- =====================================================================
-- RED DE RESIDUOS DE LA EMERGENCIA · Reciclamores
-- Esquema de base de datos (PostgreSQL / Supabase)
--
-- Ejecutar entero, una sola vez, en Supabase -> SQL Editor.
--
-- PRINCIPIO DE DISEÑO
-- El público no toca ninguna tabla. Sólo puede llamar a tres funciones
-- que insertan, y leer tres vistas que nunca exponen datos personales.
-- Los teléfonos y nombres viven en tablas aparte a las que el rol anónimo
-- no tiene acceso de lectura de ninguna forma.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Vocabularios (los de la hoja "Listas" del Excel original)
-- ---------------------------------------------------------------------
create type departamento as enum (
  'Chocó','Risaralda','Valle del Cauca','Caldas','Quindío','Antioquia',
  'Cauca','Tolima','Cundinamarca','Bogotá D.C.','Nariño','Huila','Otro');

create type tipo_residuo as enum (
  'Plástico (botellas, empaques)','Icopor','Cartón y papel',
  'Bolsas y plástico film','Vidrio','Latas y metal','Ropa y textiles',
  'Orgánicos / alimentos','Mezclado sin separar','RAEE (electrónicos)',
  'Peligrosos (pilas, medicamentos)','Escombros','Otro');

-- En kilos y no en metros cúbicos: nadie estima un volumen mirando un
-- montón en la calle. Cada tramo lleva un anclaje concreto, porque el kilo
-- tampoco se estima a ojo sin una referencia.
create type volumen as enum (
  'Menos de 20 kg (unas pocas bolsas)','20 a 100 kg (llena una moto o un carrito)',
  '100 a 500 kg (una camioneta llena)','Más de 500 kg (hace falta un camión)',
  'No sé calcularlo');

create type sino as enum ('Sí','No','No sé');

create type estado_reporte as enum (
  'Reportado','En gestión','Voluntarios asignados','Recogido',
  'Sin solución aún','Duplicado');

create type rol_voluntario as enum (
  'Líder de zona','Voluntario de campo','Transporte / vehículo',
  'Bodega o acopio temporal','Comunicación y convocatoria',
  'Contacto institucional','Otro');

create type tipo_gestor as enum (
  'Asociación de recicladores','Reciclador de oficio independiente',
  'Punto limpio / ECA','Bodega de reciclaje','Gestor de RAEE',
  'Compostaje','Empresa de aseo del municipio','Otro');

create type disponibilidad as enum (
  'Tiempo completo','Medio tiempo','Solo fines de semana',
  'Por jornadas puntuales','Solo apoyo remoto');

create type verificacion as enum ('Verificado','Por verificar','No se pudo contactar');

-- ---------------------------------------------------------------------
-- Quién puede moderar
-- ---------------------------------------------------------------------
create table public.moderadores (
  correo text primary key,
  nombre text,
  alta timestamptz not null default now()
);

create or replace function public.es_moderador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.moderadores
    where lower(correo) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- Ajustes que la moderación puede cambiar sin tocar SQL
-- ---------------------------------------------------------------------
create table public.ajustes (
  clave        text primary key,
  valor        boolean not null,
  cambiado_en  timestamptz not null default now(),
  cambiado_por text
);

-- Publicar automáticamente lo que llega.
--
-- Encendido, un envío sale publicado en el momento sin que nadie lo mire:
-- se gana velocidad y se pierde el filtro. Los teléfonos de quien marcó la
-- casilla de autorización se publican sin revisión previa, y el aviso de
-- datos del sitio tiene que decirlo. Se apaga desde la moderación.
insert into public.ajustes (clave, valor) values ('autopublicar', true);

-- Las funciones de inserción la consultan siendo `security definer`, así
-- que el público nunca lee esta tabla ni sabe cómo está el interruptor.
create or replace function public.autopublicar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.ajustes where clave = 'autopublicar'), false)
$$;

create or replace function public.sellar_ajuste() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.cambiado_en  := now();
  new.cambiado_por := nullif(auth.jwt() ->> 'email', '');
  return new;
end $$;

create trigger sella_ajuste before update on public.ajustes
  for each row execute function public.sellar_ajuste();

-- ---------------------------------------------------------------------
-- 1 · Reportes de residuos
-- Los datos de contacto van aparte, a propósito.
-- ---------------------------------------------------------------------
create table public.reportes (
  id              uuid primary key default gen_random_uuid(),
  creado_en       timestamptz not null default now(),
  departamento    departamento not null,
  municipio       text not null check (length(trim(municipio)) between 2 and 120),
  referencia      text check (length(referencia) <= 500),
  lat             double precision check (lat between -90 and 90),
  lon             double precision check (lon between -180 and 180),
  precision_m     integer check (precision_m between 0 and 100000),
  tipo_residuo    tipo_residuo not null,
  volumen         volumen,
  riesgo_sanitario sino not null,
  necesita_gestor boolean not null default false,
  foto_url        text,
  notas           text check (length(notas) <= 2000),
  estado          estado_reporte not null default 'Reportado',
  -- Tres cosas distintas: si se ve, si alguien la miró, si la retiraron.
  publicado       boolean not null default false,
  moderado        boolean not null default false,
  eliminado       boolean not null default false,
  revisado_en     timestamptz,
  revisado_por    text
);

create table public.reportes_contacto (
  reporte_id        uuid primary key references public.reportes(id) on delete cascade,
  quien_reporta     text check (length(quien_reporta) <= 160),
  whatsapp          text check (length(whatsapp) <= 40),
  publicar_contacto boolean not null default false
);

create index on public.reportes (publicado, creado_en desc);
create index on public.reportes (departamento, municipio);

-- ---------------------------------------------------------------------
-- 2 · Líderes y voluntarios
-- ---------------------------------------------------------------------
create table public.voluntarios (
  id             uuid primary key default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  organizacion   text check (length(organizacion) <= 200),
  departamento   departamento not null,
  municipio      text not null check (length(trim(municipio)) between 2 and 120),
  zona           text check (length(zona) <= 500),
  rol            rol_voluntario not null,
  disponibilidad disponibilidad,
  tiene_vehiculo sino,
  acepto_seguridad boolean not null default false,
  verificacion   verificacion not null default 'Por verificar',
  verificado_por text,
  notas          text check (length(notas) <= 2000),
  publicado      boolean not null default false,
  moderado       boolean not null default false,
  eliminado      boolean not null default false
);

create table public.voluntarios_contacto (
  voluntario_id     uuid primary key references public.voluntarios(id) on delete cascade,
  nombre            text not null check (length(trim(nombre)) between 2 and 160),
  whatsapp          text check (length(whatsapp) <= 40),
  correo            text check (length(correo) <= 200),
  enlace_verificacion text check (length(enlace_verificacion) <= 500),
  publicar_contacto boolean not null default false
);

-- ---------------------------------------------------------------------
-- 3 · Dónde llevar el material
-- ---------------------------------------------------------------------
create table public.puntos_acopio (
  id                  uuid primary key default gen_random_uuid(),
  creado_en           timestamptz not null default now(),
  nombre              text not null check (length(trim(nombre)) between 2 and 200),
  tipo                tipo_gestor not null,
  departamento        departamento not null,
  municipio           text not null check (length(trim(municipio)) between 2 and 120),
  direccion           text check (length(direccion) <= 300),
  lat                 double precision check (lat between -90 and 90),
  lon                 double precision check (lon between -180 and 180),
  materiales_si       text not null check (length(materiales_si) <= 600),
  materiales_no       text check (length(materiales_no) <= 600),
  horario             text check (length(horario) <= 300),
  recoge_domicilio    sino,
  persona_contacto    text check (length(persona_contacto) <= 160),
  telefono            text check (length(telefono) <= 40),
  -- El reciclador que trabaja en el punto: sí es público, llegar hasta él
  -- es justo para lo que sirve el directorio.
  telefono_reciclador text check (length(telefono_reciclador) <= 40),
  -- Quien rellenó el formulario: NO se publica, igual que en los reportes.
  -- No sale por ninguna vista; el filtro es la lista de columnas de abajo.
  telefono_registra   text check (length(telefono_registra) <= 40),
  como_llega_material text check (length(como_llega_material) <= 600),
  confirmado_por_llamada boolean not null default false,
  verificacion        verificacion not null default 'Por verificar',
  fecha_verificacion  date,
  notas               text check (length(notas) <= 2000),
  publicado           boolean not null default false,
  moderado            boolean not null default false,
  eliminado           boolean not null default false
);

-- =====================================================================
-- SEGURIDAD
-- =====================================================================
alter table public.reportes             enable row level security;
alter table public.reportes_contacto    enable row level security;
alter table public.voluntarios          enable row level security;
alter table public.voluntarios_contacto enable row level security;
alter table public.puntos_acopio        enable row level security;
alter table public.moderadores          enable row level security;

-- Sin políticas para anon: el público no lee ni escribe tablas directamente.
-- Moderación: lectura y actualización completas.
create policy mod_lee_reportes    on public.reportes             for select using (es_moderador());
create policy mod_edita_reportes  on public.reportes             for update using (es_moderador());
create policy mod_lee_rcontacto   on public.reportes_contacto    for select using (es_moderador());
create policy mod_lee_vol         on public.voluntarios          for select using (es_moderador());
create policy mod_edita_vol       on public.voluntarios          for update using (es_moderador());
create policy mod_lee_vcontacto   on public.voluntarios_contacto for select using (es_moderador());
create policy mod_lee_puntos      on public.puntos_acopio        for select using (es_moderador());
create policy mod_edita_puntos    on public.puntos_acopio        for update using (es_moderador());
create policy mod_lee_moderadores on public.moderadores          for select using (es_moderador());

-- Corregir un teléfono mal escrito es la mitad del trabajo de moderar.
create policy mod_edita_rcontacto on public.reportes_contacto    for update using (es_moderador());
create policy mod_edita_vcontacto on public.voluntarios_contacto for update using (es_moderador());

-- Borrado definitivo. Los contactos se van solos por la clave foránea.
create policy mod_borra_reportes  on public.reportes             for delete using (es_moderador());
create policy mod_borra_vol       on public.voluntarios          for delete using (es_moderador());
create policy mod_borra_puntos    on public.puntos_acopio        for delete using (es_moderador());

-- Los ajustes sólo los ve y los cambia quien modera.
alter table public.ajustes enable row level security;
create policy mod_lee_ajustes     on public.ajustes              for select using (es_moderador());
create policy mod_edita_ajustes   on public.ajustes              for update using (es_moderador());

-- =====================================================================
-- LO QUE EL PÚBLICO SÍ PUEDE LEER
-- Vistas sin un solo dato personal. Sólo filas ya revisadas.
-- =====================================================================
create view public.v_reportes_publicos as
  select id, creado_en, departamento, municipio, referencia,
         lat, lon, tipo_residuo, volumen, riesgo_sanitario,
         necesita_gestor, foto_url, estado, notas
  from public.reportes
  where publicado and not eliminado;

create view public.v_puntos_publicos as
  select id, nombre, tipo, departamento, municipio, direccion, lat, lon,
         materiales_si, materiales_no, horario, recoge_domicilio,
         persona_contacto, telefono, como_llega_material,
         verificacion, fecha_verificacion,
         telefono_reciclador
  from public.puntos_acopio
  where publicado and not eliminado;

-- De los voluntarios sólo se publica quien lo autorizó expresamente.
create view public.v_voluntarios_publicos as
  select v.id, v.organizacion, v.departamento, v.municipio, v.zona,
         v.rol, v.disponibilidad, v.tiene_vehiculo, v.verificacion,
         c.nombre, c.whatsapp
  from public.voluntarios v
  join public.voluntarios_contacto c on c.voluntario_id = v.id
  where v.publicado and not v.eliminado and c.publicar_contacto;

-- =====================================================================
-- LÍMITE DE ENVÍOS
--
-- Nada impide a nadie llenar la base de ruido, así que se cuenta por
-- dirección IP y por hora dentro de las mismas funciones que insertan.
-- Hacerlo en el navegador no serviría: se salta borrando los datos del sitio.
--
-- DECISIÓN IMPORTANTE: si no se puede averiguar la IP, el envío SE PERMITE.
-- En una emergencia, perder un reporte real es peor que aceptar uno falso.
-- =====================================================================

-- Detrás del proxy de Supabase la conexión siempre viene de la misma
-- máquina, así que la IP del que envía hay que leerla de las cabeceras.
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

-- Un contador por IP y hora. Nada más: ni qué se envió, ni desde qué
-- formulario, ni a qué hora exacta. No es un registro de actividad.
create table public.envios_ip (
  ip      inet        not null,
  ventana timestamptz not null,
  n       integer     not null default 0,
  primary key (ip, ventana)
);

-- No lo lee ni lo escribe nadie del público: sólo lo tocan las
-- funciones `security definer` de aquí abajo.
alter table public.envios_ip enable row level security;

comment on table public.envios_ip is
  'Contador anti-ruido por IP y hora. Se purga solo a los 2 días.';

-- El único número que hay que tocar. Subirlo si un municipio entero
-- comparte una conexión y llega al tope de buena fe.
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

-- =====================================================================
-- QUIÉN REVISÓ Y CUÁNDO LO SELLA EL MOTOR
--
-- Si lo pusiera el navegador, un moderador podría firmar su decisión
-- con el correo de otro. Aquí no puede.
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

create trigger sella_revision before update on public.reportes
  for each row execute function public.sellar_revision();
create trigger sella_revision before update on public.voluntarios
  for each row execute function public.sellar_revision();
create trigger sella_revision before update on public.puntos_acopio
  for each row execute function public.sellar_revision();

-- =====================================================================
-- LO QUE EL PÚBLICO SÍ PUEDE ESCRIBIR
-- Tres funciones. Nada más. Insertan; nunca devuelven datos ajenos.
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
    persona_contacto, telefono, telefono_reciclador, telefono_registra,
    como_llega_material, confirmado_por_llamada,
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
    nullif(p->>'telefono_reciclador',''),
    nullif(p->>'telefono_registra',''),
    nullif(p->>'como_llega_material',''),
    coalesce((p->>'confirmado_por_llamada')::boolean, false),
    public.autopublicar())
  returning id into nuevo;
  return nuevo;
end $$;

-- =====================================================================
-- PERMISOS
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
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

grant select on public.v_reportes_publicos,
                public.v_puntos_publicos,
                public.v_voluntarios_publicos to anon, authenticated;

grant select on public.reportes, public.voluntarios, public.puntos_acopio to authenticated;

-- Moderar es publicar, corregir y retirar. El permiso de escritura va
-- columna por columna igualmente: lo que el moderador NO puede tocar es
-- la fecha de creación, el identificador y las columnas de auditoría
-- (`moderado`, `revisado_en`, `revisado_por`), que las pone el motor con
-- el trigger `sella_revision`. Así el rastro no se puede falsificar
-- aunque el contenido sí se pueda corregir.
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
              persona_contacto, telefono, telefono_reciclador, telefono_registra,
              como_llega_material, confirmado_por_llamada, verificacion, notas,
              publicado, eliminado)
  on public.puntos_acopio to authenticated;

grant update (quien_reporta, whatsapp, publicar_contacto)
  on public.reportes_contacto to authenticated;
grant update (nombre, whatsapp, correo, enlace_verificacion, publicar_contacto)
  on public.voluntarios_contacto to authenticated;

grant select, update on public.ajustes to authenticated;

grant delete on public.reportes, public.voluntarios, public.puntos_acopio
  to authenticated;
grant select on public.reportes_contacto, public.voluntarios_contacto, public.moderadores to authenticated;

-- Primer moderador. Cambiar por el correo real antes de ejecutar.
-- insert into public.moderadores (correo, nombre) values ('tu@correo.com', 'Davide');
