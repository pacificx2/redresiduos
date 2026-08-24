/**
 * RED DE RESIDUOS DE LA EMERGENCIA · Reciclamores
 * Backend del sitio redresiduos.
 *
 * Este script vive DENTRO de la hoja de cálculo (Extensiones -> Apps Script).
 * Por eso no necesita el ID de la hoja: trabaja sobre la que lo contiene.
 *
 * Recibe los envíos del sitio y escribe una fila en la hoja que corresponda.
 */

var HOJAS = {
  reporte:    '1. Reportes de residuos',
  voluntario: '2. Líderes y voluntarios',
  punto:      '3. Dónde llevarlos'
};

var CARPETA_FOTOS = 'Red de Residuos - Fotos';

/** Prueba de vida: abrir la URL /exec en el navegador debe mostrar este texto. */
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, servicio: 'Red de Residuos', version: 1 }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Envío vacío' });
    }
    var datos = JSON.parse(e.postData.contents);
    var nombreHoja = HOJAS[datos.formulario];
    if (!nombreHoja) {
      return json({ ok: false, error: 'Formulario no reconocido: ' + datos.formulario });
    }

    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
    if (!hoja) {
      return json({ ok: false, error: 'No existe la hoja "' + nombreHoja + '"' });
    }

    // Un candado evita que dos envíos simultáneos escriban en la misma fila.
    var candado = LockService.getScriptLock();
    candado.waitLock(20000);
    try {
      var campos = datos.campos || {};

      if (datos.foto && datos.foto.base64) {
        campos['Enlace a foto'] = guardarFoto(datos.foto, nombreHoja);
      }

      var fila = construirFila(hoja, campos);
      hoja.appendRow(fila);
      var numeroFila = hoja.getLastRow();
    } finally {
      candado.releaseLock();
    }

    return json({ ok: true, fila: numeroFila });

  } catch (err) {
    // El error se registra para poder diagnosticarlo, pero al usuario se le
    // devuelve un mensaje que pueda entender y accionar.
    console.error(err);
    return json({ ok: false, error: 'No se pudo guardar. Inténtelo de nuevo.' });
  }
}

/**
 * Localiza la fila de encabezados y ordena los valores recibidos según ella.
 *
 * Se busca el encabezado en lugar de fijar un número de fila para que el
 * documento se pueda seguir editando -- añadir una nota arriba, mover una
 * columna -- sin romper el backend.
 */
function construirFila(hoja, campos) {
  var filaEncabezado = localizarEncabezado(hoja);
  var encabezados = hoja
    .getRange(filaEncabezado, 1, 1, hoja.getLastColumn())
    .getValues()[0];

  // Los valores entrantes se indexan por su encabezado normalizado.
  var porClave = {};
  for (var clave in campos) {
    porClave[normalizar(clave)] = campos[clave];
  }

  var fila = [];
  for (var i = 0; i < encabezados.length; i++) {
    var clave = normalizar(encabezados[i]);

    if (clave === 'n') {
      fila.push(siguienteNumero(hoja, filaEncabezado));
    } else if (porClave.hasOwnProperty(clave)) {
      fila.push(porClave[clave]);
    } else {
      fila.push('');
    }
  }
  return fila;
}

/** La fila de encabezados es la que contiene la celda "N°". */
function localizarEncabezado(hoja) {
  var alto = Math.min(12, hoja.getLastRow());
  var celdas = hoja.getRange(1, 1, alto, 1).getValues();
  for (var i = 0; i < celdas.length; i++) {
    if (normalizar(celdas[i][0]) === 'n') return i + 1;
  }
  throw new Error('No se encontró la fila de encabezados (columna "N°") en ' + hoja.getName());
}

/** Consecutivo por hoja. La fila siguiente al encabezado es el ejemplo, no cuenta. */
function siguienteNumero(hoja, filaEncabezado) {
  var primeraFilaDatos = filaEncabezado + 2;
  var ultima = hoja.getLastRow();
  if (ultima < primeraFilaDatos) return 1;
  return ultima - primeraFilaDatos + 2;
}

/**
 * Quita acentos, mayúsculas y el paréntesis aclaratorio de los encabezados,
 * de modo que "Fecha del reporte\n(DD/MM/AAAA)" y "fecha del reporte" coincidan.
 */
function normalizar(texto) {
  return String(texto)
    .split('\n')[0]
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // marcas de acento sueltas tras NFD
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toLowerCase();
}

/** Guarda la foto en Drive y devuelve un enlace de solo lectura. */
function guardarFoto(foto, nombreHoja) {
  var carpeta = obtenerCarpeta();
  var blob = Utilities.newBlob(
    Utilities.base64Decode(foto.base64),
    foto.tipo || 'image/jpeg',
    Utilities.formatDate(new Date(), 'America/Bogota', 'yyyyMMdd-HHmmss') + '-' +
      (foto.nombre || 'foto.jpg')
  );
  var archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return archivo.getUrl();
}

function obtenerCarpeta() {
  var existentes = DriveApp.getFoldersByName(CARPETA_FOTOS);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_FOTOS);
}

function json(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
