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

## Instalación

1. Crear proyecto en [supabase.com](https://supabase.com) (región: elegir la más
   cercana a Colombia, normalmente `us-east`).
2. **SQL Editor** → pegar `schema.sql` entero → *Run*.
3. Añadirse como moderador: descomentar la última línea del archivo con el correo
   real, o ejecutarla aparte.
4. Pasarle a Claude la **Project URL** y la **anon key** (*Settings → API*).

## Sobre la anon key

Es pública por diseño: va dentro del HTML del sitio y cualquiera puede verla.
No es una contraseña. Lo que se puede hacer con ella lo decide la seguridad a
nivel de fila definida arriba: insertar por las tres funciones y leer las tres
vistas. Nada más.

La que **nunca** debe salir de Supabase es la `service_role key`, que se salta
todas las reglas. No la pegues en ningún sitio, ni me la mandes.

## Estructura

| Tabla | Contenido | Lee el público |
|---|---|---|
| `reportes` | Punto, tipo, volumen, estado | Sólo si `publicado` |
| `reportes_contacto` | Quién reporta, WhatsApp | **Nunca** |
| `voluntarios` | Zona, rol, disponibilidad | Sólo si `publicado` |
| `voluntarios_contacto` | Nombre, WhatsApp, correo | **Nunca** |
| `puntos_acopio` | Directorio de gestores | Sólo si `publicado` |
| `moderadores` | Correos con permiso de revisión | Nunca |

## Pendiente

- Pantalla de moderación para voluntarios no técnicos.
- Almacenamiento de fotos (Supabase Storage) y reducción de la imagen en el
  teléfono antes de subirla: en Chocó la conexión no aguanta fotos de 4 MB.
- Límite de envíos por dispositivo. Hoy nada impide llenar la base de ruido.
- Aviso de tratamiento de datos personales (Ley 1581 de 2012).
