# Backend · Supabase (PostgreSQL)

## Por qué una base de datos y no una hoja de cálculo

Se recogen teléfonos y ubicaciones de personas en zona de emergencia, con una
casilla que decide si ese contacto se publica o no. En una hoja compartida, esa
frontera depende de la disciplina de quien la usa. Aquí la impone el motor:

- **El público no toca ninguna tabla.** Sólo puede llamar a tres funciones que
  insertan, y leer tres vistas.
- **Nombres y teléfonos viven en tablas separadas** (`*_contacto`) sin ningún
  acceso de lectura para el rol anónimo. No hay consulta, error de configuración
  ni descuido que los exponga.
- **Nada es público hasta que alguien lo revisa.** Las vistas sólo muestran filas
  con `publicado = true`.
- De los voluntarios sólo se publica quien marcó la casilla de autorización.
- **Moderar no es editar.** El permiso de escritura de un moderador va columna
  por columna: puede decidir si algo se publica y en qué estado queda, pero no
  puede reescribir el texto que otra persona envió.
- **Quién revisó y cuándo lo sella el motor**, con un trigger, y no el
  navegador: así no se puede firmar una decisión con el correo de otro.

## Instalación en una base nueva

1. Crear proyecto en [supabase.com](https://supabase.com) (región: la más
   cercana a Colombia, normalmente `us-east`).
2. **SQL Editor** → pegar `schema.sql` entero → *Run*.
3. **SQL Editor** → pegar `storage.sql` entero → *Run*.
4. Dar de alta al primer moderador y configurar el acceso: ver más abajo.
5. Poner la **Project URL** y la **anon key** (*Settings → API*) en `config.js`.

## Si la base ya está desplegada

`migracion-01.sql` aplica sobre una base existente todo lo que se añadió
después del primer despliegue: el límite de envíos, los permisos por columna,
el sello de revisión y los límites del depósito de fotos.

**SQL Editor** → pegar `migracion-01.sql` entero → *Run*. Es idempotente: se
puede ejecutar dos veces sin romper nada, y deja la base igual que una
instalación nueva hecha con `schema.sql`.

## Dar acceso al equipo de moderación

`moderar.html` entra con un enlace de un solo uso enviado al correo. No hay
contraseñas. Hacen falta tres cosas, y las tres son en el panel de Supabase:

1. **Authentication → Providers → Email**: dejar activado el proveedor de
   correo. No hace falta nada más; los enlaces mágicos van por ahí.
2. **Authentication → URL Configuration**: añadir a *Redirect URLs* la
   dirección pública de la pantalla, por ejemplo
   `https://<usuario>.github.io/redresiduos/moderar.html`.
   Sin esto el enlace del correo no devuelve a ninguna parte.
3. **SQL Editor**: dar de alta a cada moderador por su correo.

```sql
insert into public.moderadores (correo, nombre)
values ('correo.real@ejemplo.org', 'Nombre y apellido')
on conflict (correo) do nothing;
```

Mientras esa tabla esté vacía, `moderar.html` no deja entrar a nadie, ni a
quien administra la base. Es lo primero que hay que hacer.

Para quitarle el acceso a alguien basta con borrar su fila.

## Sobre la anon key

Es pública por diseño: va dentro del HTML del sitio y cualquiera puede verla.
No es una contraseña. Lo que se puede hacer con ella lo decide la seguridad a
nivel de fila definida arriba: insertar por las tres funciones y leer las tres
vistas. Nada más.

La que **nunca** debe salir de Supabase es la `service_role key`, que se salta
todas las reglas. No la pegues en ningún sitio, ni me la mandes.

## El límite de envíos

Las tres funciones que insertan cuentan los envíos por dirección IP y por hora
antes de escribir. El tope está en una sola función, para poder cambiarlo sin
tocar nada más:

```sql
create or replace function public.limite_envios_hora() returns integer
language sql immutable as $$ select 20 $$;
```

Conviene subirlo si un municipio entero comparte una conexión y llega al tope
de buena fe, y bajarlo si aparece ruido.

Dos decisiones que conviene conocer:

- El contador vive en SQL y no en el navegador, porque en el navegador se salta
  borrando los datos del sitio.
- **Si no se puede averiguar la IP, el envío se permite.** En una emergencia,
  perder un reporte real es peor que aceptar uno falso.

La tabla `envios_ip` guarda sólo una IP, una hora y un número. Ni qué se envió,
ni desde qué formulario. Se purga sola a los dos días.

## Estructura

| Tabla | Contenido | Lee el público |
|---|---|---|
| `reportes` | Punto, tipo, volumen, estado | Sólo si `publicado` |
| `reportes_contacto` | Quién reporta, WhatsApp | **Nunca** |
| `voluntarios` | Zona, rol, disponibilidad | Sólo si `publicado` |
| `voluntarios_contacto` | Nombre, WhatsApp, correo | **Nunca** |
| `puntos_acopio` | Directorio de gestores | Sólo si `publicado` |
| `moderadores` | Correos con permiso de revisión | Nunca |
| `envios_ip` | Contador anti-ruido | Nunca |

## Cómo se comprueba

`pruebas.sql` levanta el esquema en una PostgreSQL local y comprueba diecisiete
reglas: que el anónimo puede insertar pero no leer contactos, que el límite de
envíos corta donde debe y no afecta a otra IP, que un no-moderador no ve nada,
que un moderador no puede reescribir texto ajeno ni firmar con otro correo, y
que las funciones internas no son llamables desde fuera.

```
initdb -D /tmp/pg -A trust -U postgres
pg_ctl -D /tmp/pg -o '-k /tmp -p 5433' -l /tmp/pg/log start
createdb -h /tmp -p 5433 -U postgres prueba
psql -h /tmp -p 5433 -U postgres -d prueba -f backend/pruebas.sql
```

No hace falta Supabase ni conexión: el archivo simula por su cuenta lo poco que
Supabase añade a una PostgreSQL normal.

## Pendiente

- Pantalla de moderación para no técnicos: existe, pero sólo la ha usado quien
  la escribió. Hay que verla usar por alguien del equipo antes de confiar en ella.
- Que la moderación pueda borrar una fila, y no sólo dejar de publicarla.
- Registro de quién publicó qué y cuándo, más allá del último que tocó la fila.
