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

const norm = s => s.replace(/\s+/g, ' ');
function comprobar(nombre, cierto){
  if (cierto) { ok++; console.log('  ' + String(nombre).padEnd(52, '.') + ' OK'); }
  else { mal++; console.log('  ' + String(nombre).padEnd(52, '.') + ' FALLA'); }
}

/* Datos de mentira con trampas dentro: etiquetas HTML en los campos de
   texto libre, para comprobar que se pintan como texto y no se ejecutan. */
const REPORTE = {
  id:'11111111-1111-1111-1111-111111111111', creado_en:'2026-08-20T14:00:00Z',
  departamento:'Chocó', municipio:'Quibdó', referencia:'Frente a la cancha',
  lat:5.6947, lon:-76.6611, precision_m:12,
  tipo_residuo:'Peligrosos (pilas, medicamentos)', volumen:'1 a 5 m³ (un camión pequeño)',
  riesgo_sanitario:'Sí', necesita_gestor:true, foto_url:null,
  notas:'<img src=x onerror="window.__xss=1">', estado:'Reportado', publicado:false,
  revisado_por:null,
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
  console.log('\nindex.html');
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

  await p.click('.card >> nth=0');
  await p.waitForSelector('#f1.on', { timeout: 5000 });
  comprobar('navega al formulario de reportes', await p.isVisible('#f1.on'));
  comprobar('los desplegables se llenan', await p.locator('#r-dep option').count() > 5);
  comprobar('el formulario enlaza el aviso de datos',
    await p.locator('#f1 a[href="datos.html"]').count() === 2);
  comprobar('la autorización va antes del botón de envío',
    norm(await p.textContent('#f1')).includes('Al enviar, autoriza el tratamiento'));
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   2 · La pantalla de moderación
   --------------------------------------------------------------------- */
{
  console.log('\nmoderar.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  await ctx.addInitScript(([reporte]) => {
    localStorage.setItem('redresiduos.sesion', JSON.stringify({
      access_token: 'x.' + btoa(JSON.stringify({ email:'mod@ejemplo.org' })) + '.y',
      refresh_token: 'r', expira: Date.now() + 3600e3, correo: 'mod@ejemplo.org'
    }));
    window.__patches = [];
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      u = String(u);
      if (u.includes('rpc/es_moderador')) return Promise.resolve(new Response('true', { status:200 }));
      if (o.method === 'PATCH') { window.__patches.push({ url:u, body:o.body });
        return Promise.resolve(new Response(null, { status:204 })); }
      if (u.includes('/rest/v1/reportes?')) return Promise.resolve(new Response(JSON.stringify([reporte]), { status:200 }));
      if (u.includes('/rest/v1/')) return Promise.resolve(new Response('[]', { status:200 }));
      return real(u, o);
    };
  }, [REPORTE]);

  await p.goto(RAIZ + '/moderar.html');
  await p.waitForSelector('#panel.on', { timeout: 10000 });
  await p.waitForSelector('.ficha', { timeout: 5000 });

  comprobar('entra al panel con sesión válida', await p.isVisible('#panel.on'));
  comprobar('muestra el correo de quien entró', await p.textContent('#quien') === 'mod@ejemplo.org');

  const txt = await p.textContent('#lista');
  comprobar('pinta la ficha del reporte', txt.includes('Quibdó'));
  comprobar('el moderador sí ve el teléfono', txt.includes('3001112233'));
  comprobar('avisa de residuo peligroso', txt.includes('No lo mueven voluntarios'));
  comprobar('marca lo que está sin revisar', txt.includes('Sin revisar'));

  // Lo escribió alguien de fuera: tiene que verse, no ejecutarse.
  comprobar('NO ejecuta el HTML que venga en un reporte',
    !(await p.evaluate(() => window.__xss === 1)) &&
    await p.locator('#lista img[src="x"]').count() === 0);
  comprobar('el texto peligroso se ve como texto', txt.includes('onerror'));
  comprobar('un nombre con <b> no se interpreta', txt.includes('Ana <b>Pérez</b>'));

  await p.click('button:has-text("Publicar")');
  await p.waitForTimeout(400);
  const patches = await p.evaluate(() => window.__patches);
  comprobar('"Publicar" escribe en la base', patches.length === 1);
  comprobar('manda sólo la columna que tiene permitida',
    patches[0] && patches[0].body === '{"publicado":true}');
  comprobar('escribe en la fila correcta',
    patches[0] && patches[0].url.includes('id=eq.' + REPORTE.id));

  await p.selectOption('#lista select', 'Recogido');
  await p.waitForTimeout(400);
  const p2 = await p.evaluate(() => window.__patches);
  comprobar('cambiar el estado escribe en la base',
    p2.length >= 2 && p2[p2.length - 1].body === '{"estado":"Recogido"}');
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   3 · Sin sesión no se entra
   --------------------------------------------------------------------- */
{
  console.log('\nmoderar.html · sin sesión');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  await p.goto(RAIZ + '/moderar.html');
  await p.waitForSelector('#acceso.on', { timeout: 10000 });
  comprobar('sin sesión pide el correo', await p.isVisible('#acceso.on'));
  comprobar('no se ve nada de la bandeja', !(await p.isVisible('#panel.on')));
  await ctx.close();
}

