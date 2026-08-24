# Red de Residuos de la Emergencia · Reciclamores

Herramienta comunitaria para conectar tres cosas que hoy están desconectadas tras
el terremoto del 10 de agosto de 2026: **dónde se acumulan los residuos de las
donaciones**, **quién puede coordinar en cada territorio** y **a dónde hay que
llevar el material**.

No reemplaza a las autoridades ni a la UNGRD.

## Estado

Los tres formularios **ya escriben en la base de datos** (Supabase).

Todavía **no difundir el enlace**: falta la pantalla de moderación, el aviso de
tratamiento de datos personales y el mapa público. Nada de lo que se envía es
visible para nadie hasta que exista esa pantalla.

## Publicación

`index.html` en la raíz, servido por GitHub Pages desde la rama `main`.
No hay compilación ni dependencias: es un solo archivo, sin librerías externas.

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
- **Foto directa desde la cámara**, no un enlace que el usuario debe subir aparte.
- **Bloqueo de seguridad automático**: si el tipo de residuo es RAEE, peligrosos o
  escombros, la interfaz advierte que no lo mueven voluntarios.
- **Consentimiento explícito** para publicar cualquier contacto (Ley 1581 de 2012).
- El aporte al directorio exige confirmar que se llamó al punto antes de proponerlo.

## Pendiente antes de difundir

1. **Pantalla de moderación** para voluntarios no técnicos. Sin ella nadie puede
   revisar lo que entra, y sin revisión nada se publica.
2. Aviso de tratamiento de datos personales (Ley 1581 de 2012).
3. Vista pública: mapa de puntos reportados y directorio consultable.
4. Límite de envíos. Hoy nada impide llenar la base de ruido.
5. Definir quién actúa sobre los reportes.

## Privacidad

En este repositorio **nunca** se guardan datos de personas: ni reportes, ni
teléfonos, ni el Excel con información real. Solo el código del sitio.
