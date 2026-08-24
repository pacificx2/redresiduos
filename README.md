# Red de Residuos de la Emergencia · Reciclamores

Herramienta comunitaria para conectar tres cosas que hoy están desconectadas tras
el terremoto del 10 de agosto de 2026: **dónde se acumulan los residuos de las
donaciones**, **quién puede coordinar en cada territorio** y **a dónde hay que
llevar el material**.

No reemplaza a las autoridades ni a la UNGRD.

## Estado

Los tres formularios escriben en la base de datos (Supabase). Existen ya la
pantalla de moderación, el aviso de tratamiento de datos y el directorio
público, y hay un límite de envíos por hora que frena el ruido.

Antes de difundir el enlace queda pendiente lo de la lista de abajo, que ya
no bloquea la publicación: el sitio se puede visitar, los formularios escriben,
el aviso de datos está completo y la moderación funciona.

## Las páginas

| Archivo | Para quién | Qué hace |
|---|---|---|
| `index.html` | Cualquiera | Los tres formularios |
| `directorio.html` | Cualquiera | Puntos, reportes y voluntarios ya revisados |
| `datos.html` | Cualquiera | Aviso de tratamiento de datos (Ley 1581 de 2012) |
| `moderar.html` | El equipo | Bandeja de revisión. Muestra datos personales |
| `estilos.css` | — | Estilos de las cuatro páginas |
| `config.js` | — | La URL y la clave pública de Supabase |

`moderar.html` lleva `noindex` y no se enlaza desde la portada, pero **no es
secreta**: quien la abra sin ser moderador recibe listas vacías de la propia
base de datos. La protección está en el motor, no en el desconocimiento de la
dirección.

## Publicación

GitHub Pages desde la rama `main`, servida desde la raíz. No hay compilación ni
paso de construcción. La única dependencia externa son las tipografías de
Google Fonts; si no cargan, el sitio se ve con la tipografía del sistema y
funciona igual.

## Origen de los datos

La estructura viene de `Red_Residuos_Emergencia_Reciclamores.xlsx`:

| Hoja del Excel | Pantalla |
|---|---|
| 1. Reportes de residuos | Reportar residuos acumulados |
| 2. Líderes y voluntarios | Ofrecerme como voluntario o líder |
| 3. Dónde llevarlos | Aportar un punto donde reciben material |

Las listas desplegables son exactamente las de la hoja `Listas`.

## Decisiones de diseño

- **GPS de un toque** en lugar de pedir un enlace de Google Maps pegado a mano.
  En zonas sin nomenclatura, una dirección escrita no sirve para enviar un camión.
- **Foto directa desde la cámara**, reducida en el teléfono antes de subirla.
  En Chocó la conexión no aguanta una foto de 4 MB.
- **Si no hay señal, el envío se guarda** en el teléfono y se reintenta al
  volver a abrir la página.
- **Bloqueo de seguridad automático**: si el tipo de residuo es RAEE, peligrosos o
  escombros, la interfaz advierte que no lo mueven voluntarios.
- **Consentimiento explícito** para publicar cualquier contacto (Ley 1581 de 2012).
- El aporte al directorio exige confirmar que se llamó al punto antes de proponerlo.
- **Directorio sin mapa embebido.** Un mapa necesita descargar teselas de un
  servidor de terceros; una lista filtrable con enlace a Google Maps por punto
  da la misma información, carga con mala señal y no le cuenta a nadie de fuera
  qué está mirando el usuario.

## Cómo se prueba

Las reglas de seguridad de la base se comprueban en una PostgreSQL local, sin
tocar Supabase:

```
initdb -D /tmp/pg -A trust -U postgres
pg_ctl -D /tmp/pg -o '-k /tmp -p 5433' -l /tmp/pg/log start
createdb -h /tmp -p 5433 -U postgres prueba
psql -h /tmp -p 5433 -U postgres -d prueba -f backend/pruebas.sql
```

Las cuatro páginas se comprueban en un Chromium de verdad, con respuestas de
mentira (tampoco tocan la base):

```
npm install playwright && npx playwright install chromium
python3 -m http.server 8099 &
node pruebas/navegador.mjs
```

## Pendiente antes de difundir

1. **Definir quién actúa sobre los reportes.** No es código: sin ese acuerdo,
   la moderación publica cosas que después nadie recoge.
2. **Ver a alguien del equipo usar la moderación.** Sólo la ha usado quien la
   escribió; eso no es lo mismo que saber que se entiende.
3. Que la página abra sin señal (aún hace falta conexión para cargarla).
4. Que la moderación pueda borrar una fila, y no sólo dejar de publicarla.

Y hay que atender de verdad `contacto@reciclamores.org`, porque el aviso de
datos promete por escrito que ahí se responde en diez días hábiles.

## Privacidad

En este repositorio **nunca** se guardan datos de personas: ni reportes, ni
teléfonos, ni el Excel con información real. Solo el código del sitio.
