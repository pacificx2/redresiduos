# Backend · Google Apps Script

`Codigo.gs` recibe los envíos del sitio y escribe una fila en la hoja que
corresponda. Vive **dentro** de la hoja de cálculo, no en un servidor.

## Instalación (una sola vez)

1. **Subir el Excel a Drive y convertirlo.**
   drive.google.com → Nuevo → Subida de archivo → `Red_Residuos_Emergencia_Reciclamores.xlsx`.
   Abrirlo → *Archivo → Guardar como Hojas de cálculo de Google*.
   Los nombres de las tres hojas deben quedar exactamente igual:
   `1. Reportes de residuos`, `2. Líderes y voluntarios`, `3. Dónde llevarlos`.

2. **Pegar el código.**
   En la hoja: *Extensiones → Apps Script*. Borrar lo que haya y pegar `Codigo.gs`.
   Guardar (💾).

3. **Publicar.**
   *Implementar → Nueva implementación → Tipo: Aplicación web*
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**

   Google pedirá autorización y mostrará "Google no ha verificado esta aplicación":
   *Configuración avanzada → Ir a (nombre) (no seguro)*. Es un aviso normal para
   scripts propios sin verificar; el código es el de este repositorio.

4. **Copiar la URL** que termina en `/exec` y pasársela a Claude.

## Comprobar que quedó bien

Abrir la URL `/exec` en el navegador. Debe responder:

```json
{"ok":true,"servicio":"Red de Residuos","version":1}
```

## Cómo encuentra las columnas

El script no usa posiciones fijas. Busca la fila que contiene `N°`, lee los
encabezados y ordena los valores según ellos, comparando sin acentos, sin
mayúsculas y sin el paréntesis aclaratorio. Así se pueden mover columnas o
añadir notas encima sin romper nada.

Lo único que **no** se debe cambiar: los nombres de las tres hojas y la celda `N°`.

## Qué NO hace todavía

- No modera: toda fila entra directamente con estado `Reportado` / `Por verificar`.
- No valida que el teléfono exista ni que el punto sea real.
- No limita la frecuencia de envíos. Si aparece spam, hay que añadir un control.
