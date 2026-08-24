# Red de Residuos de la Emergencia · Reciclamores

Herramienta comunitaria para conectar tres cosas que hoy están desconectadas tras
el terremoto del 10 de agosto de 2026: **dónde se acumulan los residuos de las
donaciones**, **quién puede coordinar en cada territorio** y **a dónde hay que
llevar el material**.

No reemplaza a las autoridades ni a la UNGRD.

## Estado

Prototipo de interfaz. **Todavía no guarda datos.**

- `prototipo/index.html` — las tres pantallas, navegables en móvil.

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

## Pendiente

- Backend: escribir en la hoja de cálculo (Google Apps Script) y subir fotos a Drive.
- Vista pública de solo lectura: mapa de puntos y directorio.
- Moderación: revisar antes de publicar.
- Aviso de tratamiento de datos personales.