/* ---------------------------------------------------------------------
   4 · El directorio público
   --------------------------------------------------------------------- */
{
  console.log('\ndirectorio.html');
  const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  await ctx.addInitScript(([punto, reporte, voluntario]) => {
    window.__urls = [];
    const real = window.fetch;
    window.fetch = (u, o) => {
      u = String(u); window.__urls.push(u);
      if (u.includes('v_puntos_publicos'))      return Promise.resolve(new Response(JSON.stringify([punto]), { status:200 }));
      if (u.includes('v_reportes_publicos'))    return Promise.resolve(new Response(JSON.stringify([reporte]), { status:200 }));
      if (u.includes('v_voluntarios_publicos')) return Promise.resolve(new Response(JSON.stringify([voluntario]), { status:200 }));
      return real(u, o);
    };
  }, [PUNTO, { ...REPORTE, reportes_contacto: undefined }, VOLUNTARIO]);

  await p.goto(RAIZ + '/directorio.html');
  await p.waitForSelector('.ficha', { timeout: 10000 });

  let txt = await p.textContent('#lista');
  comprobar('abre por "Dónde llevarlo"',
    await p.getAttribute('#tab-puntos', 'aria-selected') === 'true');
  comprobar('pinta el punto de acopio', txt.includes('Asociación Renacer'));
  comprobar('NO ejecuta el HTML que venga en un nombre',
    !(await p.evaluate(() => window.__xss === 1)) && await p.locator('#lista script').count() === 0);
  comprobar('el teléfono queda como enlace de WhatsApp',
    await p.getAttribute('#lista a[href*="wa.me"]', 'href') === 'https://wa.me/573001112233');
  comprobar('hay enlace al mapa', await p.locator('#lista a[href*="google.com/maps"]').count() === 1);

  await p.click('#tab-reportes'); await p.waitForTimeout(400);
  comprobar('avisa de que un RAEE no lo mueven voluntarios',
    (await p.textContent('#lista')).includes('Esto no lo mueven voluntarios'));

  await p.click('#tab-voluntarios'); await p.waitForTimeout(400);
  comprobar('lista a quien coordina',
    (await p.textContent('#lista')).includes('Líder de zona'));

  await p.selectOption('#f-dep', 'Chocó'); await p.waitForTimeout(400);
  let urls = await p.evaluate(() => window.__urls);
  comprobar('el departamento llega a la consulta',
    urls[urls.length - 1].includes('departamento=eq.Choc'));

  await p.fill('#f-mun', 'Quib'); await p.waitForTimeout(700);
  urls = await p.evaluate(() => window.__urls);
  comprobar('el municipio busca por coincidencia',
    urls[urls.length - 1].includes('municipio=ilike.*Quib*'));

  const antes = (await p.evaluate(() => window.__urls)).length;
  await p.fill('#f-mun', 'Quibdo'); await p.waitForTimeout(700);
  urls = await p.evaluate(() => window.__urls);
  comprobar('no consulta una vez por cada letra', urls.length - antes === 1);
  comprobar('no desborda a lo ancho',
    !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  comprobar('sin errores de JS', errs.length === 0);
  await ctx.close();
}

/* ---------------------------------------------------------------------
   5 · El aviso de tratamiento de datos
   --------------------------------------------------------------------- */
{
  console.log('\ndatos.html');
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

await navegador.close();
console.log('\n' + ok + ' bien, ' + mal + ' mal.');
process.exit(mal ? 1 : 0);
