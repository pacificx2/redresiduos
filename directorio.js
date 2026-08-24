/* =====================================================================
   DIRECTORIO PÚBLICO · lógica compartida

   Una sola página por tipo. Cada una define `TIPO` antes de cargar este
   archivo y aquí se lee: no hay pestañas, no hay que adivinar en cuál se
   está, y los contadores no pueden quedarse en blanco porque sólo hay uno
   y se calcula al cargar.

   Lee la vista pública que el esquema deja abierta al anónimo. Esa vista
   ya viene filtrada: sólo devuelve filas publicadas y no retiradas, y de
   los voluntarios sólo a quien autorizó publicar su contacto. Esta página
   no puede ver nada más aunque quiera.
   ===================================================================== */

/* =====================================================================
   DIRECTORIO PÚBLICO

   Lee las tres vistas que el esquema deja abiertas al público. Esas
   vistas ya vienen filtradas: sólo devuelven filas revisadas, y de los
   voluntarios sólo a quien autorizó expresamente publicar su contacto.
   Esta página no puede ver nada más aunque quiera.
   ===================================================================== */

var pestana = 'puntos';
var espera = null;

var DEPARTAMENTOS = ['Chocó','Risaralda','Valle del Cauca','Caldas','Quindío',
  'Antioquia','Cauca','Tolima','Cundinamarca','Bogotá D.C.','Nariño','Huila','Otro'];

var CATALOGO = {
  puntos: {
    vista:'v_puntos_publicos', orden:'nombre.asc',
    clase:'t-puntos', pagina:'donde-llevarlo.html',
    titulo:'Dónde llevar el material',
    cinta:'Dónde llevarlo',
    entrada:'Puntos donde reciben material ya revisados por el equipo.'
  },
  reportes: {
    vista:'v_reportes_publicos', orden:'creado_en.desc',
    clase:'t-reportes', pagina:'residuos.html',
    titulo:'Residuos ya señalados',
    cinta:'Residuos señalados',
    entrada:'Puntos de acumulación que alguien reportó y el equipo revisó.'
  },
  voluntarios: {
    vista:'v_voluntarios_publicos', orden:'municipio.asc',
    clase:'t-voluntarios', pagina:'quien-coordina.html',
    titulo:'Quién coordina en cada zona',
    cinta:'Quién coordina',
    entrada:'Personas y organizaciones que se ofrecieron a coordinar, y que autorizaron publicar su contacto.'
  }
};

var espera = null;
var DEPARTAMENTOS = ['Chocó','Risaralda','Valle del Cauca','Caldas','Quindío',
  'Antioquia','Cauca','Tolima','Cundinamarca','Bogotá D.C.','Nariño','Huila','Otro'];

