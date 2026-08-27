/* =====================================================================
   PRUEBAS DE NAVEGADOR
   Red de Residuos de la Emergencia · Reciclamores

   Abren las cuatro páginas en un Chromium de verdad, emulando un móvil,
   y comprueban que hacen lo que dicen. Las respuestas de Supabase son de
   mentira: estas pruebas NO tocan la base ni escriben un solo dato real.

   Cómo se ejecutan (es opcional; el sitio no las necesita para funcionar):

     npm install -g playwright && npx playwright install chromium
     python3 -m http.server 8099 &         # desde la raíz del repositorio
     node pruebas/navegador.mjs

   Cada línea que no diga OK es un fallo. La salida termina con el total.
   ===================================================================== */

import { chromium, devices } from 'playwright';

const RAIZ = process.env.RAIZ || 'http://127.0.0.1:8099';
let ok = 0, mal = 0;
const fallos = [];
let seccion = '';

const norm = s => s.replace(/\s+/g, ' ');
function comprobar(nombre, cierto){
  if (cierto) { ok++; console.log('  ' + String(nombre).padEnd(52, '.') + ' OK'); }
  else {
    mal++; fallos.push(seccion + ' → ' + nombre);
    console.log('  ' + String(nombre).padEnd(52, '.') + ' FALLA');
  }
}
/* Imprimir la sección por aquí en vez de con console.log suelto: así el
   resumen final puede decir en qué bloque falló cada cosa, y no hay líneas
   sueltas que se confundan con resultados. */
function bloque(nombre){ seccion = nombre; console.log('\n' + nombre); }

/* Datos de mentira con trampas dentro: etiquetas HTML en los campos de
   texto libre, para comprobar que se pintan como texto y no se ejecutan. */
const REPORTE = {
  id:'11111111-1111-1111-1111-111111111111', creado_en:'2026-08-20T14:00:00Z',
  departamento:'Chocó', municipio:'Quibdó', referencia:'Frente a la cancha',
  lat:5.6947, lon:-76.6611, precision_m:12,
  tipo_residuo:'Peligrosos (pilas, medicamentos)', volumen:'1 a 5 m³ (un camión pequeño)',
  riesgo_sanitario:'Sí', necesita_gestor:true, foto_url:null,
  notas:'<img src=x onerror="window.__xss=1">', estado:'Reportado',
  publicado:true, moderado:false, eliminado:false, revisado_por:null,
  reportes_contacto:{ quien_reporta:'Ana <b>Pérez</b>', whatsapp:'3001112233', publicar_contacto:true }
};
const PUNTO = {
  id:'1', nombre:'Asociación Renacer <script>window.__xss=1</script>',
  tipo:'Asociación de recicladores', departamento:'Chocó', municipio:'Quibdó',
  direccion:'Calle 24 # 5-12', lat:5.6947, lon:-76.6611,
  materiales_si:'Cartón, plástico PET, latas', materiales_no:'Vidrio roto',
  horario:'Lunes a viernes 7am-4pm', recoge_domicilio:'No',
  persona_contacto:'Doña Rosa', telefono:'300 111 2233',
  como_llega_material:'Separado y sin comida',
  verificacion:'Verificado', fecha_verificacion:'2026-08-22'
};
const VOLUNTARIO = {
  id:'3', organizacion:'Junta de acción comunal', departamento:'Chocó',
  municipio:'Quibdó', zona:'Barrio Niño Jesús', rol:'Líder de zona',
  disponibilidad:'Medio tiempo', tiene_vehiculo:'No', verificacion:'Verificado',
  nombre:'Ana Pérez', whatsapp:'3001112233'
};

const navegador = await chromium.launch();

