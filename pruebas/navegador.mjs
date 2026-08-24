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

  await p.click('.back');
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
  comprobar('la portada enlaza las tres pantallas del directorio',
    await p.locator('#home .enlaces a[href="donde-llevarlo.html"]').count() === 1 &&
    await p.locator('#home .enlaces a[href="residuos.html"]').count() === 1 &&
    await p.locator('#home .enlaces a[href="quien-coordina.html"]').count() === 1);
  comprobar('y cada enlace lleva un color distinto',
    await p.evaluate(() => new Set([...document.querySelectorAll('#home .enlace-tipo')]
      .map(a => getComputedStyle(a).backgroundColor)).size === 3));
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
   2 · La pantalla de moderación
   --------------------------------------------------------------------- */
{
  bloque('moderar.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  /* Un solo manejador de diálogos para todo el bloque. Con varios `once`
     conviven manejadores que no llegaron a dispararse (apagar el interruptor
     no pide confirmación) y el siguiente confirm lo atienden dos a la vez. */
  let dialogos = 0;
  p.on('dialog', d => { dialogos++; d.accept(); });

  await ctx.addInitScript(([reporte]) => {
    localStorage.setItem('redresiduos.sesion', JSON.stringify({
      access_token: 'x.' + btoa(JSON.stringify({ email:'mod@ejemplo.org' })) + '.y',
      refresh_token: 'r', expira: Date.now() + 3600e3, correo: 'mod@ejemplo.org'
    }));
    window.__escrituras = [];
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      u = String(u);
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
      if (u.includes('/rest/v1/reportes?')) return Promise.resolve(new Response(JSON.stringify([reporte]), { status:200 }));
      if (u.includes('/rest/v1/')) return Promise.resolve(new Response('[]', { status:200 }));
      return real(u, o);
    };
  }, [REPORTE]);

  await p.goto(RAIZ + '/moderar.html', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#panel.on', { timeout: 10000 });
  await p.waitForSelector('.ficha', { timeout: 5000 });

  comprobar('entra al panel con sesión válida', await p.isVisible('#panel.on'));
  comprobar('muestra el correo de quien entró', await p.textContent('#quien') === 'mod@ejemplo.org');

  const txt = await p.textContent('#lista');
  comprobar('pinta la ficha del reporte', txt.includes('Quibdó'));
  comprobar('el moderador sí ve el teléfono', txt.includes('3001112233'));
  comprobar('avisa de residuo peligroso', txt.includes('No lo mueven voluntarios'));

  // Publicado sin que nadie lo mirara: el estado 1, que es el que urge.
  comprobar('nombra el estado 1 (publicado sin moderar)',
    txt.includes('1 · No moderado y publicado'));
  comprobar('la ficha lleva el color de su tipo',
    await p.locator('.ficha.t-reportes').count() === 1);

  comprobar('NO ejecuta el HTML que venga en un reporte',
    !(await p.evaluate(() => window.__xss === 1)) &&
    await p.locator('#lista img[src="x"]').count() === 0);
  comprobar('el texto peligroso se ve como texto', txt.includes('onerror'));

  // El interruptor de publicación automática
  const auto = await p.textContent('#caja-auto');
  comprobar('avisa de que la publicación automática está encendida',
    auto.includes('encendida') && auto.includes('sin que nadie lo mire'));
  await p.click('#caja-auto button');
  await p.waitForTimeout(400);
  let esc = await p.evaluate(() => window.__escrituras);
  comprobar('apagarla escribe en los ajustes',
    esc.some(e => e.url.includes('ajustes') && e.body === '{"valor":false}'));

  // Publicar / despublicar. Quitar de lo público pide confirmación, y sin
  // aceptarla el navegador la descarta y no se escribe nada: por eso va aquí
  // el manejador antes del clic.
  // Acotado a #lista: el botón del interruptor pasa a decir "Encenderla:
  // publicar todo al momento" y un selector suelto lo caza a él.
  await p.click('#lista button:has-text("Publicar"), #lista button:has-text("Quitar de lo público")');
  await p.waitForTimeout(400);
  esc = await p.evaluate(() => window.__escrituras);
  const pub = esc.filter(e => e.url.includes('reportes?id=eq.'));
  comprobar('el botón de publicar escribe sólo esa columna',
    pub.length === 1 && /^\{"publicado":(true|false)\}$/.test(pub[0].body));

  // Eliminar (retirar): deja la fila para poder deshacerlo
  await p.click('#lista button:has-text("Eliminar")');
  await p.waitForTimeout(400);
  esc = await p.evaluate(() => window.__escrituras);
  const ret = esc.filter(e => e.body && e.body.includes('"eliminado":true'));
  comprobar('"Eliminar" retira y despublica, sin borrar la fila',
    ret.length === 1 && JSON.parse(ret[0].body).publicado === false);

  // Borrado definitivo: dos confirmaciones y un DELETE
  const antesDeBorrar = dialogos;
  await p.click('#lista button:has-text("Borrar definitivamente")');
  await p.waitForTimeout(500);
  esc = await p.evaluate(() => window.__escrituras);
  comprobar('el borrado definitivo pide confirmar dos veces',
    dialogos - antesDeBorrar === 2);
  comprobar('y manda un DELETE de verdad',
    esc.some(e => e.metodo === 'DELETE' && e.url.includes('reportes?id=eq.')));

  // Modificar
  await p.click('#lista button:has-text("Modificar")');
  await p.waitForSelector('#e-municipio', { timeout: 3000 });
  comprobar('el formulario de edición trae el contenido cargado',
    await p.inputValue('#e-municipio') === 'Quibdó');
  comprobar('y también los datos de contacto',
    await p.inputValue('#h-whatsapp') === '3001112233');
  comprobar('avisa de que la edición queda registrada',
    (await p.textContent('.ficha')).includes('queda marcada como moderada'));

  await p.fill('#e-municipio', 'Istmina');
  await p.fill('#h-whatsapp', '3007654321');
  await p.click('#lista button:has-text("Guardar cambios")');
  await p.waitForTimeout(600);
  esc = await p.evaluate(() => window.__escrituras);
  const guardado = esc.filter(e => e.metodo === 'PATCH' && e.url.includes('/reportes?id=eq.')).pop();
  const guardadoC = esc.filter(e => e.url.includes('reportes_contacto?')).pop();
  comprobar('guarda el municipio corregido',
    guardado && JSON.parse(guardado.body).municipio === 'Istmina');
  comprobar('guarda el teléfono corregido',
    guardadoC && JSON.parse(guardadoC.body).whatsapp === '3007654321');
  comprobar('NO intenta escribir las columnas de auditoría',
    guardado && !('moderado' in JSON.parse(guardado.body)) &&
                !('revisado_por' in JSON.parse(guardado.body)));

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
  comprobar('NO ejecuta el HTML que venga en un nombre',
    !(await p.evaluate(() => window.__xss === 1)) && await p.locator('#lista script').count() === 0);
  comprobar('el teléfono queda como enlace de WhatsApp',
    await p.getAttribute('#lista a[href*="wa.me"]', 'href') === 'https://wa.me/573001112233');
  comprobar('enlaza a las otras dos pantallas',
    await p.locator('#otros a[href="residuos.html"]').count() === 1 &&
    await p.locator('#otros a[href="quien-coordina.html"]').count() === 1);
  comprobar('y no se enlaza a sí misma', await p.locator('#otros a[href="donde-llevarlo.html"]').count() === 0);
  comprobar('cada enlace lleva el color de su tipo',
    await p.evaluate(() => new Set([...document.querySelectorAll('#otros .enlace-tipo')]
      .map(a => getComputedStyle(a).backgroundColor)).size === 2));
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
  const claro  = tokens(':root{');
  const oscuro = tokens(':root:not([data-theme="light"]){');
  const manual = tokens(':root[data-theme="dark"]{');

  const iguales = (a, b) => a && b && a.size === b.size && [...a].every(t => b.has(t));
  comprobar('el modo oscuro define los mismos tokens que el claro', iguales(claro, oscuro));
  comprobar('el modo oscuro manual define los mismos que el automático', iguales(oscuro, manual));
  if (claro && oscuro) {
    const faltan = [...claro].filter(t => !oscuro.has(t));
    if (faltan.length) console.log('     faltan en el modo oscuro: ' + faltan.join(', '));
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