function esc(t){
  if (t === null || t === undefined) return '';
  return String(t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* Un número colombiano escrito de cualquier manera, convertido en enlace
   de WhatsApp. Si no parece un móvil, se deja como texto y ya. */
function enlaceWhatsapp(tel){
  if (!tel) return '';
  var d = String(tel).replace(/\D/g,'');
  if (d.length === 10 && d.charAt(0) === '3') d = '57' + d;
  if (d.length < 10 || d.length > 15) return esc(tel);
  return '<a href="https://wa.me/' + d + '" target="_blank" rel="noopener">' + esc(tel) + '</a>';
}

function enlaceMapa(lat, lon, etiqueta){
  if (lat === null || lon === null || lat === undefined || lon === undefined) return '';
  return '<a href="https://www.google.com/maps?q=' + lat + ',' + lon +
         '" target="_blank" rel="noopener">' + esc(etiqueta || 'Abrir en el mapa') + '</a>';
}

function fila(et, valor){
  if (valor === null || valor === undefined || valor === '') return '';
  return '<dt>' + esc(et) + '</dt><dd>' + esc(valor) + '</dd>';
}
function filaHtml(et, html){
  if (!html) return '';
  return '<dt>' + esc(et) + '</dt><dd>' + html + '</dd>';
}

var CINTAS = {
  puntos:      { clase:'t-puntos',      texto:'Dónde llevarlo' },
  reportes:    { clase:'t-reportes',    texto:'Residuos señalados' },
  voluntarios: { clase:'t-voluntarios', texto:'Quién coordina' }
};

function fichaPunto(p){
  var verificado = p.verificacion === 'Verificado';
  return '<article class="ficha t-puntos">' +
    '<h3>' + esc(p.nombre) + '</h3>' +
    '<p class="ficha-meta">' + esc(p.municipio) + ', ' + esc(p.departamento) + '</p>' +
    '<p style="margin:.2rem 0 .5rem">' +
      '<span class="pill pill-tipo">' + esc(p.tipo) + '</span> ' +
      (verificado ? '<span class="pill pill-ok">Verificado</span>'
                  : '<span class="pill pill-warn">' + esc(p.verificacion) + '</span>') +
    '</p>' +
    '<dl>' +
      fila('Recibe', p.materiales_si) +
      fila('No recibe', p.materiales_no) +
      fila('Horario', p.horario) +
      fila('Dirección', p.direccion) +
      filaHtml('Cómo llegar', enlaceMapa(p.lat, p.lon)) +
      fila('Recoge a domicilio', p.recoge_domicilio) +
      fila('Preguntar por', p.persona_contacto) +
      filaHtml('Teléfono', enlaceWhatsapp(p.telefono)) +
      fila('Cómo debe llegar el material', p.como_llega_material) +
      fila('Última verificación', p.fecha_verificacion) +
    '</dl>' +
    '</article>';
}

function fichaReporte(r){
  return '<article class="ficha t-reportes' + (r.necesita_gestor ? ' peligro' : '') + '">' +
    '<h3>' + esc(r.municipio) + ', ' + esc(r.departamento) + '</h3>' +
    '<p class="ficha-meta">' + esc(r.referencia || 'sin punto de referencia') + '</p>' +
    '<p style="margin:.2rem 0 .5rem">' +
      '<span class="pill' + (r.necesita_gestor ? ' pill-danger' : ' pill-tipo') + '">' + esc(r.tipo_residuo) + '</span> ' +
      '<span class="pill">' + esc(r.estado) + '</span>' +
    '</p>' +
    (r.necesita_gestor
      ? '<div class="note note-danger" style="margin:.5rem 0"><h3>Esto no lo mueven voluntarios</h3>' +
        '<p style="margin:0">Requiere un gestor autorizado. No lo recoja por su cuenta.</p></div>' : '') +
    '<dl>' +
      fila('Volumen', r.volumen) +
      fila('Riesgo sanitario', r.riesgo_sanitario) +
      filaHtml('Ubicación', enlaceMapa(r.lat, r.lon)) +
      fila('Notas', r.notas) +
    '</dl>' +
    (r.foto_url ? '<img src="' + esc(r.foto_url) + '" alt="Foto del punto reportado" loading="lazy">' : '') +
    '</article>';
}

function fichaVoluntario(v){
  return '<article class="ficha t-voluntarios">' +
    '<h3>' + esc(v.nombre) + '</h3>' +
    '<p class="ficha-meta">' + esc(v.municipio) + ', ' + esc(v.departamento) + '</p>' +
    '<p style="margin:.2rem 0 .5rem">' +
      '<span class="pill pill-tipo">' + esc(v.rol) + '</span> ' +
      (v.verificacion === 'Verificado' ? '<span class="pill pill-ok">Verificado</span>' : '') +
    '</p>' +
    '<dl>' +
      fila('Organización', v.organizacion) +
      fila('Zona que cubre', v.zona) +
      fila('Disponibilidad', v.disponibilidad) +
      fila('Tiene vehículo', v.tiene_vehiculo) +
      filaHtml('WhatsApp', enlaceWhatsapp(v.whatsapp)) +
    '</dl>' +
    '</article>';
}

function cargar(){
  var caja = document.getElementById('lista');
  caja.innerHTML = '<p class="cargando">Cargando…</p>';
  var c = CATALOGO[TIPO];

  var q = '?select=*&order=' + c.orden + '&limit=300';
  var dep = document.getElementById('f-dep').value;
  if (dep) q += '&departamento=eq.' + encodeURIComponent(dep);
  var mun = document.getElementById('f-mun').value.trim();
  // `*` es el comodín de PostgREST; se quitan los del usuario para que no
  // cambien el sentido de la búsqueda.
  if (mun) q += '&municipio=ilike.*' + encodeURIComponent(mun.replace(/[*%]/g,'')) + '*';

  fetch(SUPABASE_URL + '/rest/v1/' + c.vista + q, {
    headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer ' + SUPABASE_KEY }
  }).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(filas){
    contar(filas.length);
    if (!filas.length) { caja.innerHTML = vacio(); return; }
    caja.innerHTML = filas.map(
      TIPO === 'puntos' ? fichaPunto :
      TIPO === 'reportes' ? fichaReporte : fichaVoluntario
    ).join('');
  }).catch(function(){
    /* El contador se pone a "—" y no se deja como estaba: un número viejo
       al lado de una lista que no cargó es peor que no poner nada. */
    contar(null);
    caja.innerHTML = '<div class="note note-danger"><h3>No se pudo cargar</h3>' +
      '<p style="margin:0">Puede ser la conexión. Vuelva a intentarlo con señal.</p></div>';
  });
}

function contar(n){
  var el = document.getElementById('cuenta');
  if (!el) return;
  if (n === null)    { el.textContent = 'no se pudo contar'; return; }
  if (n === 0)       { el.textContent = 'nada todavía'; return; }
  el.textContent = n === 1 ? '1 resultado' : n + ' resultados';
}

function vacio(){
  var filtrando = document.getElementById('f-dep').value ||
                  document.getElementById('f-mun').value.trim();
  if (filtrando) {
    return '<div class="vacio">No hay nada revisado todavía con estos filtros.<br>' +
      'Pruebe sin filtrar, o <a href="index.html">aporte usted el dato</a>.</div>';
  }
  if (TIPO === 'puntos') return '<div class="vacio">Todavía no hay ningún punto revisado.<br>' +
    '<a href="index.html">¿Conoce uno? Propóngalo.</a></div>';
  if (TIPO === 'reportes') return '<div class="vacio">Todavía no hay ningún reporte revisado.<br>' +
    '<a href="index.html">¿Ve residuos acumulados? Repórtelos.</a></div>';
  return '<div class="vacio">Todavía no hay ningún voluntario publicado.<br>' +
    '<a href="index.html">¿Puede coordinar en su territorio? Inscríbase.</a></div>';
}

/* Escribir el municipio no debe disparar una consulta por letra. */
document.getElementById('f-mun').addEventListener('input', function(){
  clearTimeout(espera);
  espera = setTimeout(cargar, 350);
});

(function arrancar(){
  var c = CATALOGO[TIPO];
  document.documentElement.classList.add(c.clase);

  var sel = document.getElementById('f-dep');
  DEPARTAMENTOS.forEach(function(d){
    var o = document.createElement('option');
    o.value = d; o.textContent = d; sel.appendChild(o);
  });

  // Enlaces a las otras dos pantallas, cada uno con su color.
  var otros = Object.keys(CATALOGO).filter(function(k){ return k !== TIPO; });
  document.getElementById('otros').innerHTML = otros.map(function(k){
    return '<a class="enlace-tipo ' + CATALOGO[k].clase + '" href="' + CATALOGO[k].pagina + '">' +
      '<span class="enlace-tipo-t">' + esc(CATALOGO[k].titulo) + '</span>' +
      '<span class="enlace-tipo-d">' + esc(CATALOGO[k].entrada) + '</span></a>';
  }).join('');

  cargar();
})();