/* ---------------------------------------------------------------------
   1 · La portada y los tres formularios
   --------------------------------------------------------------------- */
{
  bloque('index.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  await p.goto(RAIZ + '/index.html');
  await p.waitForSelector('#home.on', { timeout: 10000 });

  comprobar('abre la portada', await p.isVisible('#home.on'));
  comprobar('estilos.css carga',
    await p.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  comprobar('config.js define la conexión',
    await p.evaluate(() => typeof SUPABASE_URL === 'string' && SUPABASE_URL.includes('supabase.co')));
  comprobar('están las tres tarjetas', await p.locator('.card').count() === 3);

  // Sin `meta viewport` el móvil maqueta a 980 px y encoge la página entera.
  comprobar('el móvil maqueta al ancho real de la pantalla',
    await p.evaluate(() => document.documentElement.clientWidth < 500));
  comprobar('no está en modo quirks',
    await p.evaluate(() => document.compatMode) === 'CSS1Compat');

  /* Ninguna hoja de estilos de un tercero puede bloquear el pintado: con el
     servidor de tipografías inalcanzable, un <link rel=stylesheet> normal
     dejaba la pantalla en blanco 12,5 segundos. */
  comprobar('las tipografías no bloquean el pintado',
    await p.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(l => new URL(l.href, location.href).origin !== location.origin)
      .every(l => l.media === 'print' || l.media === 'all')));
  // El href lleva `?v=N` para que un despliegue no se quede detrás de la
  // caché del navegador, así que se compara el nombre y no la cadena entera.
  comprobar('los estilos propios sí se cargan de forma normal',
    await p.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
      .some(l => new URL(l.href, location.href).pathname.endsWith('/estilos.css'))));
  comprobar('la página declara que no ofrece variante oscura',
    await p.evaluate(() => {
      const m = document.querySelector('meta[name="color-scheme"]');
      return !!m && m.content.trim() === 'light';
    }));
  comprobar('los archivos propios llevan versión contra la caché',
    await p.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"],script[src]')]
      .filter(e => { const u = new URL(e.href || e.src, location.href);
                     return u.origin === location.origin; })
      .every(e => /\?v=\d+/.test(e.getAttribute('href') || e.getAttribute('src')))));

  await p.click('.card >> nth=0');
  await p.waitForSelector('#f1.on', { timeout: 5000 });
  comprobar('navega al formulario de reportes', await p.isVisible('#f1.on'));
  comprobar('los desplegables se llenan', await p.locator('#r-dep option').count() > 5);
  comprobar('el formulario enlaza el aviso de datos',
    await p.locator('#f1 a[href="datos.html"]').count() === 2);
  comprobar('la autorización va antes del botón de envío',
    norm(await p.textContent('#f1')).includes('Al enviar, autoriza el tratamiento'));

  /* La casilla "autorizo publicar mi contacto" del formulario de reportes
     prometía una publicación que la vista pública nunca hace. Se quitó, y
     estas dos comprobaciones impiden que vuelva por descuido. */
  comprobar('no queda la casilla que no hacía nada',
    await p.locator('#r-cons').count() === 0);
  comprobar('el envío de un reporte no manda publicar_contacto',
    await p.evaluate(() => !('publicar_contacto' in recoger('f1').datos)));
  comprobar('y el formulario dice que el número no se publica',
    norm(await p.textContent('#f1')).includes('no aparecen en ninguna pantalla pública'));
  comprobar('el volumen se pide en kilos, no en metros cúbicos',
    await p.evaluate(() => [...document.querySelectorAll('#r-vol option')]
      .every(o => !o.textContent.includes('m³'))) &&
    await p.evaluate(() => [...document.querySelectorAll('#r-vol option')]
      .some(o => o.textContent.includes('kg'))));

  // `.back` existe en los tres formularios; hay que decir cuál.
  await p.click('#f1 .back'); await p.waitForSelector('#home.on');
  await p.click('.card >> nth=2'); await p.waitForSelector('#f3.on');
  comprobar('la cabecera lleva el logo de Reciclamores, y carga de verdad',
    await p.evaluate(() => {
      const i = document.querySelector('.logo');
      return !!i && i.complete && i.naturalWidth > 0;
    }));
  comprobar('ya no queda la etiqueta "Prototipo"',
    !(await p.textContent('body')).includes('Prototipo'));
  comprobar('la portada habla de residuos, no de empaques',
    norm(await p.textContent('#home h1')).includes('Los residuos también'));
  comprobar('y presenta a Reciclamores ONG',
    norm(await p.textContent('#home')).includes('Desde Reciclamores ONG'));
  comprobar('ya no dice que no reemplaza a las autoridades',
    !norm(await p.textContent('#home')).includes('reemplaza a las autoridades'));

  comprobar('el tercer formulario habla de aportar información',
    norm(await p.textContent('#f3 h1, #home')).includes('Aportar información sobre un punto'));
  comprobar('pide el teléfono del reciclador', await p.locator('#d-recic').count() === 1);
  comprobar('y el de quien rellena, marcado como no público',
    await p.locator('#d-suyo').count() === 1 &&
    norm(await p.textContent('#f3')).includes('El de usted'));
  comprobar('el campo de verificación pide un Instagram',
    norm(await p.textContent('#f2 label[for="v-red"]')) === 'Instagram');
  /* La gente pega el perfil de mil maneras. Se guarda siempre igual para que
     la moderación no tenga que interpretarlo. */
  comprobar('el usuario de Instagram se guarda normalizado',
    await p.evaluate(() => instagram('https://www.instagram.com/rosalba/') === '@rosalba' &&
                           instagram('instagram.com/rosalba?hl=es') === '@rosalba' &&
                           instagram('rosalba') === '@rosalba' &&
                           instagram('  ') === ''));
  comprobar('el envío manda los dos teléfonos nuevos',
    await p.evaluate(() => {
      const d = recoger('f3').datos;
      return 'telefono_reciclador' in d && 'telefono_registra' in d;
    }));
  await p.click('#f3 .back'); await p.waitForSelector('#home.on');

  await p.waitForSelector('#home.on');
  /* Lo primero de la portada tiene que ser lo que la gente viene a hacer.
     El aviso de seguridad va después de las tarjetas, no delante. */
  comprobar('las tarjetas van antes del aviso de seguridad',
    await p.evaluate(() => {
      const cards = document.querySelector('#home .cards');
      const aviso = document.querySelector('#home .note-warn');
      return !!cards && !!aviso &&
        (cards.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }));
  comprobar('la navegación ya no está suelta al final de la portada',
    await p.locator('#home .enlaces').count() === 0);
  comprobar('las tres tarjetas tienen fondos distintos',
    await p.evaluate(() => new Set([...document.querySelectorAll('.card')]
      .map(c => getComputedStyle(c).backgroundColor)).size === 3));

  await p.click('.card >> nth=0');
  await p.waitForSelector('#f1.on');
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   1 bis · El GPS, en los dos formularios que lo piden
   Con la ubicación del navegador simulada: no se toca el GPS de nadie.
   --------------------------------------------------------------------- */
{
  bloque('ubicación de un toque');
  const ctx = await navegador.newContext({
    ...devices['Pixel 7'],
    permissions: ['geolocation'],
    geolocation: { latitude: 5.694400, longitude: -76.658100, accuracy: 12 }
  });
  const p = await ctx.newPage();
  await p.goto(RAIZ + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#home.on');

  // --- Reportar residuos ---
  await p.click('.card >> nth=0'); await p.waitForSelector('#f1.on');
  await p.click('#f1 .gps-btn');
  await p.waitForFunction(() => document.getElementById('gpsout-r').classList.contains('set'), { timeout:5000 });
  comprobar('el reporte capta la ubicación',
    await p.evaluate(() => Math.abs(recoger('f1').datos.lat - 5.6944) < 0.001));

  // --- Aportar un punto: es lo que faltaba ---
  await p.click('#f1 .back'); await p.waitForSelector('#home.on');
  await p.click('.card >> nth=2'); await p.waitForSelector('#f3.on');
  comprobar('el formulario de puntos ya pide ubicación',
    await p.locator('#f3 .gps-btn').count() === 1);
  await p.click('#f3 .gps-btn');
  await p.waitForFunction(() => document.getElementById('gpsout-d').classList.contains('set'), { timeout:5000 });
  const d = await p.evaluate(() => recoger('f3').datos);
  comprobar('y la manda al guardar',
    Math.abs(d.lat - 5.6944) < 0.001 && Math.abs(d.lon + 76.6581) < 0.001);
  comprobar('junto con la precisión, para saber cuánto fiarse', d.precision_m === 12);

  /* Cada formulario guarda la suya: antes esto era una variable suelta y
     un identificador fijo, y sólo podía servir a uno de los dos. */
  comprobar('las dos ubicaciones no se pisan',
    await p.evaluate(() => coords.r !== null && coords.d !== null && coords.r !== coords.d));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   1 ter · Sin permiso de ubicación no se pierde el envío
   --------------------------------------------------------------------- */
{
  bloque('ubicación denegada');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'], permissions: [] });
  const p = await ctx.newPage();
  await p.goto(RAIZ + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#home.on');
  await p.click('.card >> nth=2'); await p.waitForSelector('#f3.on');
  await p.click('#f3 .gps-btn');
  await p.waitForTimeout(1500);
  comprobar('lo explica en vez de quedarse callado',
    /No se pudo obtener|permite ubicación|Buscando/.test(await p.textContent('#gpsout-d')));
  comprobar('y el formulario se puede enviar igual, sin coordenadas',
    await p.evaluate(() => recoger('f3').datos.lat === null));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   2 · La pantalla de moderación
   --------------------------------------------------------------------- */
{
  bloque('moderar.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  /* Si alguna de estas acciones abriera un diálogo del navegador, esta
     prueba lo cazaría: Playwright los descarta por defecto y el flujo se
     quedaría a medias, igual que le pasa a quien marcó "no volver a
     preguntar" en Firefox. */
  let dialogosNativos = 0;
  p.on('dialog', d => { dialogosNativos++; d.dismiss(); });

  await ctx.addInitScript(([reporte]) => {
    localStorage.setItem('redresiduos.sesion', JSON.stringify({
      access_token: 'x.' + btoa(JSON.stringify({ email:'mod@ejemplo.org' })) + '.y',
      refresh_token: 'r', expira: Date.now() + 3600e3, correo: 'mod@ejemplo.org'
    }));
    window.__escrituras = [];
    window.__consultas = [];
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      u = String(u); window.__consultas.push(u);
      if (u.includes('rpc/es_moderador')) return Promise.resolve(new Response('true', { status:200 }));
      if (u.includes('/rest/v1/ajustes')) {
        if (o.method === 'PATCH') {
          window.__escrituras.push({ url:u, metodo:'PATCH', body:o.body });
          return Promise.resolve(new Response(JSON.stringify([{clave:'autopublicar', valor:JSON.parse(o.body).valor, cambiado_por:'mod@ejemplo.org'}]), { status:200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([{clave:'autopublicar', valor:true, cambiado_por:null}]), { status:200 }));
      }
      if (o.method === 'PATCH' || o.method === 'DELETE') {
        window.__escrituras.push({ url:u, metodo:o.method, body:o.body });
        return Promise.resolve(new Response(null, { status:204 }));
      }
      // La consulta de contar: sólo devuelve la cabecera con el total.
      if (u.includes('limit=0')) {
        const n = u.includes('/reportes?') ? '7' : u.includes('/voluntarios?') ? '3' : '5';
        return Promise.resolve(new Response('[]', { status:200,
          headers:{ 'content-range': '*/' + n } }));
      }
      if (u.includes('/rest/v1/reportes?')) return Promise.resolve(new Response(JSON.stringify([reporte]), { status:200 }));
      if (u.includes('/rest/v1/')) return Promise.resolve(new Response('[]', { status:200 }));
      return real(u, o);
    };
  }, [REPORTE]);

  await p.goto(RAIZ + '/moderar.html', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#panel.on', { timeout: 10000 });
  await p.waitForSelector('.ficha', { timeout: 5000 });

  comprobar('entra al panel con sesión válida', await p.isVisible('#panel.on'));

  // --- Los contadores, que era el problema ---
  await p.waitForTimeout(600);
  comprobar('cuenta las tres pestañas, no sólo la abierta',
    (await p.textContent('#n-reportes')) === '7' &&
    (await p.textContent('#n-voluntarios')) === '3' &&
    (await p.textContent('#n-puntos')) === '5');
  comprobar('y dice cuántas fichas hay en la lista',
    (await p.textContent('#cuenta')) === '1 ficha');

  // --- La ficha empieza plegada ---
  comprobar('la ficha ocupa una línea hasta que se abre',
    await p.evaluate(() => !document.querySelector('#lista details.ficha').open));
  comprobar('el resumen dice lo justo para decidir si abrirla',
    (await p.textContent('#lista summary')).includes('Quibdó') &&
    (await p.textContent('#lista summary')).includes('No moderado y publicado'));
  comprobar('los botones no se pueden pulsar con la ficha cerrada',
    !(await p.locator('#lista button:has-text("Modificar")').isVisible()));

  await p.click('#lista summary');
  await p.waitForTimeout(300);
  comprobar('al abrirla se ve todo', (await p.textContent('#lista')).includes('3001112233'));
  comprobar('avisa de residuo peligroso', (await p.textContent('#lista')).includes('No lo mueven voluntarios'));
  comprobar('NO ejecuta el HTML que venga en un reporte',
    !(await p.evaluate(() => window.__xss === 1)) &&
    await p.locator('#lista img[src="x"]').count() === 0);

  // --- Filtros de estado, uno a uno ---
  await p.uncheck('#e1'); await p.uncheck('#e4'); await p.check('#e3');
  await p.waitForTimeout(500);
  let cons = await p.evaluate(() => window.__consultas);
  const conFiltro = cons.filter(u => u.includes('/reportes?') && !u.includes('limit=0')).pop();
  comprobar('se puede pedir un solo estado',
    conFiltro.includes('or=(and(eliminado.is.true))'));
  await p.check('#e1'); await p.waitForTimeout(500);
  cons = await p.evaluate(() => window.__consultas);
  const dos = cons.filter(u => u.includes('/reportes?') && !u.includes('limit=0')).pop();
  comprobar('y dos a la vez, sin arrastrar los otros',
    dos.includes('eliminado.is.true') && dos.includes('publicado.is.true,moderado.is.false') &&
    !dos.includes('publicado.is.false'));
  await p.uncheck('#e1'); await p.uncheck('#e3'); await p.waitForTimeout(400);
  comprobar('sin ningún estado marcado lo dice en vez de enseñar todo',
    (await p.textContent('#lista')).includes('Marque al menos un estado'));
  await p.check('#e1'); await p.check('#e4'); await p.waitForTimeout(600);

  // --- Publicar / eliminar / borrar, con la confirmación dentro de la página ---
  await p.click('#lista summary'); await p.waitForTimeout(300);

  await p.click('#lista button:has-text("Quitar de lo público")');
  await p.waitForSelector('.dialogo', { timeout:3000 });
  comprobar('la confirmación se dibuja en la página, no la abre el navegador',
    await p.isVisible('.dialogo'));
  comprobar('el foco arranca en Cancelar, no en el botón grave',
    await p.evaluate(() => document.activeElement.hasAttribute('data-no')));
  await p.click('.dialogo [data-no]');
  await p.waitForTimeout(300);
  comprobar('cancelar no escribe nada',
    (await p.evaluate(() => window.__escrituras)).filter(e => e.url.includes('/reportes?')).length === 0);

  await p.click('#lista button:has-text("Quitar de lo público")');
  await p.waitForSelector('.dialogo');
  await p.click('.dialogo [data-si]');
  await p.waitForTimeout(500);
  let esc2 = await p.evaluate(() => window.__escrituras);
  comprobar('confirmar sí escribe, y sólo esa columna',
    esc2.filter(e => e.url.includes('/reportes?id=eq.') && e.body === '{"publicado":false}').length === 1);

  await p.click('#lista summary'); await p.waitForTimeout(300);
  await p.click('#lista button:has-text("Eliminar")');
  await p.waitForSelector('.dialogo');
  await p.click('.dialogo [data-si]');
  await p.waitForTimeout(500);
  esc2 = await p.evaluate(() => window.__escrituras);
  const ret = esc2.filter(e => e.body && e.body.includes('"eliminado":true'));
  comprobar('"Eliminar" retira y despublica, sin borrar la fila',
    ret.length === 1 && JSON.parse(ret[0].body).publicado === false);

  await p.click('#lista summary'); await p.waitForTimeout(300);
  await p.click('#lista button:has-text("Borrar definitivamente")');
  await p.waitForSelector('.dialogo');
  comprobar('el borrado ofrece la alternativa reversible',
    (await p.textContent('.dialogo')).includes('Eliminar'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  comprobar('Escape cierra sin borrar',
    !(await p.locator('.dialogo').count()) &&
    !(await p.evaluate(() => window.__escrituras)).some(e => e.metodo === 'DELETE'));

  await p.click('#lista button:has-text("Borrar definitivamente")');
  await p.waitForSelector('.dialogo');
  await p.click('.dialogo [data-si]');
  await p.waitForTimeout(500);
  comprobar('y confirmando sí manda el DELETE',
    (await p.evaluate(() => window.__escrituras)).some(e => e.metodo === 'DELETE' && e.url.includes('/reportes?id=eq.')));

  // --- Modificar ---
  await p.click('#lista summary'); await p.waitForTimeout(300);
  await p.click('#lista button:has-text("Modificar")');
  await p.waitForSelector('#e-municipio', { timeout: 3000 });
  comprobar('el formulario de edición trae el contenido cargado',
    await p.inputValue('#e-municipio') === 'Quibdó');
  comprobar('y también los datos de contacto',
    await p.inputValue('#h-whatsapp') === '3001112233');
  await p.fill('#e-municipio', 'Istmina');
  await p.fill('#h-whatsapp', '3007654321');
  await p.click('#lista button:has-text("Guardar cambios")');
  await p.waitForTimeout(700);
  esc2 = await p.evaluate(() => window.__escrituras);
  const guardado = esc2.filter(e => e.metodo === 'PATCH' && e.url.includes('/reportes?id=eq.')).pop();
  const guardadoC = esc2.filter(e => e.url.includes('reportes_contacto?')).pop();
  comprobar('guarda el municipio corregido',
    guardado && JSON.parse(guardado.body).municipio === 'Istmina');
  comprobar('guarda el teléfono corregido',
    guardadoC && JSON.parse(guardadoC.body).whatsapp === '3007654321');
  comprobar('NO intenta escribir las columnas de auditoría',
    guardado && !('moderado' in JSON.parse(guardado.body)) &&
                !('revisado_por' in JSON.parse(guardado.body)));

  comprobar('el volumen se ofrece en kilos, no en metros cúbicos',
    await p.evaluate(() => VOLUMENES.every(v => !v.includes('m³'))) &&
    await p.evaluate(() => VOLUMENES.some(v => v.includes('kg'))));

  comprobar('en ningún momento se abrió un diálogo del navegador', dialogosNativos === 0);
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   3 · Sin sesión no se entra
   --------------------------------------------------------------------- */
{
  bloque('moderar.html · sin sesión');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  await p.goto(RAIZ + '/moderar.html');
  await p.waitForSelector('#acceso.on', { timeout: 10000 });
  comprobar('sin sesión pide el correo', await p.isVisible('#acceso.on'));
  comprobar('no se ve nada de la bandeja', !(await p.isVisible('#panel.on')));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   3 bis · Pedir el enlace de acceso
   Se simula la respuesta de Supabase: no se manda ningún correo de verdad,
   entre otras cosas porque el envío está limitado por hora y gastarlo aquí
   dejaría a un moderador real sin poder entrar.
   --------------------------------------------------------------------- */
{
  bloque('moderar.html · pedir el enlace');

  async function pedir(respuesta){
    const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
    const p = await ctx.newPage();
    await ctx.addInitScript(([r]) => {
      window.__cuerpos = [];
      const real = window.fetch;
      window.fetch = (u, o = {}) => {
        u = String(u);
        if (u.includes('/auth/v1/otp')) {
          window.__cuerpos.push(o.body);
          return Promise.resolve(new Response(r.cuerpo, { status: r.estado }));
        }
        return real(u, o);
      };
    }, [respuesta]);
    await p.goto(RAIZ + '/moderar.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#acceso.on', { timeout: 10000 });
    await p.fill('#correo', 'mod@ejemplo.org');
    await p.click('#btn-enlace');
    await p.waitForSelector('#aviso-acceso .note', { timeout: 5000 });
    const texto = norm(await p.textContent('#aviso-acceso'));
    const cuerpos = await p.evaluate(() => window.__cuerpos);
    await ctx.close();
    return { texto, cuerpos };
  }

  const bien = await pedir({ estado: 200, cuerpo: '{}' });
  // El fallo que dejó a todo el mundo fuera: create_user:false impedía la
  // primera entrada de cualquier moderador, porque `moderadores` no crea
  // el usuario de `auth.users`.
  comprobar('pide a Supabase que cree el usuario si no existe',
    bien.cuerpos[0] && JSON.parse(bien.cuerpos[0]).create_user === true);
  comprobar('confirma el envío', bien.texto.includes('Enlace enviado'));
  comprobar('avisa de que entrar no es lo mismo que ver',
    bien.texto.includes('podrá entrar pero no verá nada'));

  const limite = await pedir({ estado: 429, cuerpo: '{"error_code":"over_email_send_rate_limit"}' });
  comprobar('distingue el límite de envíos', limite.texto.includes('Demasiados intentos seguidos'));

  const apagado = await pedir({ estado: 422, cuerpo: '{"error_code":"otp_disabled","msg":"Signups not allowed for otp"}' });
  comprobar('señala el proveedor de correo apagado',
    apagado.texto.includes('Authentication → Providers → Email'));

  const redir = await pedir({ estado: 400, cuerpo: '{"error_code":"validation_failed","msg":"Invalid redirect URL"}' });
  comprobar('señala la redirección no permitida',
    redir.texto.includes('Authentication → URL Configuration'));

  const raro = await pedir({ estado: 500, cuerpo: 'algo inesperado del servidor' });
  comprobar('un fallo desconocido se muestra tal cual, sin tragárselo',
    raro.texto.includes('algo inesperado del servidor'));
}

/* ---------------------------------------------------------------------
   4 · El directorio: una página por tipo
   Antes eran tres pestañas en una página y los contadores de las pestañas
   no visitadas se quedaban en blanco, porque sólo se cargaba la activa.
   Con una página por tipo ese problema no puede volver: hay un contador y
   se calcula al cargar.
   --------------------------------------------------------------------- */
{
  bloque('directorio · una página por tipo');

  async function abrir(pagina, datos){
    const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
    const p = await ctx.newPage();
    await ctx.addInitScript(([d]) => {
      window.__urls = [];
      const real = window.fetch;
      window.fetch = (u, o) => {
        u = String(u); window.__urls.push(u);
        if (u.includes('/rest/v1/v_')) {
          if (d === null) return Promise.resolve(new Response('boom', { status:500 }));
          return Promise.resolve(new Response(JSON.stringify(d), { status:200 }));
        }
        return real(u, o);
      };
    }, [datos]);
    await p.goto(RAIZ + '/' + pagina, { waitUntil:'domcontentloaded' });
    await p.waitForSelector('#lista .ficha, #lista .vacio, #lista .note-danger', { timeout:10000 });
    return { ctx, p };
  }

  // --- Dónde llevar el material ---
  let { ctx, p } = await abrir('donde-llevarlo.html', [PUNTO]);
  comprobar('donde-llevarlo pinta el punto', (await p.textContent('#lista')).includes('Asociación Renacer'));
  comprobar('y sólo consulta la vista de puntos',
    (await p.evaluate(() => window.__urls)).filter(u => u.includes('/rest/v1/v_'))
      .every(u => u.includes('v_puntos_publicos')));
  comprobar('el contador dice cuántos hay', (await p.textContent('#cuenta')) === '1 resultado');
  comprobar('la pantalla explica de qué va', (await p.textContent('.lede')).includes('reportada por la comunidad'));
  comprobar('ya no está el aviso "Antes de nada"',
    !(await p.textContent('body')).includes('Antes de nada'));
  comprobar('NO ejecuta el HTML que venga en un nombre',
    !(await p.evaluate(() => window.__xss === 1)) && await p.locator('#lista script').count() === 0);
  comprobar('el teléfono queda como enlace de WhatsApp',
    await p.getAttribute('#lista a[href*="wa.me"]', 'href') === 'https://wa.me/573001112233');
  comprobar('la navegación no se repite al final de la página',
    await p.locator('#otros').count() === 0);
  await p.selectOption('#f-dep', 'Chocó'); await p.waitForTimeout(400);
  comprobar('el departamento llega a la consulta',
    (await p.evaluate(() => window.__urls)).pop().includes('departamento=eq.Choc'));
  await p.fill('#f-mun', 'Quib'); await p.waitForTimeout(700);
  const antes = (await p.evaluate(() => window.__urls)).length;
  await p.fill('#f-mun', 'Quibdo'); await p.waitForTimeout(700);
  comprobar('no consulta una vez por cada letra',
    (await p.evaluate(() => window.__urls)).length - antes === 1);
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await ctx.close();

  // --- Residuos señalados ---
  ({ ctx, p } = await abrir('residuos.html', [{ ...REPORTE, reportes_contacto: undefined }]));
  comprobar('residuos avisa de que un RAEE no lo mueven voluntarios',
    (await p.textContent('#lista')).includes('Esto no lo mueven voluntarios'));
  comprobar('y sólo consulta la vista de reportes',
    (await p.evaluate(() => window.__urls)).filter(u => u.includes('/rest/v1/v_'))
      .every(u => u.includes('v_reportes_publicos')));
  comprobar('no enseña el contacto de quien reportó',
    !(await p.textContent('#lista')).includes('3001112233'));
  await ctx.close();

  // --- Quién coordina ---
  ({ ctx, p } = await abrir('quien-coordina.html', [VOLUNTARIO]));
  comprobar('quien-coordina lista a quien coordina',
    (await p.textContent('#lista')).includes('Líder de zona'));
  comprobar('y sólo consulta la vista de voluntarios',
    (await p.evaluate(() => window.__urls)).filter(u => u.includes('/rest/v1/v_'))
      .every(u => u.includes('v_voluntarios_publicos')));
  await ctx.close();

  // --- Sin datos y con la consulta caída: el contador nunca miente ---
  ({ ctx, p } = await abrir('donde-llevarlo.html', []));
  comprobar('sin resultados el contador lo dice', (await p.textContent('#cuenta')) === 'nada todavía');
  comprobar('y ofrece aportar el dato',
    (await p.textContent('#lista')).includes('Propóngalo'));
  await ctx.close();

  ({ ctx, p } = await abrir('donde-llevarlo.html', null));
  comprobar('si la consulta falla el contador no deja un número viejo',
    (await p.textContent('#cuenta')) === 'no se pudo contar');
  comprobar('y se avisa del fallo', (await p.textContent('#lista')).includes('No se pudo cargar'));
  await ctx.close();

  // --- El enlace viejo no acaba en 404 ---
  ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  p = await ctx.newPage();
  await p.goto(RAIZ + '/directorio.html', { waitUntil:'domcontentloaded' });
  await p.waitForURL(/donde-llevarlo\.html/, { timeout:5000 }).catch(() => {});
  comprobar('el enlace viejo del directorio redirige', p.url().includes('donde-llevarlo.html'));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   5 · El aviso de tratamiento de datos
   --------------------------------------------------------------------- */
{
  bloque('datos.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  await p.goto(RAIZ + '/datos.html');
  await p.waitForSelector('.prosa', { timeout: 10000 });
  const prosa = norm(await p.textContent('.prosa'));

  comprobar('el índice enlaza nueve secciones', await p.locator('.indice a').count() === 9);
  comprobar('ningún enlace del índice va a la nada',
    await p.evaluate(() => [...document.querySelectorAll('.indice a')]
      .every(a => document.querySelector(a.getAttribute('href')))));
  comprobar('declara la transferencia fuera de Colombia', prosa.includes('Estados Unidos'));
  comprobar('da los plazos legales de respuesta',
    prosa.includes('diez días hábiles') && prosa.includes('quince días hábiles'));
  comprobar('nombra a la autoridad de control',
    prosa.includes('Superintendencia de Industria y Comercio'));
  comprobar('dice qué NO se recoge', prosa.includes('No se piden datos sensibles'));
  comprobar('identifica al responsable', prosa.includes('Reciclamores') && prosa.includes('901.940.748-1'));
  comprobar('ofrece los dos canales de contacto',
    await p.locator('#correo-datos').count() === 1 &&
    await p.locator('.prosa a[href*="api.whatsapp.com"]').count() === 1);
  // El detector tiene que distinguir "falta el dato" de "el dato no sirve".
  comprobar('no dice que falten datos, porque ya están',
    !(await p.textContent('#incompleto')).includes('todavía no está completo'));
  comprobar('el correo de contacto es un dominio real',
    (await p.textContent('#correo-datos')).includes('@reciclamores.org'));
  // El detector de dominios locales sigue ahí; lo que se comprueba es que
  // con un dominio real no salta. Que sí salte se comprueba abajo.
  comprobar('no queda ningún aviso rojo pendiente',
    (await p.textContent('#incompleto')).trim() === '');
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);

  /* El detector de correos inservibles no debe quedarse muerto por el hecho
     de que hoy el dato sea correcto: se le vuelve a poner un dominio local
     en caliente y tiene que saltar. */
  const salta = await p.evaluate(() => {
    document.getElementById('correo-datos').textContent = 'contacto@ejemplo.local';
    document.getElementById('incompleto').innerHTML = '';
    const s = document.createElement('script');
    s.textContent = document.querySelector('body > script').textContent;
    document.body.appendChild(s);
    return document.getElementById('incompleto').textContent.includes('no recibe desde internet');
  });
  comprobar('el detector de dominios locales sigue vivo', salta);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   5 bis · El menú de secciones
   Va escrito en cada página en lugar de pintarlo JavaScript: la navegación
   es lo último que debe depender de que un script cargue. El precio es
   tener cuatro copias, y lo que impide que se desincronicen es esto.
   --------------------------------------------------------------------- */
{
  bloque('menú de secciones');

  const ESPERADO = ['index.html','donde-llevarlo.html','residuos.html','quien-coordina.html'];
  const ETIQUETAS = ['Inicio','Dónde llevarlo','Puntos críticos','Voluntarios inscritos'];
  const PAGINAS = {
    'index.html':'index.html',
    'donde-llevarlo.html':'donde-llevarlo.html',
    'residuos.html':'residuos.html',
    'quien-coordina.html':'quien-coordina.html',
    'datos.html':null,
    'moderar.html':null
  };

  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const desajustes = [], marcasMal = [];

  for (const [pagina, actual] of Object.entries(PAGINAS)) {
    await p.goto(RAIZ + '/' + pagina, { waitUntil:'domcontentloaded' });
    const m = await p.evaluate(() => {
      const nav = document.querySelector('nav.menu');
      if (!nav) return null;
      const a = [...nav.querySelectorAll('a')];
      return { hrefs: a.map(x => x.getAttribute('href')),
               textos: a.map(x => x.textContent.trim()),
               actuales: a.filter(x => x.getAttribute('aria-current') === 'page')
                          .map(x => x.getAttribute('href')) };
    });
    if (!m || ESPERADO.join() !== m.hrefs.join() || ETIQUETAS.join() !== m.textos.join()) desajustes.push(pagina);
    else if (actual ? (m.actuales.length !== 1 || m.actuales[0] !== actual)
                    : m.actuales.length !== 0) marcasMal.push(pagina);
  }

  comprobar('las seis páginas llevan el mismo menú, en el mismo orden',
    desajustes.length === 0);
  if (desajustes.length) console.log('     desajustadas: ' + desajustes.join(', '));
  comprobar('cada una se marca a sí misma, y sólo a sí misma',
    marcasMal.length === 0);
  if (marcasMal.length) console.log('     mal marcadas: ' + marcasMal.join(', '));

  // Los colores de tipo tienen que llegar hasta el menú.
  await p.goto(RAIZ + '/donde-llevarlo.html', { waitUntil:'domcontentloaded' });
  comprobar('el enlace de la página actual va resaltado en su color',
    await p.evaluate(() => {
      const a = document.querySelector('.menu-i[aria-current="page"]');
      const otro = document.querySelector('.menu-i:not([aria-current])');
      const f = e => getComputedStyle(e).backgroundColor;
      return f(a) !== f(otro);
    }));
  comprobar('el menú no desborda la página aunque no quepa',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('y se puede llegar a los cuatro con el teclado',
    await p.evaluate(() => [...document.querySelectorAll('.menu-i')]
      .every(a => a.tabIndex >= 0)));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   6 · Paleta: los tres bloques y el contraste
   El modo oscuro llegó a estar ilegible porque el bloque de la media query
   olvidaba `--ink` e `--ink-2`: texto casi negro sobre fondo casi negro,
   1,06:1. Estas dos pruebas existen por eso.
   --------------------------------------------------------------------- */
{
  bloque('estilos.css · paleta');

  const css = await (await fetch(RAIZ + '/estilos.css')).text();
  const tokens = (bloque) => {
    const i = css.indexOf(bloque);
    if (i < 0) return null;
    const cuerpo = css.slice(i, css.indexOf('}', i));
    return new Set((cuerpo.match(/--[a-z0-9-]+(?=\s*:)/g) || []));
  };
  const claro = tokens(':root{');

  /* No hay modo oscuro y es deliberado. Esta prueba no lo prohíbe: exige
     que, si alguien lo añade, defina TODOS los tokens. La versión anterior
     tenía uno que olvidaba `--ink` e `--ink-2`, y el texto quedaba casi
     invisible en cualquier teléfono puesto en oscuro. */
  const bloquesOscuros = [':root:not([data-theme="light"]){', ':root[data-theme="dark"]{']
    .map(tokens).filter(Boolean);
  comprobar('no hay un modo oscuro a medias',
    bloquesOscuros.every(b => claro && b.size === claro.size && [...claro].every(t => b.has(t))));
  if (bloquesOscuros.length === 0) console.log('     (no hay modo oscuro: una sola paleta, de día)');

  comprobar('la hoja de estilos declara que es una paleta clara',
    /color-scheme\s*:\s*light\s*;/.test(css));

  /* Lo que motivó todo esto: con el teléfono en modo oscuro, el sitio
     parecía otra cosa. Ahora tiene que salir claro igualmente. */
  for (const tema of ['light','dark']) {
    const ctx = await navegador.newContext({ ...devices['Pixel 7'], colorScheme: tema });
    const p = await ctx.newPage();
    await p.goto(RAIZ + '/index.html', { waitUntil:'domcontentloaded' });
    await p.waitForSelector('#home.on');
    const claras = await p.evaluate(() => {
      const lum = s => { const [r,g,b] = (s.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number);
        return (0.2126*r + 0.7152*g + 0.0722*b) / 255; };
      return { papel: lum(getComputedStyle(document.body).backgroundColor),
               cabecera: lum(getComputedStyle(document.querySelector('.top')).backgroundColor) };
    });
    comprobar('con el dispositivo en ' + tema + ' el fondo sigue siendo claro',
      claras.papel > 0.85);
    comprobar('y la cabecera también',  claras.cabecera > 0.85);
    await ctx.close();
  }

  /* Contraste real, sobre las páginas ya pintadas, en los dos modos.
     El mínimo es el de la norma: 4,5:1, y 3:1 en los titulares grandes. */
  const MEDIR = `(() => {
    const lum = c => { const [r,g,b]=c.map(v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);});
      return 0.2126*r+0.7152*g+0.0722*b; };
    const rgb = s => (s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
    const fondoDe = el => { let e=el; while(e){ const c=getComputedStyle(e).backgroundColor;
      if(c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return rgb(c); e=e.parentElement; }
      return rgb(getComputedStyle(document.body).backgroundColor); };
    const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
    const fallos=[];
    document.querySelectorAll('*').forEach(el => {
      if (el.offsetParent === null && el.tagName !== 'BODY') return;
      const cs = getComputedStyle(el);
      if (![...el.childNodes].some(nd => nd.nodeType===3 && nd.textContent.trim())) return;
      const c = ratio(rgb(cs.color), fondoDe(el)), px = parseFloat(cs.fontSize);
      const min = (px>=24 || (px>=18.66 && parseInt(cs.fontWeight)>=700)) ? 3 : 4.5;
      if (c < min) fallos.push(c.toFixed(2)+':1 en .'+(el.className||el.tagName).toString().split(' ')[0]);
    });
    return fallos;
  })()`;

  for (const tema of ['light','dark']) {
    const ctx = await navegador.newContext({ ...devices['Pixel 7'], colorScheme: tema });
    const p = await ctx.newPage();
    const fallos = [];
    for (const pag of ['index.html','directorio.html','datos.html','moderar.html']) {
      await p.goto(RAIZ + '/' + pag, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(350);
      fallos.push(...(await p.evaluate(MEDIR)).map(f => pag + ': ' + f));
    }
    comprobar('todo el texto es legible en modo ' + (tema === 'light' ? 'claro' : 'oscuro'),
      fallos.length === 0);
    if (fallos.length) fallos.slice(0,6).forEach(f => console.log('     ' + f));
    await ctx.close();
  }
}

await navegador.close();
console.log('\n' + ok + ' bien, ' + mal + ' mal.');
if (fallos.length) {
  console.log('\nLo que falló:');
  fallos.forEach(f => console.log('  · ' + f));
}
process.exit(mal ? 1 : 0);
