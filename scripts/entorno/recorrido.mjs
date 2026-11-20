// Entorno de pruebas local: recorre la reserva por noche de punta a punta, entrando al panel de verdad
// (usuario y contraseña de prueba) y usando el sitio como cliente, contra las reglas reales en los emuladores.
//   bash scripts/entorno/levantar.sh && node scripts/entorno/recorrido.mjs
// Sale con error si algún paso falla. Las capturas quedan en $ENTORNO_DIR/capturas.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = process.env.ENTORNO_DIR || `${process.env.TMPDIR || '/tmp'}/eq-entorno`;
const SITIO = `http://localhost:${process.env.PORT || 8090}`;
const CLAVE = 'Pruebas.del.panel-2026';
const CAPTURAS = `${DIR}/capturas`;
// Capturas del panel del dueño (lista y casa en venta, a 390 y 1280 px), para mirarlas.
const PANEL = process.env.PANEL_DIR || `${CAPTURAS}/panel`;
mkdirSync(CAPTURAS, { recursive: true });
mkdirSync(PANEL, { recursive: true });

let fallas = 0, n = 0;
const paso = (nombre, bien, detalle = '') => { n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${nombre}${detalle ? ` · ${detalle}` : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = await chromium.launch();
// Una persona = un contexto. El SDK de Firebase del panel se sirve desde npm (misma versión) y las llamadas
// del sitio a Google van a los emuladores; todo lo demás de fuera se corta.
// { reglasViejas: true }: la base responde como con las reglas de antes a la prueba de reglasNuevas() (404).
async function persona(ancho = 1280, { reglasViejas = false } = {}) {
	const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
	const p = await ctx.newPage();
	const errores = [];
	p.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
	await p.route('**/*', async (r) => {
		const u = r.request().url();
		if (reglasViejas && /\/portalPropietarios\/prueba-[^/?]+/.test(u)) return r.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
		const sdk = u.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/);
		if (sdk) return r.fulfill({ path: `${DIR}/node_modules/firebase/${sdk[1]}`, contentType: 'text/javascript' });
		if (u.startsWith('https://firestore.googleapis.com')) return r.fulfill({ response: await r.fetch({ url: u.replace('https://firestore.googleapis.com', 'http://127.0.0.1:8085') }) });
		if (u.startsWith('https://firebasestorage.googleapis.com')) return r.fulfill({ response: await r.fetch({ url: u.replace('https://firebasestorage.googleapis.com', 'http://127.0.0.1:9199') }) });
		return /^http:\/\/(localhost|127\.0\.0\.1)/.test(u) ? r.continue() : r.abort();
	});
	return { p, errores };
}
async function entrar(rol, opciones) {
	const x = await persona(1280, opciones);
	await x.p.goto(`${SITIO}/admin/`);
	await x.p.fill('#login-email', `${rol}@example.com`);
	await x.p.fill('#login-pass', CLAVE);
	await x.p.locator('button[type=submit]', { hasText: 'Entrar' }).click();
	await x.p.locator('.admin-user-role').waitFor({ timeout: 15000 });
	return x;
}
const ir = async (p, ruta, ms = 2500) => { await p.evaluate((r) => { location.hash = '#/inicio'; setTimeout(() => { location.hash = r; }, 80); }, ruta); await espera(ms); };
const campo = (p, nombre, que = 'input, select, textarea') => p.locator(`[data-campo="${nombre}"]`).locator(que).last();
const guardar = async (p) => { await p.locator('button', { hasText: /^Guardar$/ }).last().click(); await espera(3500); };
// Acciones de la ficha que van en el menú ⋮ del encabezado (Duplicar, Eliminar, Traducir…).
const delMenu = async (p, texto) => { await p.locator('.admin-main .menu-mas-btn').first().click(); await p.locator('.menu-mas-lista .dropdown-item', { hasText: texto }).first().click(); };
const avisos = async (p) => (await p.locator('.toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 160);
// Lo que responde /api/reservas al tocar un botón del socio (así se sabe que lo hizo el servidor): se pide antes del clic.
const delServidor = (p) => p.waitForResponse((x) => x.url().endsWith('/api/reservas') && x.request().method() === 'POST', { timeout: 20000 })
	.then(async (x) => ({ status: x.status(), ...(await Promise.race([x.json().catch(() => ({})), espera(3000).then(() => ({}))])) })).catch(() => ({ status: 0 }));
const porServidor = (x, accion) => x.status === 200 && x.ok === true && x.accion === accion;
const resp = (x) => `servidor ${x.status}${x.error ? ` ${x.error}` : ''}`;

// ---------------------------------------------------------------- 1. El administrador ingresa la casa
const admin = await entrar('admin');
paso('El administrador entra al panel', (await admin.p.locator('.admin-user-role').innerText()) === 'Administrador');
await ir(admin.p, '#/propiedades/nuevo');
await campo(admin.p, 'titulo').fill('Casa de prueba Monterrico');
await campo(admin.p, 'operacion').selectOption('vacacional');
await espera(300);
paso('Renta vacacional: no se pide asesor responsable', !(await admin.p.locator('[data-campo="agentId"]').isVisible()));
paso('Renta vacacional: tampoco VIP ni mantenimiento al mes', !(await admin.p.locator('[data-campo="vip"]').isVisible()) && !(await admin.p.locator('[data-campo="mantenimiento"]').isVisible()));
paso('Renta vacacional: las mascotas se dicen solo en su selector, no también como amenidad', await admin.p.locator('[data-campo="amenidades"] button', { hasText: 'mascotas' }).count() === 0 && await admin.p.locator('[data-campo="amenidades"] button', { hasText: 'Piscina' }).count() === 1);
paso('Renta vacacional: no se pide nombre ni teléfono del socio', await admin.p.locator('[data-campo="socio.nombre"], [data-campo="socio.telefono"]').count() === 0);
await campo(admin.p, 'propietarioId').selectOption('socio-prueba');
await campo(admin.p, 'socio.precioBase').fill('100');
await campo(admin.p, 'socio.codigoSocio').fill('CH-07');
await campo(admin.p, 'zona').fill('Monterrico');
await campo(admin.p, 'ciudad').fill('Santa Rosa');
await campo(admin.p, 'direccion').fill('Calle Real 12, Monterrico');
await campo(admin.p, 'mapa').fill('https://maps.google.com/?q=13.8912,-90.4801');
await campo(admin.p, 'habitaciones').fill('3');
await campo(admin.p, 'vacacional.comoLlegar').fill('A 2 horas de la capital; los últimos 2 km son de terracería.');
await campo(admin.p, 'descripcion').fill('REGISTRO DE PRUEBA. Casa de playa para probar la reserva.');
await admin.p.locator('[data-campo="publicado"] input').check();
// La versión en inglés se ve antes de guardar, y sin la dirección privada de la casa.
await admin.p.waitForFunction(() => document.querySelector('[data-campo="en.titulo"] input')?.value, null, { timeout: 40000 }).catch(() => {});
const enVivo = `${await campo(admin.p, 'en.titulo').inputValue()} | ${await campo(admin.p, 'en.descripcion').inputValue()}`;
paso('La versión en inglés se traduce sola mientras se llena la ficha, sin la dirección privada', enVivo.length > 20 && /Monterrico/.test(enVivo) && !/Calle Real/.test(enVivo), enVivo.slice(0, 120));
const opcionesDe = (c) => campo(admin.p, c).locator('option').allInnerTexts();
const delaCasa = `${(await opcionesDe('estado')).join('/')} · ${(await opcionesDe('tipo')).join('/')}`;
paso('Renta vacacional: solo los estados y tipos que aplican a una casa por noche', !/Vendida|Rentada|oferta|Terreno|Bodega|Oficina|Local/.test(delaCasa) && /Disponible.*Pausada.*Casa.*Finca/.test(delaCasa), delaCasa);
const fila1 = await admin.p.evaluate(() => ['moneda', 'orden', 'publicado', 'destacada'].map((c) => document.querySelector(`[data-campo="${c}"]`)?.getBoundingClientRect().top));
paso('Renta vacacional: moneda, orden, visible y destacada en una sola fila (sin hueco)', fila1.every((t) => t && Math.abs(t - fila1[0]) < 4), fila1.map(Math.round).join(','));
const faltan = await admin.p.locator('.admin-main .alert').first().innerText().catch(() => '');
paso('Renta vacacional: con el precio del socio puesto no se avisa que falta el precio, ni se piden m² ni parqueos', !/Precio|m²|Parqueos/.test(faltan), faltan.replace(/\s+/g, ' ').slice(0, 140));
const google = await admin.p.locator('.card-body').innerText();
paso('Renta vacacional: la vista de Google lleva el precio por noche, no «A consultar»', /US\$ ?120(\.00)? por noche/.test(google) && !/Desde/.test(google) && !/A consultar/.test(google));
const columnas = await admin.p.locator('.tabla-vacacional thead th').allInnerTexts();
paso('La tabla de precios va en orden: socio, ganancia, precio, cada impuesto y lo que paga el cliente', /Socio.*Ganancia.*Precio sin impuestos.*IVA 12.*INGUAT 10.*El cliente paga/i.test(columnas.join(' ')) && /146\.40/.test(await admin.p.locator('.tabla-vacacional tbody tr').first().innerText()), columnas.join(' · '));
await guardar(admin.p);
const idCasa = (admin.p.url().match(/propiedades\/([^/?#]+)/) || [])[1];
paso('La casa se guarda', Boolean(idCasa) && idCasa !== 'nuevo', await avisos(admin.p));
// Al abrir Propietarios, quien ya entra al panel (o tiene casas por noche) recibe su resumen, con sus datos de pago:
// de ahí los toma el socio al confirmar (ya no lee su ficha).
await ir(admin.p, '#/propietarios', 1500);
{
	const FSr = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents';
	const resumenDe = async (id) => (await (await fetch(`${FSr}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'portalPropietarios' }], where: { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: { stringValue: id } } } } }) })).json()).find((x) => x.document)?.document?.fields || null;
	let r = null;
	for (let i = 0; i < 40 && !/123-456789-0/.test((r = await resumenDe('socio-prueba'))?.datosPago?.stringValue || ''); i++) await espera(500);
	await espera(1500);
	const viejo = await fetch(`${FSr}/portalPropietarios/PortalViejoDelSocioDePruebaLargoYAlAzar123`, { headers: { Authorization: 'Bearer owner' } });
	const todos = (await (await fetch(`${FSr}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'portalPropietarios' }], where: { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: { stringValue: 'socio-prueba' } } } } }) })).json()).filter((x) => x.document);
	paso('Al abrir Propietarios, el resumen viejo del socio (portal de antes) se rehace con sus datos de pago, con un id nuevo; el enlace viejo deja de existir y queda uno solo',
		/123-456789-0/.test(r?.datosPago?.stringValue || '') && !('notas' in (r || {})) && !('exclusivaFin' in (r || {})) && Number(r?.v?.integerValue) === 3 && viejo.status === 404 && todos.length === 1, `${viejo.status} · ${todos.length} resúmenes`);
	await admin.p.locator('#aviso-reglas').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
	paso('Con las reglas nuevas publicadas, el aviso de Propietarios se va solo al terminar de poner al día los resúmenes', await admin.p.locator('#aviso-reglas').isHidden());
	// Dos publicaciones a la vez del mismo resumen viejo (dos pestañas: administrador y asesor) terminan en uno solo, al que apunta la ficha.
	{
		const deColab = async () => ((await (await fetch(`${FSr}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
			body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'portalPropietarios' }], where: { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: { stringValue: 'colab-prueba' } } } } }) })).json()).filter((x) => x.document).map((x) => x.document.name.split('/').pop()));
		await fetch(`${FSr}/propietarios/colab-prueba?updateMask.fieldPaths=portalVersion`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { portalVersion: { integerValue: '2' } } }) });
		const publicar = (p) => p.evaluate(async () => {
			const fb = await import('/admin/js/firebase.js');
			const m = await import('/admin/js/portal.js');
			const s = await fb.getDoc(fb.doc(fb.db, 'propietarios', 'colab-prueba'));
			return Promise.all([m.publicarPortal({ id: s.id, ...s.data() }), m.publicarPortal({ id: s.id, ...s.data() })]);
		});
		const otraPestana = await entrar('admin');
		await Promise.all([publicar(admin.p), publicar(otraPestana.p)]);
		await otraPestana.p.close();
		await espera(1000);
		const quedan = await deColab();
		const ficha = (await (await fetch(`${FSr}/propietarios/colab-prueba`, { headers: { Authorization: 'Bearer owner' } })).json()).fields || {};
		paso('Cuatro publicaciones a la vez (dos pestañas) del mismo resumen viejo: queda uno solo y la ficha apunta a él', quedan.length === 1 && ficha.portalToken?.stringValue === quedan[0] && Number(ficha.portalVersion?.integerValue) === 3, `${quedan.length} · ${quedan.join()} · ${ficha.portalToken?.stringValue}`);
	}
}
await ir(admin.p, '#/propietarios/socio-prueba');
paso('La casa queda enlazada en la ficha del socio, sin ir a agregarla', /Casa de prueba Monterrico/.test(await admin.p.locator('.list-field .prop-titulo').first().innerText().catch(() => '')));

// ---------------------------------------------------------------- 2. Publicar (lo que hace el botón en producción)
execFileSync('bash', [path.join(REPO, 'scripts/entorno/levantar.sh'), 'publicar'], { stdio: 'pipe', env: { ...process.env, ENTORNO_DIR: DIR } });
await espera(1000);

// ---------------------------------------------------------------- 3. El cliente reserva
const cliente = await persona(390);
await cliente.p.goto(`${SITIO}/propiedades/vacacional/`);
const ficha = await cliente.p.locator('a[href^="/propiedad/"]').first().getAttribute('href').catch(() => '');
paso('La casa sale en el listado de renta vacacional', Boolean(ficha));
await cliente.p.goto(`${SITIO}${ficha}`);
await espera(1200);
const html = await cliente.p.content();
paso('La ficha pública no muestra dirección exacta, mapa ni asesor', !/Calle Real 12|maps\.google|agent-box/.test(html));
// La dirección y el mapa no están en ningún archivo del sitio ni en lo que la base le da a quien no tiene sesión.
{
	const EXACTO = /Calle Real 12|13\.8912/;
	// grep sale con 1 cuando no encuentra nada (lo esperado); la carpeta tiene que existir.
	let enSitio = [readFileSync(`${DIR}/sitio/dist/index.html`, 'utf8') ? '' : 'sin sitio'].filter(Boolean);
	try { enSitio = execFileSync('grep', ['-rlE', 'Calle Real 12|13\\.8912', `${DIR}/sitio/dist`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { /* sin coincidencias */ }
	const base = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents';
	const publica = await (await fetch(`${base}/properties/${idCasa}`)).text();
	const privada = await fetch(`${base}/properties/${idCasa}/privado/llegada`);
	paso('La dirección y el mapa no están en ningún archivo del sitio', enSitio.length === 0, enSitio.slice(0, 3).join(', '));
	paso('La base no da la dirección ni el mapa a quien no tiene sesión', /Casa de prueba|titulo/.test(publica) && !EXACTO.test(publica) && privada.status === 403, `privada: ${privada.status}`);
	await ir(admin.p, `#/propiedades/${idCasa}`);
	paso('El administrador sigue viendo la dirección y el mapa en la ficha de la casa', /Calle Real 12/.test(await campo(admin.p, 'direccion').inputValue()) && /13\.8912/.test(await campo(admin.p, 'mapa').inputValue()));
	// Casa guardada antes de este cambio (dirección y mapa en su documento público): pasa a privada sola al abrir Propiedades.
	const dueno = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, sv = (v) => ({ stringValue: v });
	await fetch(`${base}/properties/casa-heredada`, { method: 'PATCH', headers: dueno, body: JSON.stringify({ fields: { titulo: sv('Casa heredada'), operacion: sv('vacacional'), direccion: sv('Avenida Vieja 7'), mapa: sv('https://maps.google.com/?q=14.1111,-90.2222'), publicado: { booleanValue: false } } }) });
	await ir(admin.p, '#/propiedades', 4000);
	const heredada = (await (await fetch(`${base}/properties/casa-heredada`, { headers: dueno })).json()).fields || {};
	const suLlegada = (await (await fetch(`${base}/properties/casa-heredada/privado/llegada`, { headers: dueno })).json()).fields || {};
	paso('Una casa guardada antes pasa su dirección y su mapa a privado sola', heredada.direccion?.stringValue === '' && heredada.mapa?.stringValue === ''
		&& suLlegada.direccion?.stringValue === 'Avenida Vieja 7' && /14\.1111/.test(suLlegada.mapa?.stringValue || ''));
	await fetch(`${base}/properties/casa-heredada/privado/llegada`, { method: 'DELETE', headers: dueno });
	await fetch(`${base}/properties/casa-heredada`, { method: 'DELETE', headers: dueno });
}
const dias = () => cliente.p.locator('.vac-cal-cuerpo button:not([aria-disabled=true])');
await dias().nth(3).click();
await dias().nth(6).click();
await cliente.p.fill('.vac-card [name=nombre]', 'Ana Prueba');
await cliente.p.locator('.vac-card [name=codigo]').selectOption('1');
await cliente.p.fill('.vac-card [name=telefono]', '305 555 1234');
await cliente.p.fill('.vac-card [name=email]', 'ana@example.com');
// Personas viene vacío: el botón lo pide y sin elegirlo no se envía.
paso('Con las fechas puestas, el botón pide las personas y sin ellas no envía', (await cliente.p.locator('.vac-card button[type=submit]').innerText()).includes('¿Cuántas personas vienen?')
	&& await (async () => { await cliente.p.locator('.vac-card button[type=submit]').click(); await espera(600); return !/\/reserva\//.test(cliente.p.url()) && await cliente.p.locator('.vac-card [name=huespedes].is-invalid').count() === 1; })());
await cliente.p.locator('.vac-card [name=huespedes]').selectOption('2');
await espera(300);
{
	const guia = await cliente.p.evaluate(() => {
		const ol = document.querySelector('.vac-card .vac-guia'), li = [...ol.querySelectorAll('li')];
		return { unaFila: new Set(li.map((x) => Math.round(x.getBoundingClientRect().top))).size === 1, alto: Math.round(ol.getBoundingClientRect().height),
			hechos: li.filter((x) => x.classList.contains('is-hecho')).length, ahora: (ol.querySelector('.is-ahora') || {}).dataset?.paso, url: location.search };
	});
	paso('La línea de pasos va en una sola fila, marca fechas y personas y lo guarda en la dirección', guia.unaFila && guia.alto < 60 && guia.hechos >= 2
		&& /llegada=.*salida=.*huespedes=2/.test(guia.url), JSON.stringify(guia));
}
await cliente.p.locator('.vac-card button[type=submit]').click();
await cliente.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
const token = (cliente.p.url().match(/reserva\/#(\w+)/) || [])[1];
paso('Al solicitar, el cliente queda en «Tu reserva» (sin WhatsApp)', Boolean(token), cliente.p.url().replace(/#.*/, '#…'));
await espera(1500);
const codigo = (await cliente.p.locator('[data-out="codigo"]').innerText()).trim();
const escribir = async (texto) => { await cliente.p.fill('.vac-chat-form textarea', texto); await cliente.p.keyboard.press('Enter'); await espera(1500); return cliente.p.locator('.vac-chat-aviso').innerText(); };
// Enter dos veces seguidas (como quien responde rápido): el mensaje sale una sola vez.
await cliente.p.fill('.vac-chat-form textarea', 'Hola, ¿aceptan 2 perros pequeños?');
await cliente.p.keyboard.press('Enter'); await cliente.p.keyboard.press('Enter');
await espera(1500);
paso('El cliente escribe en el chat (Enter dos veces: sale una sola vez)', (await cliente.p.locator('.vac-chat-aviso').innerText()) === ''
	&& await cliente.p.locator('.vac-chat-msj', { hasText: 'aceptan 2 perros' }).count() === 1, `${await cliente.p.locator('.vac-chat-msj', { hasText: 'aceptan 2 perros' }).count()} mensajes`);
paso('El chat bloquea un teléfono', /no se comparten/.test(await escribir('Mejor llamame al 5555-1234')));
await cliente.p.fill('.vac-chat-form textarea', '');

// ---------------------------------------------------------------- 4. El socio atiende
const socio = await entrar('socio');
await ir(socio.p, `#/solicitudes/${codigo}`, 3500);
const tarjeta = socio.p.locator('.card', { hasText: codigo }).first();
const loDelSocio = await socio.p.locator('.admin-main').innerText();
paso('El socio ve la solicitud con el primer nombre', /Ana\b/.test(loDelSocio) && !/Ana Prueba/.test(loDelSocio));
paso('El socio ve el código que él usa para su casa en la solicitud', /Código del socio: CH-07/.test(loDelSocio));
// Campana: la solicitud nueva (con su mensaje) es un solo aviso, con enlace a la solicitud.
const campanaSocio = async () => {
	await socio.p.evaluate(() => document.dispatchEvent(new CustomEvent('avisos')));
	await espera(2500);
	return { etiqueta: await socio.p.locator('.avisos-btn').getAttribute('aria-label'), enlaces: await socio.p.locator('.avisos-lista .aviso-enlace').evaluateAll((a) => a.map((x) => x.getAttribute('href'))) };
};
const antesDeConfirmar = await campanaSocio();
paso('La campana del socio avisa la solicitud con un enlace a ella', antesDeConfirmar.enlaces.includes(`#/solicitudes/${encodeURIComponent(codigo)}`)
	&& antesDeConfirmar.enlaces.filter((h) => h.includes(codigo)).length === 1, `${antesDeConfirmar.etiqueta} · ${antesDeConfirmar.enlaces.join(' ')}`);
const waSocio = await socio.p.locator('.admin-main a[href*="wa.me"]').evaluateAll((a) => a.map((x) => decodeURIComponent(x.href)));
paso('El socio no ve teléfono, correo ni WhatsApp del cliente', !/305\s?555|555 1234|ana@example/.test(await socio.p.locator('body').innerText()) && waSocio.every((u) => !/5551234/.test(u)));
paso('El socio le escribe al equipo por WhatsApp con el código de la solicitud', waSocio.some((u) => u.includes('50259131276') && u.includes(codigo)), waSocio.join(' | ').slice(0, 200));
paso('La solicitud marca «Mensaje sin responder»', /Mensaje sin responder/.test(await tarjeta.innerText()));
await tarjeta.locator('[aria-label="Chat con el cliente"]').click();
await espera(1500);
await socio.p.fill('.modal textarea', 'Hola Ana, sí aceptamos mascotas pequeñas.');
await socio.p.locator('.modal [aria-label=Enviar]').dblclick();
await espera(1500);
paso('El socio responde con doble clic: sale una sola vez', await socio.p.locator('.modal', { hasText: 'aceptamos mascotas' }).locator('text=Hola Ana, sí aceptamos mascotas pequeñas.').count() === 1);
await socio.p.fill('.modal textarea', 'Mi número es 5555 0001');
await socio.p.locator('.modal [aria-label=Enviar]').click();
await espera(800);
paso('El panel bloquea el teléfono del socio', /no se comparten/.test(await avisos(socio.p)));
await socio.p.screenshot({ path: `${CAPTURAS}/socio-chat.png` });
// Respuestas rápidas detrás del rayo: cerradas al abrir; al tocar una, va al campo y se cierran.
const rapidasOcultas = await socio.p.locator('.modal button', { hasText: '¿Viajan con mascotas?' }).isHidden();
await socio.p.locator('.modal [aria-label="Respuestas rápidas"]').click();
await socio.p.locator('.modal button', { hasText: '¿Viajan con mascotas?' }).click();
paso('Respuestas rápidas tras el rayo: se abren, llenan el campo y se cierran', rapidasOcultas && await socio.p.locator('.modal textarea').inputValue() === '¿Viajan con mascotas?'
	&& await socio.p.locator('.modal button', { hasText: '¿Viajan con mascotas?' }).isHidden());
await socio.p.fill('.modal textarea', '');
const tamano = socio.p.viewportSize();
await socio.p.setViewportSize({ width: 390, height: 844 });
await espera(400);
await socio.p.screenshot({ path: `${CAPTURAS}/socio-chat-390.png` });
await socio.p.setViewportSize(tamano);
await socio.p.locator('.modal .btn-close').click();
await espera(2500);
await socio.p.locator('.card', { hasText: codigo }).first().locator('button', { hasText: 'Confirmar' }).click();
await espera(800);
const confirmo = delServidor(socio.p);
await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
const r1 = await confirmo;
await espera(3000);
paso('El socio confirma la reserva, por el servidor', porServidor(r1, 'confirmar') && /Confirmada/.test(await socio.p.locator('.card', { hasText: codigo }).first().innerText()), `${resp(r1)} · ${await avisos(socio.p)}`);
{
	// Los montos se congelaron al llegar la solicitud (/api/aviso-chat) y la reserva guardó esos mismos.
	const fs = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents', ow = { headers: { Authorization: 'Bearer owner' } };
	const leadId = (await (await fetch(`${fs}/chats/${token}`, ow)).json()).fields?.leadId?.stringValue;
	const congelado = (await (await fetch(`${fs}/montosSolicitud/${leadId}`, ow)).json()).fields || {};
	const reserva = (await (await fetch(`${fs}/reservas/${leadId}`, ow)).json()).fields || {};
	const n = (v) => Number(v?.doubleValue ?? v?.integerValue);
	paso('Los montos de la solicitud se congelaron al llegar y la reserva guardó esos (parte del socio + ganancia = lo cobrado)',
		n(congelado.costoSocio) > 0 && n(reserva.costoSocio) === n(congelado.costoSocio) && n(reserva.alojamiento) === n(congelado.alojamiento)
		&& Math.abs(n(reserva.costoSocio) + n(reserva.comision?.mapValue?.fields?.monto) - n(reserva.alojamiento)) < 0.01 && n(reserva.vencePago) > Date.now(),
		`congelado ${n(congelado.costoSocio)}/${n(congelado.alojamiento)} · reserva ${n(reserva.costoSocio)}/${n(reserva.alojamiento)}`);
}
const trasConfirmar = await campanaSocio();
paso('Al confirmar, la solicitud sale de la campana', !trasConfirmar.enlaces.some((h) => h.includes(codigo)), `${trasConfirmar.etiqueta} · ${trasConfirmar.enlaces.join(' ')}`);

await cliente.p.reload();
await espera(2500);
paso('El cliente ve «Reserva confirmada» y los datos de pago', /confirmada/i.test(await cliente.p.locator('.vac-chat-sello').innerText()) && /123-456789-0/.test(await cliente.p.locator('.vac-chat-mensajes').innerText()));
paso('El cliente todavía no ve la dirección', !/Calle Real 12/.test(await cliente.p.locator('.vac-chat-mensajes').innerText()));
paso('El cliente ve la fecha y hora exactas para pagar', /Paga antes del \w+, \d+ \w+, \d+:\d\d/.test(await cliente.p.locator('[data-out="sigue"]').innerText()), await cliente.p.locator('[data-out="sigue"]').innerText());
// Comprobante: una imagen PNG mínima.
const png = `${CAPTURAS}/comprobante.png`;
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
await cliente.p.setInputFiles('.vac-chat-form input[type=file]', png);
await espera(3500);
paso('El cliente adjunta la foto de su comprobante (Storage)', await cliente.p.locator('.vac-chat-msj img').count() === 1, await cliente.p.locator('.vac-chat-aviso').innerText());
paso('Con el comprobante enviado, la página ya no dice «Paga…»: «Comprobante enviado, el anfitrión lo revisa» y sin la cámara',
	/Comprobante enviado/.test(await cliente.p.locator('[data-out="sigue"]').innerText()) && await cliente.p.locator('.vac-chat-adjuntar').isHidden(), await cliente.p.locator('[data-out="sigue"]').innerText());
await cliente.p.locator('.vac-chat').screenshot({ path: `${CAPTURAS}/cliente-comprobante-enviado-390.png` }).catch(() => {});

await ir(socio.p, `#/solicitudes/${codigo}`, 3500);
{
	const conComprobante = await socio.p.locator('.card', { hasText: codigo }).first().innerText();
	await socio.p.locator('.card', { hasText: codigo }).first().screenshot({ path: `${CAPTURAS}/socio-comprobante-1280.png` }).catch(() => {});
	const t0 = socio.p.viewportSize();
	await socio.p.setViewportSize({ width: 390, height: 844 }); await espera(400);
	await socio.p.locator('.card', { hasText: codigo }).first().screenshot({ path: `${CAPTURAS}/socio-comprobante-390.png` }).catch(() => {});
	await socio.p.setViewportSize(t0); await espera(300);
	paso('El socio ve «Cliente subió comprobante» y «No me llegó» en vez de «Cancelar»', /Cliente subió comprobante/.test(conComprobante) && /No me llegó/.test(conComprobante) && !/Cancelar/.test(conComprobante), conComprobante.replace(/\s+/g, ' ').slice(0, 200));
}
await socio.p.locator('.card', { hasText: codigo }).first().locator('button', { hasText: 'Pago recibido' }).click();
await espera(800);
const pagoRes = delServidor(socio.p);
await socio.p.locator('.modal button', { hasText: 'Pago recibido' }).last().click();
const r2 = await pagoRes;
await espera(3000);
const trasPago = await socio.p.locator('.card', { hasText: codigo }).first().innerText();
paso('El socio marca «Pago recibido», por el servidor', porServidor(r2, 'pago') && /Pago recibido/.test(trasPago), `${resp(r2)} · ${await avisos(socio.p)}`);
paso('Con el pago recibido, el socio ya no puede cancelar', !/Cancelar/.test(trasPago));

await cliente.p.reload();
await espera(2500);
const fin = await cliente.p.locator('.vac-chat-mensajes').innerText();
paso('El cliente ve «Pago recibido» y los datos de llegada', /Pago recibido|Payment received/.test(await cliente.p.locator('.vac-chat-sello').innerText()) && /Calle Real 12/.test(fin) && /terracería/.test(fin)
	&& /13\.8912/.test(await cliente.p.locator('.vac-chat-mensajes a[href*="maps"]').getAttribute('href').catch(() => '')));
paso('Sin scroll de lado en «Tu reserva» (390 px)', await cliente.p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
await cliente.p.screenshot({ path: `${CAPTURAS}/cliente-reserva.png`, fullPage: true });

// ---------------------------------------------------------------- 4b. Otra solicitud, que no se da
const otro = await persona(390);
await otro.p.goto(`${SITIO}${ficha}`);
await espera(1500);
await otro.p.locator('.vac-cal-next').click();
await espera(400);
const libres = () => otro.p.locator('.vac-cal-cuerpo button:not([aria-disabled=true])');
await libres().nth(3).click();
await libres().nth(5).click();
await otro.p.fill('.vac-card [name=nombre]', 'Luis Otro');
await otro.p.fill('.vac-card [name=telefono]', '5555 9876');
await otro.p.fill('.vac-card [name=email]', 'luis@example.com');
await otro.p.locator('.vac-card [name=huespedes]').selectOption('2');
await otro.p.locator('.vac-card button[type=submit]').click();
await otro.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
await espera(1500);
const codigo2 = (await otro.p.locator('[data-out="codigo"]').innerText().catch(() => '')).trim();
paso('Un segundo cliente solicita otras fechas', /^EQ-/.test(codigo2), codigo2);
await ir(socio.p, `#/solicitudes/${codigo2}`, 3500);
await socio.p.locator('.card', { hasText: codigo2 }).first().locator('button', { hasText: 'No se dio' }).click();
await espera(800);
const noRes = delServidor(socio.p);
await socio.p.locator('.modal button', { hasText: 'Fechas no disponibles' }).click();
const r3 = await noRes;
await espera(3000);
paso('El socio responde «No se dio», por el servidor', porServidor(r3, 'no') && /No se dio/.test(await socio.p.locator('.card', { hasText: codigo2 }).first().locator('.badge').first().innerText()), `${resp(r3)} · ${await avisos(socio.p)}`);
await otro.p.reload();
await espera(2500);
paso('Ese cliente ve «No se concretó», el mensaje con el motivo y un botón para elegir otras fechas (sin la cámara del comprobante)', /No se concretó/.test(await otro.p.locator('.vac-chat-sello').innerText()) && /no está disponible/.test(await otro.p.locator('.vac-chat-mensajes').innerText())
	&& await otro.p.locator('[data-out="sigue"] a', { hasText: 'Elegir otras fechas' }).isVisible() && await otro.p.locator('.vac-chat-adjuntar').isHidden());

// ---------------------------------------------------------------- 4c. Una confirmada que el socio cancela (el cliente no pagó)
const FS = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents';
const leer = async (ruta) => (await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } })).json();
const reservadas = async () => JSON.stringify((await leer(`properties/${idCasa}`)).fields.vacacional.mapValue.fields.reservadas || {});
const tercero = await persona(390);
await tercero.p.goto(`${SITIO}${ficha}`);
await espera(1500);
await tercero.p.locator('.vac-cal-next').click();
await espera(400);
const libres3 = () => tercero.p.locator('.vac-cal-cuerpo button:not([aria-disabled=true])');
await libres3().nth(12).click();
await libres3().nth(14).click();
await tercero.p.fill('.vac-card [name=nombre]', 'Marta Tercera');
await tercero.p.fill('.vac-card [name=telefono]', '5555 4321');
await tercero.p.fill('.vac-card [name=email]', 'marta@example.com');
await tercero.p.locator('.vac-card [name=huespedes]').selectOption('2');
await tercero.p.locator('.vac-card button[type=submit]').click();
await tercero.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
await espera(1500);
const codigo3 = (await tercero.p.locator('[data-out="codigo"]').innerText().catch(() => '')).trim();
const llegada3 = (await leer(`chats/${(tercero.p.url().match(/#(\w+)/) || [])[1]}`)).fields?.llegada?.stringValue || '';
// La ficha de la casa queda abierta en el panel del administrador mientras el socio confirma esta reserva y cambia su
// precio en «Mis propiedades»: al guardar la ficha, nada de eso se pierde (antes la ficha reescribía la casa entera).
await ir(admin.p, `#/propiedades/${idCasa}`, 3500);
await ir(socio.p, `#/solicitudes/${codigo3}`, 3500);
await socio.p.locator('.card', { hasText: codigo3 }).first().locator('button', { hasText: 'Confirmar' }).click();
await espera(800);
const confirmo3 = delServidor(socio.p);
await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
const r4 = await confirmo3;
await espera(3000);
paso('El socio confirma una tercera reserva (por el servidor) y las fechas quedan ocupadas', porServidor(r4, 'confirmar') && Boolean(llegada3) && (await reservadas()).includes(llegada3), `${codigo3} · ${resp(r4)}`);
{
	await ir(socio.p, `#/mis-casas/${idCasa}`, 3500);
	await socio.p.fill('#mc-base', '110');
	await socio.p.locator('#mc-base').dispatchEvent('change');
	await espera(2500);
	await campo(admin.p, 'vacacional.camas').fill('4');
	await guardar(admin.p);
	const num = (f) => Number(f?.doubleValue ?? f?.integerValue);
	const v = (await leer(`properties/${idCasa}`)).fields?.vacacional?.mapValue?.fields || {};
	const neto = num((await leer(`properties/${idCasa}/privado/socio`)).fields?.precioBase);
	paso('Guardar la ficha abierta desde antes no libera la noche que el socio confirmó ni deshace el precio que cambió en «Mis propiedades»',
		(await reservadas()).includes(llegada3) && neto === 110 && num(v.base) === 132 && num(v.camas) === 4, `socio ${neto} · público ${num(v.base)} · camas ${num(v.camas)} · ${await avisos(admin.p)}`);
	// La ficha publicada dice «US$ 120.00 por noche»; sin publicar de nuevo, el cliente ya ve el precio nuevo arriba y en el cuadro.
	await cliente.p.goto(`${SITIO}${ficha}`);
	await cliente.p.waitForFunction(() => /132\.00/.test(document.querySelector('.ficha-precio')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
	const desdes = await cliente.p.locator('.ficha-precio').allInnerTexts();
	paso('El cliente ve el precio nuevo del socio en la ficha, sin esperar a que se publique', desdes.length === 1 && /US\$ 132\.00 por noche/.test(desdes[0]) && !/Desde/.test(desdes[0]), desdes.join(' | '));
	// Temporada que se repite cada año: el socio elige unos días, pone su precio y «Cada año en estas fechas»; quedan
	// este año y el siguiente con la misma serie. «Quitar» → «Todos los años» quita las dos y nada más.
	{
		await ir(socio.p, `#/mis-casas/${idCasa}`, 3500);
		for (let i = 0; i < 4; i++) { await socio.p.locator('button[aria-label="Mes siguiente"]').first().click(); await espera(150); }
		const diaN = (n) => socio.p.locator('.vac-cal button, table button').filter({ has: socio.p.locator('.vac-dia-num', { hasText: new RegExp(`^${n}$`) }) }).first();
		await diaN(10).click(); await diaN(12).click();
		await socio.p.locator('[aria-label="Precio especial"]').click();
		await socio.p.locator('.mc-barra input[type=number]').fill('150');
		// «¿Se repite cada año?» va en la misma barra, sin otra ventana.
		await socio.p.locator('.mc-barra select[aria-label="¿Se repite cada año?"]').selectOption('fecha');
		await socio.p.locator('.mc-barra [aria-label="Guardar"]').click();
		await espera(3000);
		const tarifas = () => leer(`properties/${idCasa}/privado/socio`).then((d) => (d.fields?.tarifas?.arrayValue?.values || []).map((x) => Object.fromEntries(Object.entries(x.mapValue.fields).map(([k, v]) => [k, v.stringValue ?? Number(v.doubleValue ?? v.integerValue)]))));
		const serie = (await tarifas()).filter((t) => t.cada === 'fecha');
		const anios = serie.map((t) => t.desde.slice(0, 4));
		const ok1 = serie.length === 2 && serie[0].serie && serie[0].serie === serie[1].serie && Number(anios[1]) === Number(anios[0]) + 1 && serie[0].desde.slice(5) === serie[1].desde.slice(5);
		await socio.p.locator('[aria-label^="Quitar precios especiales"]').first().click();
		await socio.p.locator('.modal.show button', { hasText: 'Todos los años' }).click();
		await espera(3000);
		const quedan = (await tarifas()).filter((t) => t.cada);
		paso('Una temporada «cada año» guarda este año y el siguiente con la misma serie, y «Quitar → Todos los años» quita las dos',
			ok1 && quedan.length === 0, `${serie.map((t) => `${t.desde}…${t.hasta}·${t.precio}`).join(' | ')} · quedan ${quedan.length}`);
	}
	// Lo que sale a la IA o al traductor (pedirIA lo pasa todo por paraIA): con la casa guardada de verdad, más su
	// dirección y su costo privados encima (lo peor que una pantalla podría mandar), no sale nada privado ni interno.
	const salidas = await admin.p.evaluate(async (id) => {
		const fb = await import('/admin/js/firebase.js');
		const { paraIA } = await import('/admin/js/para-ia.js');
		const leerDoc = async (...r) => (await fb.getDoc(fb.doc(fb.db, ...r))).data() || {};
		const casa = { id, ...(await leerDoc('properties', id)), ...(await leerDoc('properties', id, 'privado', 'llegada')), socio: await leerDoc('properties', id, 'privado', 'socio') };
		return JSON.stringify(paraIA({ propiedad: casa }));
	}, idCasa);
	paso('Lo que sale a traducir de una casa por noche no lleva la dirección, el dueño, el historial ni el costo del socio',
		/Monterrico/.test(salidas) && !/Calle Real|13\.8912|socio-prueba|historialEstado|precioBase|porUid/.test(salidas), salidas.slice(0, 160));
	await ir(socio.p, `#/solicitudes/${codigo3}`, 3500);
}
await socio.p.locator('.card', { hasText: codigo3 }).first().locator('button', { hasText: 'Cancelar' }).click();
await espera(800);
const cancelo = delServidor(socio.p);
await socio.p.locator('.modal button', { hasText: 'Cliente canceló' }).click();
const r5 = await cancelo;
await espera(3500);
paso('El socio cancela esa reserva (el cliente no pagó), por el servidor', porServidor(r5, 'cancelar') && /Cancelada/.test(await socio.p.locator('.card', { hasText: codigo3 }).first().locator('.badge').first().innerText().catch(() => '')), `${resp(r5)} · ${await avisos(socio.p)}`);
paso('Las fechas canceladas vuelven a quedar libres', !(await reservadas()).includes(llegada3));
await tercero.p.reload();
await espera(2500);
paso('Ese cliente ve «Reserva cancelada» y el mensaje', /cancelada/i.test(await tercero.p.locator('.vac-chat-sello').innerText()) && /se canceló/.test(await tercero.p.locator('.vac-chat-mensajes').innerText()));

// ---------------------------------------------------------------- 4c2. Lo del socio, solo por el servidor
// El servidor (netlify/functions/reservas.mjs) revisa de quién es, si ya se respondió y si las fechas chocan, y no toma
// montos de quien llama; el socio no puede escribir lo mismo directo en la base. Si el servidor no tiene su cuenta de
// escritura (503), el panel sigue por el camino de antes, que con las reglas de antes funciona.
{
	const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
	const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=pruebas';
	const tokenDe = async (rol) => (await (await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${rol}@example.com`, password: CLAVE, returnSecureToken: true }) })).json()).idToken;
	const api = async (rol, cuerpo) => {
		const x = await fetch(`${SITIO}/api/reservas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenDe(rol)}` }, body: JSON.stringify(cuerpo) });
		return { status: x.status, ...(await x.json().catch(() => ({}))) };
	};
	const RAIZ = 'projects/demo-eq/databases/(default)/documents';
	const sv = (v) => ({ stringValue: v });
	const nv = (v) => (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v });
	const ahora = () => ({ timestampValue: new Date().toISOString() });
	const poner = (ruta, fields) => fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
	const existe = async (ruta) => (await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } })).status === 200;
	// Una solicitud como la deja el sitio (solicitud, chat con su subtotal e índice), en fechas lejanas y libres.
	const sembrar = async (id, llegada, noches = 2, { indice = true } = {}) => {
		const salida = new Date(Date.parse(`${llegada}T00:00:00Z`) + noches * 86400000).toISOString().slice(0, 10);
		const subtotal = 132 * noches, impuestos = Math.round(subtotal * 22) / 100, total = Math.round((subtotal + impuestos) * 100) / 100;
		const codigo = `EQ-${id.toUpperCase()}`, token = `Sembrado${id.replace(/[^A-Za-z0-9]/g, '')}LargoYAlAzar123456`;
		const reserva = { codigo: sv(codigo), llegada: sv(llegada), salida: sv(salida), noches: nv(noches), huespedes: nv(2), subtotal: nv(subtotal), impuestos: nv(impuestos), total: nv(total), moneda: sv('USD') };
		await poner(`leads/${id}`, { nombre: sv('Sol Sembrada'), telefono: sv('+502 5555 2222'), email: sv('sol@example.com'), propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'),
			propietarioId: sv('socio-prueba'), agentId: sv(''), estado: sv('nuevo'), origen: sv('reserva'), createdAt: ahora(), reserva: { mapValue: { fields: reserva } } });
		await poner(`chats/${token}`, { codigo: sv(codigo), propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'), propietarioId: sv('socio-prueba'), nombre: sv('Sol'),
			llegada: sv(llegada), salida: sv(salida), noches: nv(noches), huespedes: nv(2), total: nv(total), subtotal: nv(subtotal), moneda: sv('USD'), idioma: sv('es'), leadId: sv(id), createdAt: ahora() });
		if (indice) await poner(`chatsPorSolicitud/${id}`, { token: sv(token) });
		return { id, token, codigo, llegada, salida };
	};
	const leadDe = async (t) => (await leer(`chats/${t}`)).fields?.leadId?.stringValue || '';
	const lead1 = await leadDe(token);
	const llegada1 = (await leer(`chats/${token}`)).fields?.llegada?.stringValue || '';

	const a = await sembrar('srv-a', iso(200));
	const ajeno = await api('colab', { accion: 'confirmar', leadId: a.id });
	paso('Servidor: otro dueño no confirma una solicitud de una casa que no es suya (403)', ajeno.status === 403 && !(await existe(`reservas/${a.id}`)), resp(ajeno));
	const dos = await api('socio', { accion: 'confirmar', leadId: lead1 });
	paso('Servidor: la misma solicitud no se confirma dos veces (409, «ya respondida»: el panel recarga)', dos.status === 409 && dos.yaRespondida === true, resp(dos));
	const b = await sembrar('srv-b', llegada1, 1);
	const choca = await api('socio', { accion: 'confirmar', leadId: b.id });
	paso('Servidor: fechas que chocan con otra reserva confirmada no se confirman y no se escribe nada (422)', choca.status === 422 && !(await existe(`reservas/${b.id}`)) && !(await leer(`chats/${b.token}`)).fields?.estado, resp(choca));
	// «No me llegó»: el cliente subió un comprobante y el pago no llegó (antes de la llegada): el pago se reabre con un
	// plazo nuevo y sin el comprobante; sin comprobante, antes de llegar, se usa «Cancelar» (409).
	{
		const nl = await sembrar('srv-nollego', iso(150));
		const conf = await api('socio', { accion: 'confirmar', leadId: nl.id });
		const sinComp = await api('socio', { accion: 'nollego', leadId: nl.id });
		await fetch(`${FS}/chats/${nl.token}?updateMask.fieldPaths=comprobanteCliente`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
			body: JSON.stringify({ fields: { comprobanteCliente: { timestampValue: new Date().toISOString() } } }) });
		const antes = Number((await leer(`reservas/${nl.id}`)).fields?.vencePago?.integerValue);
		await espera(1100);
		const re = await api('socio', { accion: 'nollego', leadId: nl.id });
		const ch = (await leer(`chats/${nl.token}`)).fields || {};
		const despues = Number((await leer(`reservas/${nl.id}`)).fields?.vencePago?.integerValue);
		paso('Servidor: «No me llegó» con el comprobante (antes de la llegada) reabre el pago con plazo nuevo y sin comprobante; sin comprobante, 409',
			conf.status === 200 && sinComp.status === 409 && re.status === 200 && re.reabierta === true && despues > antes && !ch.comprobanteCliente?.timestampValue
			&& Number(ch.vencePago?.integerValue) === despues && (await leer(`reservas/${nl.id}`)).fields?.estado?.stringValue === 'confirmada', `${resp(sinComp)} · ${resp(re)}`);
		await api('socio', { accion: 'cancelar', leadId: nl.id, motivo: 'Otro' });
	}
	// Llegada ya pasada (la solicitud quedó abierta): no se confirma (la comisión nacería vencida); «No se dio» sí.
	const pasada = await sembrar('srv-pasada', iso(-3));
	const tarde = await api('socio', { accion: 'confirmar', leadId: pasada.id });
	paso('Servidor: una solicitud con la llegada ya pasada no se confirma ni se escribe nada (409, sin «ya respondida»)', tarde.status === 409 && !tarde.yaRespondida && !(await existe(`reservas/${pasada.id}`)) && !(await leer(`chats/${pasada.token}`)).fields?.estado, resp(tarde));
	// En Solicitudes no se ofrece «Confirmar» y se dice por qué (queda «No se dio»).
	await ir(socio.p, `#/solicitudes/${pasada.codigo}`, 3500);
	const tarjetaPasada = socio.p.locator('.card', { hasText: pasada.codigo }).first();
	await tarjetaPasada.screenshot({ path: `${CAPTURAS}/solicitud-llegada-pasada.png` }).catch(() => {});
	const textoPasada = await tarjetaPasada.innerText().catch(() => '');
	paso('Solicitudes: con la llegada ya pasada no hay «Confirmar», dice por qué y queda «No se dio»', /La fecha de llegada ya pasó/.test(textoPasada) && /No se dio/.test(textoPasada)
		&& !(await tarjetaPasada.locator('button', { hasText: /^Confirmar$/ }).count()), textoPasada.replace(/\s+/g, ' ').slice(0, 160));
	const cerrada = await api('socio', { accion: 'no', leadId: pasada.id, motivo: 'Cliente no respondió' });
	paso('Servidor: esa solicitud se cierra con «No se dio» (200)', cerrada.status === 200 && (await leer(`chats/${pasada.token}`)).fields?.estado?.stringValue === 'no', resp(cerrada));
	const motivo = await api('socio', { accion: 'no', leadId: b.id, motivo: 'Llamame al 5555 0001' });
	paso('Servidor: un motivo que no es de la lista no se acepta (400)', motivo.status === 400, resp(motivo));
	// Montos en el pedido: no cuentan (salen de la casa y de la solicitud guardadas).
	const conMontos = await api('socio', { accion: 'confirmar', leadId: a.id, costoSocio: 1, alojamiento: 1, ganancia: 0, comision: { monto: 0, pagada: true } });
	const ra = (await leer(`reservas/${a.id}`)).fields || {};
	const n = (f) => Number(f?.doubleValue ?? f?.integerValue);
	const com = ra.comision?.mapValue?.fields || {};
	paso('Servidor: los montos que mande quien llama no cuentan (su parte, ganancia y comisión salen de lo guardado)', conMontos.status === 200 && n(ra.costoSocio) >= 200 && n(ra.ganancia) > 0
		&& n(com.monto) === n(ra.ganancia) && com.pagada?.booleanValue === false && ra.chat?.stringValue === a.token, `${resp(conMontos)} · parte ${n(ra.costoSocio)} · ganancia ${n(ra.ganancia)} · comisión ${n(com.monto)}`);
	const cancelaA = await api('socio', { accion: 'cancelar', leadId: a.id, motivo: 'Cliente canceló' });
	paso('Servidor: el socio cancela por el servidor y las fechas quedan libres', cancelaA.status === 200 && (await leer(`reservas/${a.id}`)).fields?.estado?.stringValue === 'cancelada' && !(await reservadas()).includes(a.llegada), resp(cancelaA));

	// A la vez: la misma solicitud dos veces (una sola reserva) y dos solicitudes con fechas que se cruzan (una sola gana).
	const f1 = await sembrar('srv-f', iso(230));
	const mismas = (await Promise.all([api('socio', { accion: 'confirmar', leadId: f1.id }), api('socio', { accion: 'confirmar', leadId: f1.id })])).map((x) => x.status).sort();
	paso('Servidor: la misma solicitud confirmada dos veces a la vez deja una sola reserva (200 y 409)', mismas.join() === '200,409', mismas.join());
	const g1 = await sembrar('srv-g1', iso(240)), g2 = await sembrar('srv-g2', iso(241));
	const cruzadas = (await Promise.all([api('socio', { accion: 'confirmar', leadId: g1.id }), api('socio', { accion: 'confirmar', leadId: g2.id })])).map((x) => x.status).sort();
	paso('Servidor: dos solicitudes que se cruzan confirmadas a la vez: gana una (200 y 422)', cruzadas.join() === '200,422', cruzadas.join());
	const trasPagar = await api('socio', { accion: 'cancelar', leadId: lead1, motivo: 'Cliente canceló' });
	paso('Servidor: el socio no cancela una reserva ya pagada (409)', trasPagar.status === 409 && (await leer(`reservas/${lead1}`)).fields?.estado?.stringValue === 'confirmada', resp(trasPagar));

	// El socio directo en la base (con las reglas nuevas): ni la reserva, ni el chat, ni los datos de pago.
	const c = await sembrar('srv-c', iso(210));
	const socioToken = await tokenDe('socio');
	const directo = async (writes) => (await fetch(`${FS}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${socioToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
	const reservaC = { propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'), agentId: sv(''), propietarioId: sv('socio-prueba'), moneda: sv('USD'), llegada: sv(c.llegada), salida: sv(c.salida), noches: nv(2),
		huesped: sv('Sol'), canal: sv('web'), estado: sv('confirmada'), leadId: sv(c.id), codigo: sv(c.codigo), chat: sv(c.token), costoSocio: nv(220), alojamiento: nv(264), ganancia: nv(44), pagadoSocio: { booleanValue: false }, pagadoFecha: sv(''),
		comision: { mapValue: { fields: { monto: nv(44), vence: sv(c.llegada), pagada: { booleanValue: false } } } } };
	const lote = await directo([
		{ update: { name: `${RAIZ}/reservas/${c.id}`, fields: reservaC }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
		{ update: { name: `${RAIZ}/chats/${c.token}`, fields: { estado: sv('confirmada') } }, updateMask: { fieldPaths: ['estado'] } },
		{ update: { name: `${RAIZ}/chats/${c.token}/mensajes/pago`, fields: { de: sv('socio'), tipo: sv('pago'), texto: sv('Banco de prueba, cuenta monetaria 123-456789-0, a nombre de Socio de prueba') } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }]);
	const soloChat = await directo([{ update: { name: `${RAIZ}/chats/${c.token}`, fields: { estado: sv('confirmada') } }, updateMask: { fieldPaths: ['estado'] } }]);
	paso('El socio no confirma escribiendo directo en la base (reserva, chat y datos de pago; ni el chat solo): 403', lote === 403 && soloChat === 403 && !(await existe(`reservas/${c.id}`)), `lote ${lote} · chat ${soloChat}`);

	// Transición: el servidor sin su cuenta de escritura (503) y las reglas de antes publicadas: el panel del socio
	// confirma por el camino de antes, como hoy.
	const reglas = async (archivo) => (await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-eq:securityRules', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync(`${REPO}/${archivo}`, 'utf8') }] } }) })).status;
	const escritura = async (activa) => (await fetch(`${SITIO}/__entorno/escritura?activa=${activa ? 1 : 0}`, { method: 'POST' })).text();
	const indicador = async () => { await ir(admin.p, '#/solicitudes', 3500); return (await admin.p.locator('.admin-main').innerText()).match(/Reservas por servidor: [^\n]+/)?.[0] || ''; };
	const activo = await indicador();
	const d = await sembrar('srv-d', iso(220));
	const e = await sembrar('srv-e', iso(250), 2, { indice: false });
	const puestas = await reglas('scripts/entorno/reglas-de-antes.rules');
	try {
		// Con la cuenta puesta y las reglas de antes: un chat de antes, sin su índice, lo responde el camino de antes.
		await ir(socio.p, `#/solicitudes/${e.codigo}`, 3500);
		await socio.p.locator('.card', { hasText: e.codigo }).first().locator('button', { hasText: 'No se dio' }).click();
		await espera(800);
		const sinIndice = delServidor(socio.p);
		await socio.p.locator('.modal button', { hasText: 'Fechas no disponibles' }).click();
		const r8 = await sinIndice;
		await espera(3000);
		paso('Transición: un chat de antes sin índice (reglas de antes, cuenta puesta): el servidor no adivina y el socio responde por el camino de antes',
			r8.status === 409 && r8.caminoDeAntes === true && (await leer(`chats/${e.token}`)).fields?.estado?.stringValue === 'no', `${resp(r8)} · ${await avisos(socio.p)}`);
	} catch (err) { paso('Transición: chat de antes sin índice', false, err.message.slice(0, 160)); }
	await escritura(false);
	const apagado = await indicador();
	paso('Solicitudes le dice al administrador si las reservas van por el servidor', /activo/.test(activo) && /sin configurar/.test(apagado), `${activo} → ${apagado}`);
	try {
		await ir(socio.p, `#/solicitudes/${d.codigo}`, 3500);
		await socio.p.locator('.card', { hasText: d.codigo }).first().locator('button', { hasText: 'Confirmar' }).click();
		await espera(800);
		const sinCuenta = delServidor(socio.p);
		await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
		const r7 = await sinCuenta;
		await espera(4000);
		const rd = (await leer(`reservas/${d.id}`)).fields || {};
		paso('Transición: sin la cuenta de escritura (503) y con las reglas de antes, el socio confirma por el camino de antes', puestas === 200 && r7.status === 503 && rd.estado?.stringValue === 'confirmada'
			&& (await leer(`chats/${d.token}`)).fields?.estado?.stringValue === 'confirmada' && /Confirmada/.test(await socio.p.locator('.card', { hasText: d.codigo }).first().innerText()), `${resp(r7)} · reglas ${puestas} · ${await avisos(socio.p)}`);
		// Reglas nuevas y el servidor sin cuenta: el camino de antes ya no pasa y se dice por qué (no «no cuadra»).
		await reglas('firestore.rules');
		const hh = await sembrar('srv-h', iso(260));
		await ir(socio.p, `#/solicitudes/${hh.codigo}`, 3500);
		await socio.p.locator('.card', { hasText: hh.codigo }).first().locator('button', { hasText: 'No se dio' }).click();
		await espera(800);
		await socio.p.locator('.modal button', { hasText: 'Fechas no disponibles' }).click();
		await espera(3500);
		const aviso = await avisos(socio.p);
		paso('Reglas nuevas sin la cuenta de escritura: el socio ve «El servidor de reservas no está disponible», no un error crudo', /servidor de reservas no está disponible/.test(aviso) && !(await leer(`chats/${hh.token}`)).fields?.estado, aviso);
	} finally {
		await escritura(true);
		const nuevas = await reglas('firestore.rules');
		paso('Las reglas nuevas vuelven a quedar puestas en el emulador', nuevas === 200);
	}
}

// ---------------------------------------------------------------- 4e. Rentas vacacionales: la misma reserva para todos
// Rentas y Solicitudes escriben por admin/js/reservas.js: la reserva hecha a mano la ve el dueño y bloquea el calendario;
// cancelar en Rentas libera las fechas y avisa al cliente en su chat; una pestaña vieja no revive lo cancelado.
let otraPestana = null;
{
	const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
	const ocupadas = async () => (await (await fetch(`${SITIO}/api/disponibilidad?id=${idCasa}`)).json()).ocupadas || [];
	const ocupada = (rangos, f) => rangos.some((r) => r.desde <= f && f < r.hasta);
	const buscar = async (col, campo, valor) => (await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } } } }) })).json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), ...x.document.fields }));
	// Meses que hay que avanzar en Rentas para ver una fecha.
	const meses = (f) => (Number(f.slice(0, 4)) - Number(iso(0).slice(0, 4))) * 12 + Number(f.slice(5, 7)) - Number(iso(0).slice(5, 7));
	const alMes = async (p, f) => { for (let i = 0; i < meses(f); i++) { await p.locator('button[aria-label="Mes siguiente"]').click(); await espera(150); } };
	const nuevaManual = async (p, llegada, salida, huesped) => {
		await p.locator('button', { hasText: '+ Reserva' }).click();
		await espera(800);
		const m = p.locator('.modal.show');
		await m.locator('[name=propertyId]').selectOption(idCasa);
		await m.locator('[name=llegada]').fill(llegada);
		await m.locator('[name=salida]').fill(salida);
		await m.locator('[name=salida]').dispatchEvent('change');
		await espera(1200);
		await m.locator('[name=huesped]').fill(huesped);
		await m.locator('input[type=tel]').fill('5555 7777');
		await m.locator('[name=notas]').fill('NOTA INTERNA de la reserva');
		await m.locator('[name=costoSocio]').fill('777');
		await m.locator('[name=alojamiento]').fill('900');
		await m.locator('.modal-footer button', { hasText: 'Guardar' }).click();
		await espera(3000);
	};
	const cuentaDelDueno = async () => { await ir(socio.p, `#/mis-casas/${idCasa}`, 3000); return Number(((await socio.p.locator('.admin-main').innerText()).match(/(\d+) reservas? confirmadas?/) || [])[1] || 0); };
	const antes = await cuentaDelDueno();
	// Una reserva guardada antes de este cambio (con el teléfono del huésped y sin el dueño de la casa).
	const sv = (v) => ({ stringValue: v });
	await fetch(`${FS}/reservas/reserva-de-antes`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {
		propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'), estado: sv('pendiente'), llegada: sv(iso(200)), salida: sv(iso(202)), huesped: sv('Huésped de antes'),
		telefono: sv('+502 5555 8888'), notas: sv('NOTA vieja'), canal: sv('directo'), moneda: sv('USD') } }) });
	const l1 = iso(150), s1 = iso(153);
	await ir(admin.p, '#/rentas', 3000);
	const deAntes = (await leer('reservas/reserva-de-antes')).fields || {};
	const suContacto = (await leer(`properties/${idCasa}/privado/reserva-reserva-de-antes`)).fields || {};
	paso('Al abrir Rentas, una reserva de antes pasa el teléfono y las notas a privado y recibe el dueño de su casa', deAntes.propietarioId?.stringValue === 'socio-prueba' && !('telefono' in deAntes) && !('notas' in deAntes)
		&& /8888/.test(suContacto.telefono?.stringValue || '') && /NOTA vieja/.test(suContacto.notas?.stringValue || ''), Object.keys(deAntes).join());
	await nuevaManual(admin.p, l1, s1, 'Pedro Manual');
	const m1 = (await buscar('reservas', 'huesped', 'Pedro Manual'))[0] || {};
	const contacto = m1.id ? (await leer(`properties/${idCasa}/privado/reserva-${m1.id}`)).fields || {} : {};
	paso('Reserva hecha a mano en Rentas: lleva el dueño de la casa, sin teléfono ni notas (van aparte, en privado)', m1.propietarioId?.stringValue === 'socio-prueba' && !('telefono' in m1) && !('notas' in m1)
		&& /7777/.test(contacto.telefono?.stringValue || '') && /NOTA INTERNA/.test(contacto.notas?.stringValue || ''), await avisos(admin.p));
	paso('Esa reserva bloquea sus fechas en la casa y en el calendario público', (await reservadas()).includes(l1) && ocupada(await ocupadas(), l1));
	const despues = await cuentaDelDueno();
	const contactoAjeno = await socio.p.evaluate(async ([casa, id]) => {
		const m = await import('/admin/js/firebase.js');
		return m.getDoc(m.doc(m.db, 'properties', casa, 'privado', `reserva-${id}`)).then(() => 'leyó', (e) => e.code);
	}, [idCasa, m1.id || 'x']);
	paso('El dueño ve la reserva hecha en Rentas en su panel, pero no el teléfono ni las notas del huésped', despues === antes + 1 && contactoAjeno === 'permission-denied', `${antes} → ${despues} · ${contactoAjeno}`);
	// Una segunda pestaña de Rentas abierta desde antes (todavía cree confirmada la de Pedro).
	otraPestana = await entrar('admin');
	await ir(otraPestana.p, '#/rentas', 3000);
	await alMes(otraPestana.p, l1);
	// En la primera se cancela.
	await ir(admin.p, '#/rentas', 3000);
	await alMes(admin.p, l1);
	await admin.p.locator('tr', { hasText: 'Pedro Manual' }).first().click();
	await espera(1500);
	await admin.p.locator('.modal.show [name=estado]').selectOption('cancelada');
	await admin.p.locator('.modal.show .modal-footer button', { hasText: 'Guardar' }).click();
	await espera(3000);
	paso('Cancelar en Rentas una reserva hecha a mano libera sus fechas en la casa y en el calendario público', !(await reservadas()).includes(l1) && !ocupada(await ocupadas(), l1), await avisos(admin.p));
	// La pestaña vieja guarda la de Pedro como la tenía (confirmada) y crea otra: lo cancelado no revive.
	await otraPestana.p.locator('tr', { hasText: 'Pedro Manual' }).first().click();
	await espera(1500);
	await otraPestana.p.locator('.modal.show .modal-footer button', { hasText: 'Guardar' }).click();
	await espera(2500);
	const rechazo = await avisos(otraPestana.p);
	await otraPestana.p.locator('.modal.show .btn-close').click().catch(() => {});
	await espera(700);
	const l2 = iso(160);
	await nuevaManual(otraPestana.p, l2, iso(162), 'Rosa Manual');
	const r = await reservadas();
	paso('Dos pestañas: la vieja no revive una reserva cancelada (ni al guardarla ni al crear otra)', /cambió/.test(rechazo) && !r.includes(l1) && r.includes(l2)
		&& (await buscar('reservas', 'huesped', 'Pedro Manual'))[0]?.estado?.stringValue === 'cancelada', rechazo);
	// Una reserva de la web, confirmada por el socio, que el administrador cancela desde Rentas.
	await tercero.p.goto(`${SITIO}${ficha}`);
	await espera(1500);
	for (let i = 0; i < 3; i++) { await tercero.p.locator('.vac-cal-next').click(); await espera(300); }
	const libres4 = () => tercero.p.locator('.vac-cal-cuerpo button:not([aria-disabled=true])');
	await libres4().nth(5).click();
	await libres4().nth(7).click();
	await tercero.p.fill('.vac-card [name=nombre]', 'Marta Cuarta');
	await tercero.p.fill('.vac-card [name=telefono]', '5555 4321');
	await tercero.p.fill('.vac-card [name=email]', 'marta@example.com');
	await tercero.p.locator('.vac-card [name=huespedes]').selectOption('2');
await tercero.p.locator('.vac-card button[type=submit]').click();
	await tercero.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
	await espera(1500);
	const codigo4 = (await tercero.p.locator('[data-out="codigo"]').innerText().catch(() => '')).trim();
	const token4 = (tercero.p.url().match(/#(\w+)/) || [])[1] || '';
	const llegada4 = (await leer(`chats/${token4}`)).fields?.llegada?.stringValue || '';
	await ir(socio.p, `#/solicitudes/${codigo4}`, 3500);
	await socio.p.locator('.card', { hasText: codigo4 }).first().locator('button', { hasText: 'Confirmar' }).click();
	await espera(800);
	const confirmo4 = delServidor(socio.p);
	await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
	const r6 = await confirmo4;
	await espera(3000);
	const ocupada4 = porServidor(r6, 'confirmar') && Boolean(llegada4) && (await reservadas()).includes(llegada4);
	await ir(admin.p, '#/rentas', 3000);
	await alMes(admin.p, llegada4 || iso(0));
	await admin.p.locator('tr', { hasText: 'Marta' }).filter({ hasText: 'Confirmada' }).first().click();
	await espera(1500);
	await admin.p.locator('.modal.show [aria-label="Cancelar reserva"]').click();
	await espera(800);
	await admin.p.locator('.modal.show button', { hasText: 'Cliente canceló' }).click();
	await espera(4000);
	const chat4 = (await leer(`chats/${token4}`)).fields || {};
	const lead4 = (await buscar('leads', 'reserva.codigo', codigo4))[0] || {};
	await tercero.p.reload();
	await espera(2500);
	paso('Cancelar en Rentas una reserva de la web: fechas libres, la solicitud y el chat dicen «cancelada» y el cliente lo ve', ocupada4 && !(await reservadas()).includes(llegada4) && chat4.estado?.stringValue === 'cancelada'
		&& lead4.solicitud?.mapValue?.fields?.estado?.stringValue === 'cancelada' && /cancelada/i.test(await tercero.p.locator('.vac-chat-sello').innerText()) && /se canceló/.test(await tercero.p.locator('.vac-chat-mensajes').innerText()), `${codigo4} ${llegada4} ${await avisos(admin.p)}`);
}

// ---------------------------------------------------------------- 4d. El control de cada hora (lo que el socio deja sin responder)
{
	const hace = (min) => ({ timestampValue: new Date(Date.now() - min * 60_000).toISOString() });
	const sv = (v) => ({ stringValue: v });
	const poner = (ruta, fields) => fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
	const hoy = new Date().toISOString().slice(0, 10), manana = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
	// Una solicitud sin responder (5 noches, como las de verdad) hace 2 h 30 min y un chat donde el cliente escribió hace 2 h 30 min.
	await poner('leads/vieja', { nombre: sv('Rita Vieja'), telefono: sv('+502 5555 1111'), propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'), propietarioId: sv('socio-prueba'), createdAt: hace(150),
		reserva: { mapValue: { fields: { codigo: sv('EQ-VIEJA'), llegada: sv(hoy), salida: sv(manana), noches: { integerValue: '5' }, huespedes: { integerValue: '2' }, moneda: sv('USD'), total: { doubleValue: 300 } } } } });
	await poner('chats/TokenDelChatSinResponder1234', { codigo: sv('EQ-MUDO'), nombre: sv('Rita'), propertyTitulo: sv('Casa de prueba Monterrico'), propietarioId: sv('socio-prueba'), llegada: sv(hoy), salida: sv(manana), noches: { integerValue: '5' }, huespedes: { integerValue: '2' }, moneda: sv('USD'), total: { doubleValue: 300 }, createdAt: hace(200) });
	await poner('chats/TokenDelChatSinResponder1234/mensajes/m1', { de: sv('cliente'), texto: sv('¿Hay alguien?'), createdAt: hace(150) });
	// La solicitud que el socio respondió «No se dio» (codigo2): ahora esas mismas fechas aparecen bloqueadas en la casa.
	const no = (await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'leads' }], where: { fieldFilter: { field: { fieldPath: 'reserva.codigo' }, op: 'EQUAL', value: sv(codigo2) } } } }) }).then((x) => x.json()))[0]?.document?.fields?.reserva?.mapValue?.fields;
	const casaAhora = await leer(`properties/${idCasa}`);
	const antes = casaAhora.fields.vacacional.mapValue.fields.bloqueos?.arrayValue?.values || [];
	await fetch(`${FS}/properties/${idCasa}?updateMask.fieldPaths=vacacional.bloqueos`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: [...antes, { mapValue: { fields: { desde: no.llegada, hasta: no.salida, motivo: sv('Otra reserva') } } }] } } } } } } }) });
	const control = () => execFileSync(process.execPath, ['--import', './scripts/entorno/red-local.mjs', '-e', "import('./netlify/functions/solicitudes-sin-respuesta.mjs').then((m) => m.default())"], { cwd: `${DIR}/sitio`, stdio: 'pipe', env: { ...process.env, CORREOS: `${DIR}/correos.jsonl` } });
	// Antes del bloqueo: otra solicitud de la web confirmada en esas mismas fechas es el camino normal y no se avisa.
	const conAlerta = () => readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter((l) => /cerrada\(s\) con fechas ocupadas/.test(l) && l.includes(codigo2)).length;
	// (Solo la de codigo2: una cancelada «Cliente canceló» del recorrido con fechas ocupadas después también avisa, y está bien.)
	await fetch(`${FS}/properties/${idCasa}?updateMask.fieldPaths=vacacional.bloqueos`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: antes } } } } } } }) });
	await poner('reservas/web-mismas-fechas', { propertyId: sv(idCasa), llegada: no.llegada, salida: no.salida, estado: sv('confirmada'), leadId: sv('otra-solicitud'), codigo: sv('EQ-OTRA') });
	control();
	paso('Control de cada hora: otra reserva de la web en las mismas fechas de un «No se dio» no se avisa (es el camino normal)', conAlerta() === 0);
	await fetch(`${FS}/reservas/web-mismas-fechas`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
	await fetch(`${FS}/properties/${idCasa}?updateMask.fieldPaths=vacacional.bloqueos`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: [...antes, { mapValue: { fields: { desde: no.llegada, hasta: no.salida, motivo: sv('Otra reserva') } } }] } } } } } } }) });
	control();
	// Otra hora: la de «No se dio» ya se avisó y no se repite.
	control();
	await fetch(`${FS}/properties/${idCasa}?updateMask.fieldPaths=vacacional.bloqueos`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: antes } } } } } } }) });
}

// ---------------------------------------------------------------- 5. Lo que ve el equipo y los correos
await ir(admin.p, `#/solicitudes/${codigo}`, 3500);
paso('El administrador sí ve el nombre completo del cliente', /Ana Prueba/.test(await admin.p.locator('.admin-main').innerText()));
const correos = readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const para = (c) => (c.to || []).map((t) => t.email_address?.address || t).join(',');
const resumen = correos.map((c) => `${para(c)} ← ${c.subject}`);
paso('Correo al socio por la solicitud nueva', resumen.some((r) => /socio@example\.com ← Nueva solicitud/.test(r)));
paso('Correo al cliente con su enlace', resumen.some((r) => /ana@example\.com ← Tu solicitud/.test(r)));
paso('Correo al cliente con la confirmación (datos de pago)', resumen.some((r) => /ana@example\.com ← .*confirmada/.test(r)));
paso('Correo al socio cuando el cliente adjunta su comprobante', resumen.some((r) => /socio@example\.com ← .*comprobante/.test(r)));
paso('Correo al cliente cuando el socio cancela', resumen.some((r) => /marta@example\.com ← .*cancelada/.test(r)));
paso('Correo al equipo cuando el socio cancela (sale del servidor)', resumen.some((r) => /equipo@example\.com ← .*el socio canceló/.test(r)));
const alerta = correos.find((c) => /^Reservas:/.test(c.subject || ''));
paso('Control de cada hora: correo al equipo con lo que el socio dejó sin responder', Boolean(alerta) && para(alerta) === 'equipo@example.com' && /EQ-VIEJA/.test(JSON.stringify(alerta)) && /EQ-MUDO/.test(JSON.stringify(alerta)), alerta?.subject || 'no salió');
const conBloqueo = correos.filter((c) => /cerrada\(s\) con fechas ocupadas/.test(c.subject || '') && JSON.stringify(c).includes(codigo2));
// La cancelada «Cliente canceló» del servidor (EQ-SRV-A) cae en las fechas de una reserva hecha a mano en Rentas (la de
// antes, sin solicitud): también es la señal de un cliente que se cerró por fuera, y avisa.
paso('Control de cada hora: una reserva cancelada «Cliente canceló» con una reserva a mano en esas fechas también avisa', correos.some((c) => /cerrada\(s\) con fechas ocupadas/.test(c.subject || '') && JSON.stringify(c).includes('EQ-SRV-A')));
paso('Control de cada hora: avisa una sola vez que una solicitud «No se dio» tiene ahora esas fechas bloqueadas', conBloqueo.length === 1 && JSON.stringify(conBloqueo[0]).includes(codigo2), conBloqueo.map((c) => c.subject).join(' | ') || 'no salió');
paso('Ese correo lleva al panel, no al WhatsApp del cliente', Boolean(alerta) && !/wa\.me/.test(JSON.stringify(alerta)) && /admin\/#\/solicitudes\/EQ-VIEJA/.test(JSON.stringify(alerta)));
paso('Correo al cliente cuando la reserva no se da', resumen.some((r) => /luis@example\.com ← .*no se concretó/.test(r)));
paso('Correo al cliente con el pago recibido (datos de llegada)', resumen.some((r) => /ana@example\.com ← .*pago recibido/.test(r)));
paso('Ningún correo lleva el teléfono ni el correo de la otra parte', !correos.some((c) => /305 555 1234|5555 0001/.test(JSON.stringify(c)) || (para(c).includes('socio@') && /ana@example/.test(JSON.stringify({ ...c, to: '' })))));

// ---------------------------------------------------------------- 6. El asesor (no administrador)
const asesor = await entrar('asesor');
await ir(asesor.p, '#/propiedades/nuevo');
const opciones = await campo(asesor.p, 'propietarioId').locator('option').allInnerTexts();
paso('El asesor abre la ficha de un inmueble y ve solo sus propietarios', opciones.some((o) => /Dueño del asesor/.test(o)) && !opciones.some((o) => /Socio de prueba/.test(o)), opciones.join(', '));
await ir(asesor.p, '#/solicitudes');
paso('El asesor no puede abrir Solicitudes de otros', !/Ana Prueba/.test(await asesor.p.locator('.admin-main').innerText().catch(() => '')));

// ---------------------------------------------------------------- 7. «Nueva propiedad» desde la ficha del dueño
{
	const propia = async (persona, ruta, datos, archivo) => {
		await ir(persona.p, ruta);
		await persona.p.locator('button', { hasText: 'Agregar propiedad' }).click();
		await espera(800);
		await persona.p.screenshot({ path: `${CAPTURAS}/${archivo}-selector.png` });
		await persona.p.locator('.modal.show button', { hasText: 'Nueva propiedad' }).click();
		await espera(2500);
		const m = persona.p.locator('.modal.show');
		for (const [k, v] of Object.entries(datos)) await campo(m, k).fill(v);
		await persona.p.screenshot({ path: `${CAPTURAS}/${archivo}.png` });
		const lado = await persona.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		await m.locator('.modal-footer button', { hasText: 'Guardar' }).click();
		await espera(7000);
		const id = ((await leer(`propietarios/${ruta.split('/').pop()}`)).fields?.propiedades?.arrayValue?.values || []).pop()?.mapValue?.fields?.propertyId?.stringValue || '';
		const ficha = await persona.p.locator('.list-field-item').last().locator('.prop-titulo').innerText().catch(() => '');
		await persona.p.locator('.list-field').scrollIntoViewIfNeeded();
		await persona.p.screenshot({ path: `${CAPTURAS}/${archivo}-ficha.png` });
		const lado2 = await persona.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		return { id, lado: Math.max(lado, lado2), ficha, casa: id ? (await leer(`properties/${id}`)).fields || {} : {} };
	};
	await admin.p.setViewportSize({ width: 390, height: 844 });
	const a = await propia(admin, '#/propietarios/socio-prueba', { titulo: 'Casa del lago (prueba)', zona: 'Amatitlán', 'socio.precioBase': '80', descripcion: 'REGISTRO DE PRUEBA. Casa del lago.' }, 'nueva-propiedad-390');
	await admin.p.setViewportSize({ width: 1280, height: 900 });
	const privado = a.id ? (await leer(`properties/${a.id}/privado/socio`)).fields || {} : {};
	const dueno = (await leer('propietarios/socio-prueba')).fields || {};
	paso('El socio recibe una casa por noche nueva sin salir de su ficha', a.casa.operacion?.stringValue === 'vacacional' && a.casa.propietarioId?.stringValue === 'socio-prueba'
		&& a.casa.publicado?.booleanValue === false && Number(a.casa.precio?.doubleValue || a.casa.precio?.integerValue) > 80 && Boolean(a.casa.codigo?.stringValue) && Boolean(a.casa.slug?.stringValue), await avisos(admin.p));
	paso('Su precio de socio queda en privado y la casa en la lista del dueño, ya guardada', Number(privado.precioBase?.doubleValue || privado.precioBase?.integerValue) === 80 && JSON.stringify(dueno.propiedades || {}).includes(a.id || 'x'));
	paso('Sin scroll de lado en la ventana «Nueva propiedad» (390 px)', a.lado <= 0);
	paso('La casa elegida se ve en su ficha corta', /Casa del lago/.test(a.ficha), a.ficha);
	// Es la misma ficha de Propiedades (una sola forma de crear y editar): desde aquí también se corrige y se elimina.
	const lapiz = () => admin.p.locator('.list-field-item').last().locator('button[aria-label^="Editar la propiedad"], button[title^="Editar la propiedad"]').first();
	await lapiz().click();
	await espera(3000);
	const conFotos = await admin.p.locator('.modal.show [data-campo="fotos"]').count();
	await campo(admin.p.locator('.modal.show'), 'titulo').fill('Casa del lago corregida (prueba)');
	await admin.p.locator('.modal.show .modal-footer button', { hasText: 'Guardar' }).click();
	await espera(7000);
	const corregida = await admin.p.locator('.list-field-item').last().locator('.prop-titulo').innerText().catch(() => '');
	paso('Desde la ficha de la persona se corrige la casa en su ficha completa (con fotos)', conFotos === 1 && /corregida/.test(corregida) && /corregida/.test((await leer(`properties/${a.id}`)).fields?.titulo?.stringValue || ''), `${conFotos} ${corregida}`);
	await admin.p.screenshot({ path: `${CAPTURAS}/ficha-en-ventana-1280.png` });
	// Una casa creada por error se elimina desde ahí mismo: se crea otra y se borra.
	await admin.p.locator('button', { hasText: 'Agregar propiedad' }).click();
	await espera(800);
	await admin.p.locator('.modal.show button', { hasText: 'Nueva propiedad' }).click();
	await espera(3000);
	for (const [k, v] of Object.entries({ titulo: 'Casa creada por error (prueba)', zona: 'Amatitlán', 'socio.precioBase': '50', descripcion: 'REGISTRO DE PRUEBA.' })) await campo(admin.p.locator('.modal.show'), k).fill(v);
	await admin.p.locator('.modal.show .modal-footer button', { hasText: 'Guardar' }).click();
	await espera(7000);
	const idError = ((await leer('propietarios/socio-prueba')).fields?.propiedades?.arrayValue?.values || []).pop()?.mapValue?.fields?.propertyId?.stringValue || '';
	await lapiz().click();
	await espera(3000);
	await admin.p.locator('.modal.show .modal-footer button', { hasText: 'Eliminar' }).click();
	await espera(800);
	await admin.p.locator('.modal.show', { hasText: '¿Eliminar' }).locator('button', { hasText: 'Eliminar' }).last().click();
	await espera(6000);
	const quedo = await fetch(`${FS}/properties/${idError}`, { headers: { Authorization: 'Bearer owner' } });
	const enLaLista = JSON.stringify((await leer('propietarios/socio-prueba')).fields?.propiedades || {});
	paso('Una casa creada por error se elimina desde la ficha de la persona y sale de su lista', Boolean(idError) && idError !== a.id && quedo.status === 404 && !enLaLista.includes(idError) && enLaLista.includes(a.id), `${quedo.status}`);
	const seVe = (persona, texto) => persona.p.locator('.form-section', { hasText: texto }).first().isVisible().catch(() => false);
	const enFicha = async (persona, campos) => { const v = []; for (const c of campos) if (await persona.p.locator(`[data-campo="${c}"]`).isVisible()) v.push(c); return v; };
	const delAcuerdo = ['exclusiva', 'comisionPct', 'comisionRentaMeses', 'impuestoVenta', 'contrato'];
	paso('Al socio (solo casas por noche) se le piden sus datos de pago, sin asesor ni acuerdo en su ficha', (await enFicha(admin, [...delAcuerdo, 'agentId'])).length === 0 && await admin.p.locator('[data-campo="datosPago"]').isVisible());
	const idDueno = 'dueno-del-asesor';
	const b = await propia(asesor, `#/propietarios/${idDueno}`, { titulo: 'Apartamento zona 10 (prueba)', zona: 'Zona 10', precio: '150000', descripcion: 'REGISTRO DE PRUEBA. Apartamento en zona 10.' }, 'nueva-propiedad-1280');
	paso('El asesor crea una casa en venta para su propietario, a su nombre', b.casa.operacion?.stringValue === 'venta' && b.casa.propietarioId?.stringValue === idDueno
		&& Boolean(b.casa.agentId?.stringValue) && b.casa.publicado?.booleanValue === false && !('vacacional' in b.casa), await avisos(asesor.p));
	paso('La exclusiva, la comisión y los impuestos ya no se piden en la ficha de la persona', (await enFicha(asesor, delAcuerdo)).length === 0);
	// Se acuerdan en cada inmueble: el asesor de la casa los llena en su ficha y quedan en privado.
	await ir(asesor.p, `#/propiedades/${b.id}`);
	const enCasa = await enFicha(asesor, ['acuerdo.exclusiva', 'acuerdo.comisionPct', 'acuerdo.impuestoVenta', 'acuerdo.comisionRentaMeses']);
	await asesor.p.locator('[data-campo="acuerdo.exclusiva"] input').check();
	await campo(asesor.p, 'acuerdo.exclusivaFin').fill('2027-03-31');
	await campo(asesor.p, 'acuerdo.comisionPct').fill('4.5');
	await campo(asesor.p, 'descripcion').fill('REGISTRO DE PRUEBA. Apartamento de prueba en zona 10.');
	await guardar(asesor.p);
	const suAcuerdo = (await leer(`properties/${b.id}/privado/acuerdo`)).fields || {};
	const publica = Object.keys((await leer(`properties/${b.id}`)).fields || {}).join();
	paso('El acuerdo de una casa en venta se llena en su ficha (sin comisión de renta) y se guarda en privado, no en la casa', enCasa.join() === 'acuerdo.exclusiva,acuerdo.comisionPct,acuerdo.impuestoVenta'
		&& suAcuerdo.exclusiva?.booleanValue === true && suAcuerdo.exclusivaFin?.stringValue === '2027-03-31' && Number(suAcuerdo.comisionPct?.doubleValue ?? suAcuerdo.comisionPct?.integerValue ?? suAcuerdo.comisionPct?.stringValue) === 4.5
		&& /titulo/.test(publica) && !/exclusiva|comision|impuesto|contrato|acuerdo/i.test(publica), `${enCasa.join()} ${await avisos(asesor.p)}`);
	// La cotización toma la comisión acordada para ese inmueble (4.5 %), no un 5 % fijo.
	await ir(asesor.p, '#/cotizaciones/nueva', 3500);
	const honorario = () => asesor.p.getByLabel(/^Honorario\s*\(%\)/).first().inputValue().catch(() => '');
	const general = await honorario();
	await asesor.p.locator('.cot-sel input[type=search]').nth(1).fill('zona 10');
	await espera(600);
	await asesor.p.locator('.cot-sel-op', { hasText: 'Apartamento zona 10' }).first().click();
	await espera(2000);
	const acordado = await honorario();
	paso('Una cotización nueva empieza con la comisión general y, al elegir el inmueble, toma la acordada para él', general === '5' && acordado === '4.5', `${general} → ${acordado}`);
	// El selector muestra solo la categoría del dueño, con una ficha por inmueble, y el buscador encuentra.
	const abrirSelector = async (ruta) => {
		await ir(admin.p, ruta);
		await admin.p.locator('button', { hasText: 'Agregar propiedad' }).click();
		await espera(800);
		return admin.p.locator('.modal.show .list-group-item .prop-zona').allInnerTexts();
	};
	// Una sola ficha por persona: el socio ve sus casas por noche y, cambiando de pestaña, le agrego una en venta.
	const delSocio = await abrirSelector('#/propietarios/socio-prueba');
	await admin.p.locator('.modal.show .btn-group button', { hasText: 'Venta' }).click();
	await espera(300);
	const enVenta = await admin.p.locator('.modal.show .list-group-item .prop-zona').allInnerTexts();
	await admin.p.screenshot({ path: `${CAPTURAS}/selector-pestanas-1280.png` });
	paso('El selector abre al socio en «Por noche» y cada pestaña (venta, renta, por noche) muestra solo su categoría', !delSocio.some((x) => /Venta|Renta ·/.test(x)) && enVenta.length > 0 && enVenta.every((x) => /Venta/.test(x)) && await admin.p.locator('.modal.show .btn-group button').count() === 3, `${delSocio.join(' | ')} // ${enVenta.join(' | ')}`);
	await admin.p.locator('.modal.show .list-group-item', { hasText: 'Mirabel' }).first().click();
	await espera(600);
	const titulos = await admin.p.locator('.list-field .prop-zona').allInnerTexts();
	paso('La misma ficha muestra sus casas por noche y la de venta, y pide datos de pago y el asesor que la atiende', titulos.some((x) => /vacacional/i.test(x)) && titulos.some((x) => /Venta/.test(x))
		&& await admin.p.locator('[data-campo="agentId"]').isVisible() && await admin.p.locator('[data-campo="datosPago"]').isVisible(), titulos.join(' | '));
	await admin.p.locator('.list-field').scrollIntoViewIfNeeded();
	await admin.p.screenshot({ path: `${CAPTURAS}/ficha-dos-categorias-1280.png` });
	const delDueno = await abrirSelector('#/propietarios/dueno-del-asesor');
	// «Agregar propiedad» abre el selector de una vez; cerrarlo sin elegir no deja un renglón vacío.
	await admin.p.locator('.modal.show .btn-close').click();
	await espera(700);
	const renglones = await admin.p.locator('.list-field-item').count();
	paso('Cerrar el selector sin elegir no deja un renglón vacío', await admin.p.locator('.list-field-item button', { hasText: 'Elegir propiedad' }).count() === 0, `${renglones} renglones`);
	await admin.p.locator('button', { hasText: 'Agregar propiedad' }).click();
	await espera(800);
	await admin.p.locator('.modal.show input[type=search]').fill('mirabel');
	await espera(300);
	const halladas = await admin.p.locator('.modal.show .list-group-item .prop-titulo').allInnerTexts();
	await admin.p.screenshot({ path: `${CAPTURAS}/selector-1280.png` });
	await admin.p.locator('.modal.show .list-group-item', { hasText: 'Mirabel' }).first().click().catch(() => {});
	await espera(600);
	paso('Al propietario le ofrece solo venta y renta; busca y al tocar una ficha queda elegida', delDueno.length > 0 && !delDueno.some((x) => /vacacional/i.test(x)) && halladas.length === 1
		&& /Mirabel/.test(await admin.p.locator('.list-field-item').last().locator('.prop-titulo').innerText().catch(() => '')), halladas.join(' | '));
	// Acuerdos anotados antes en la persona: al abrir Propietarios pasan a cada inmueble, sin escribir encima ni perder nada.
	{
		const dueno = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
		const sv = (v) => ({ stringValue: v }), bv = (v) => ({ booleanValue: v }), nv = (v) => ({ doubleValue: v });
		const poner = (ruta, fields) => fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: dueno, body: JSON.stringify({ fields }) });
		const lista = (ids) => ({ arrayValue: { values: ids.map((x) => ({ mapValue: { fields: { propertyId: sv(x) } } })) } });
		const pronto = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
		const viejo = { exclusiva: bv(true), exclusivaFin: sv(pronto), comisionPct: nv(4), comisionRentaMeses: nv(2), impuestoVenta: sv('iva'), comisionRegimen: sv('pequeno') };
		await poner('properties/leg-venta', { titulo: sv('Casa heredada en venta'), operacion: sv('venta'), propietarioId: sv('legado-dos'), publicado: bv(true), slug: sv('leg-venta') });
		await poner('properties/leg-renta', { titulo: sv('Apartamento heredado en renta'), operacion: sv('renta'), propietarioId: sv('legado-dos'), publicado: bv(false) });
		await poner('properties/leg-propia', { titulo: sv('Casa con acuerdo propio'), operacion: sv('venta'), propietarioId: sv('legado-dos'), publicado: bv(false) });
		await poner('properties/leg-propia/privado/acuerdo', { exclusiva: bv(false), comisionPct: nv(9) });
		await poner('propietarios/legado-dos', { nombre: sv('Dueña con acuerdo de antes'), tipo: sv('propietario'), agentId: sv(''), propiedades: lista(['leg-venta', 'leg-renta', 'leg-propia']), ...viejo });
		await poner('propietarios/legado-solo', { nombre: sv('Dueño de antes sin casas'), tipo: sv('propietario'), agentId: sv(''), propiedades: lista([]), exclusiva: bv(true), exclusivaFin: sv(pronto), comisionPct: nv(3) });
		// Dos casos delicados: (1) el asesor guarda una casa suya cuyo dueño lleva otro (no lo ve) ANTES de que el
		// acuerdo de antes haya pasado: no debe dejar un acuerdo vacío que tape el del dueño; (2) una casa enlazada
		// solo desde la lista del dueño (sin «propietarioId») no pierde su acuerdo al guardarla.
		const casa = (extra) => ({ tipo: sv('casa'), moneda: sv('USD'), zona: sv('Zona 14'), ciudad: sv('Guatemala'), descripcion: sv('REGISTRO DE PRUEBA.'), publicado: bv(false), precio: nv(100000), ...extra });
		await poner('properties/leg-ajena', casa({ titulo: sv('Casa de dueño ajeno'), slug: sv('leg-ajena'), codigo: sv('LEG-1'), operacion: sv('venta'), propietarioId: sv('legado-ajeno'), agentId: sv('asesor-prueba') }));
		await poner('propietarios/legado-ajeno', { nombre: sv('Dueño que lleva otro'), tipo: sv('propietario'), agentId: sv(''), propiedades: lista(['leg-ajena']), exclusiva: bv(true), exclusivaFin: sv('2027-05-05'), comisionPct: nv(6) });
		await poner('properties/leg-lista', casa({ titulo: sv('Casa enlazada solo en la lista'), slug: sv('leg-lista'), codigo: sv('LEG-2'), operacion: sv('venta') }));
		await poner('properties/leg-lista/privado/acuerdo', { exclusiva: bv(false), comisionPct: nv(7) });
		await poner('propietarios/legado-lista', { nombre: sv('Dueño de la casa en su lista'), tipo: sv('propietario'), agentId: sv(''), propiedades: lista(['leg-lista']) });
		const guardarCasa = async (persona, id) => { await ir(persona.p, `#/propiedades/${id}`); await campo(persona.p, 'zona').fill('Zona 15'); await guardar(persona.p); return avisos(persona.p); };
		const avisoAsesor = await guardarCasa(asesor, 'leg-ajena');
		const ajenaAntes = await fetch(`${FS}/properties/leg-ajena/privado/acuerdo`, { headers: dueno });
		const guardoAsesor = (await (await fetch(`${FS}/properties/leg-ajena`, { headers: dueno })).json()).fields?.zona?.stringValue === 'Zona 15';
		await ir(admin.p, '#/propietarios', 6000);
		const f = async (ruta) => (await leer(ruta)).fields || {};
		const num = (x) => Number(x?.doubleValue ?? x?.integerValue ?? NaN);
		const [venta, renta, propia, dos, solo] = await Promise.all([f('properties/leg-venta/privado/acuerdo'), f('properties/leg-renta/privado/acuerdo'), f('properties/leg-propia/privado/acuerdo'), f('propietarios/legado-dos'), f('propietarios/legado-solo')]);
		paso('El acuerdo de antes pasa a cada inmueble con lo que le toca (venta: % e impuestos; renta: meses)', venta.exclusiva?.booleanValue === true && venta.exclusivaFin?.stringValue === pronto && num(venta.comisionPct) === 4 && venta.impuestoVenta?.stringValue === 'iva' && !('comisionRentaMeses' in venta)
			&& renta.exclusiva?.booleanValue === true && num(renta.comisionRentaMeses) === 2 && !('comisionPct' in renta) && !('impuestoVenta' in renta), JSON.stringify(Object.keys(venta)) + JSON.stringify(Object.keys(renta)));
		paso('No se escribe encima de un inmueble que ya tenía su acuerdo', num(propia.comisionPct) === 9 && propia.exclusiva?.booleanValue === false && !('exclusivaFin' in propia));
		paso('De la persona se borra lo que ya pasó a sus inmuebles; quien no tiene casas conserva lo suyo', !('exclusiva' in dos) && !('comisionPct' in dos) && !('impuestoVenta' in dos) && dos.nombre?.stringValue === 'Dueña con acuerdo de antes'
			&& solo.exclusiva?.booleanValue === true && num(solo.comisionPct) === 3, Object.keys(dos).join());
		const [ajena, ajeno] = await Promise.all([f('properties/leg-ajena/privado/acuerdo'), f('propietarios/legado-ajeno')]);
		paso('Guardar una casa cuyo dueño no veo no tapa su acuerdo: después pasa completo al inmueble', guardoAsesor && ajenaAntes.status === 404 && num(ajena.comisionPct) === 6 && ajena.exclusivaFin?.stringValue === '2027-05-05' && !('comisionPct' in ajeno), `${ajenaAntes.status} ${avisoAsesor}`);
		const avisoAdmin = await guardarCasa(admin, 'leg-lista');
		const enLista = await f('properties/leg-lista/privado/acuerdo');
		const suLista = JSON.stringify((await f('propietarios/legado-lista')).propiedades || {});
		paso('Guardar una casa enlazada solo desde la lista del dueño no borra su acuerdo ni la saca de su lista', num(enLista.comisionPct) === 7 && suLista.includes('leg-lista'), avisoAdmin);
		await ir(admin.p, '#/propietarios', 5000);
		const aviso = await admin.p.locator('.alert-warning:not(#aviso-reglas)').first().innerText().catch(() => '');
		paso('El aviso de exclusivas por vencer nombra cada inmueble', /Casa heredada en venta/.test(aviso) && /Apartamento heredado en renta/.test(aviso) && !/Casa con acuerdo propio/.test(aviso), aviso.slice(0, 160));
		const sinSesion = await fetch(`${FS}/properties/leg-venta`).then((r) => r.text());
		const privadoSinSesion = await fetch(`${FS}/properties/leg-venta/privado/acuerdo`);
		paso('Quien no tiene sesión no ve el acuerdo de una casa publicada', /Casa heredada/.test(sinSesion) && !/exclusiva|comisionPct/.test(sinSesion) && privadoSinSesion.status === 403, String(privadoSinSesion.status));
		await ir(admin.p, '#/inicio', 5000);
		// La campana (y su tarjeta en Inicio) avisa de las exclusivas: se mira la lista entera (la tarjeta muestra 5).
		await admin.p.evaluate(() => document.dispatchEvent(new CustomEvent('avisos')));
		await espera(3000);
		const listaAvisos = await admin.p.locator('.avisos-lista').evaluate((el) => el.textContent).catch(() => '');
		paso('Inicio tiene la tarjeta «Avisos» y la campana avisa de las exclusivas por vencer, con la casa', await admin.p.locator('.tarjeta-avisos').count() === 1
			&& /La exclusiva (vence|venció)/.test(listaAvisos) && /heredad/.test(listaAvisos), listaAvisos.slice(0, 200));
		await ir(admin.p, '#/propietarios/legado-solo');
		paso('La ficha de quien aún no tiene casas dice qué acuerdo quedó anotado', /exclusiva hasta \d\d\/\d\d\/\d{4}/.test(await admin.p.locator('.alert-info', { hasText: 'Acuerdo anotado' }).innerText().catch(() => '')));
		for (const r of ['properties/leg-ajena/privado/acuerdo', 'properties/leg-lista/privado/acuerdo', 'properties/leg-ajena', 'properties/leg-lista', 'propietarios/legado-ajeno', 'properties/leg-venta/privado/acuerdo', 'properties/leg-renta/privado/acuerdo', 'properties/leg-propia/privado/acuerdo', 'properties/leg-venta', 'properties/leg-renta', 'properties/leg-propia', 'propietarios/legado-lista', 'propietarios/legado-dos', 'propietarios/legado-solo']) await fetch(`${FS}/${r}`, { method: 'DELETE', headers: dueno });
	}
	// Ficha nueva: mientras no tenga casas no se le pide nada que dependa de ellas.
	await ir(admin.p, '#/propietarios/nuevo');
	const visibles = [];
	for (const c of ['agentId', 'comisionPct', 'datosPago', 'exclusiva', 'impuestoVenta']) if (await admin.p.locator(`[data-campo="${c}"]`).isVisible()) visibles.push(c);
	paso('A un dueño nuevo, sin casas todavía, no se le pide asesor, comisión, datos de pago, exclusiva ni impuestos', visibles.length === 0 && await admin.p.locator('[data-campo="nombre"]').isVisible(), visibles.join(', '));
	await admin.p.setViewportSize({ width: 390, height: 844 });
	await admin.p.screenshot({ path: `${CAPTURAS}/dueno-nuevo-390.png`, fullPage: true });
	await admin.p.setViewportSize({ width: 1280, height: 900 });
}

// ---------------------------------------------------------------- «Duplicar» una casa por noche
{
	await ir(admin.p, `#/propiedades/${idCasa}`, 3500);
	await delMenu(admin.p, 'Duplicar');
	await admin.p.waitForFunction((id) => /#\/propiedades\/[^/]+$/.test(location.hash) && !location.hash.endsWith(id), idCasa, { timeout: 15000 }).catch(() => {});
	const idCopia = (admin.p.url().match(/propiedades\/([^/?#]+)/) || [])[1] || '';
	const hay = idCopia && idCopia !== idCasa;
	const original = (await leer(`properties/${idCasa}`)).fields || {};
	const copia = hay ? (await leer(`properties/${idCopia}`)).fields || {} : {};
	const socioOriginal = (await leer(`properties/${idCasa}/privado/socio`)).fields || {};
	const socioCopia = hay ? (await leer(`properties/${idCopia}/privado/socio`)).fields || {} : {};
	const llegadaCopia = hay ? (await leer(`properties/${idCopia}/privado/llegada`)).fields || {} : {};
	const acuerdoCopia = hay ? await fetch(`${FS}/properties/${idCopia}/privado/acuerdo`, { headers: { Authorization: 'Bearer owner' } }) : { status: 0 };
	const lista = JSON.stringify((await leer('propietarios/socio-prueba')).fields?.propiedades || {});
	const valor = (f) => f?.stringValue ?? f?.integerValue ?? f?.doubleValue;
	const fallo = [
		!hay && 'sin copia',
		copia.publicado?.booleanValue !== false && 'publicada',
		(!valor(copia.slug) || valor(copia.slug) === valor(original.slug)) && 'misma URL',
		(!valor(copia.codigo) || valor(copia.codigo) === valor(original.codigo)) && 'mismo código',
		(copia.slugsAnteriores || copia.difusion || (copia.historialEstado?.arrayValue?.values || []).length !== 1) && 'arrastra historial',
		/Calle Real 12|13\.8912/.test(JSON.stringify(copia)) && 'dirección en lo público',
		!/Calle Real 12/.test(valor(llegadaCopia.direccion) || '') && 'sin llegada',
		(!Number(valor(socioCopia.precioBase)) || Number(valor(socioCopia.precioBase)) !== Number(valor(socioOriginal.precioBase))) && 'sin precio del socio',
		valor(socioOriginal.codigoSocio) !== 'CH-07' && 'la original sin su código del socio',
		valor(socioCopia.codigoSocio) && 'copió el código del socio',
		acuerdoCopia.status !== 404 && 'copió el acuerdo',
		(copia.vacacional?.mapValue?.fields?.reservadas?.arrayValue?.values || []).length > 0 && 'copió las noches reservadas',
		!lista.includes(idCopia || 'x') && 'no está en la lista del socio'
	].filter(Boolean);
	paso('«Duplicar» una casa por noche: borrador con URL y código propios, su privado copiado (sin el acuerdo) y en la lista del socio', fallo.length === 0, fallo.join(', '));
}

// ---------------------------------------------------------------- 8. Un solo panel por dueño
const duenos = [];
{
	const AUTH = 'http://127.0.0.1:9099';
	const dueno = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
	const lado = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	paso('El socio de antes entra como «Propietario»', (await socio.p.locator('.admin-user-role').innerText()) === 'Propietario');
	// a) El administrador le da acceso desde su ficha: cuenta nueva, su usuario y el correo para poner la contraseña.
	await ir(admin.p, '#/propietarios/dueno-mixto', 3000);
	const darBtn = admin.p.locator('#acceso-panel button', { hasText: 'Dar acceso' });
	await darBtn.waitFor({ timeout: 15000 }).catch(() => {});
	paso('Con las reglas nuevas, «Dar acceso» está habilitado', await darBtn.isEnabled().catch(() => false));
	await admin.p.locator('#portal-propietario').scrollIntoViewIfNeeded();
	await admin.p.screenshot({ path: `${PANEL}/acceso-sin-1280.png` });
	await admin.p.setViewportSize({ width: 390, height: 844 });
	await espera(700); // el menú lateral termina de esconderse
	await admin.p.locator('#acceso-panel').scrollIntoViewIfNeeded();
	await admin.p.screenshot({ path: `${PANEL}/acceso-sin-390.png` });
	await admin.p.setViewportSize({ width: 1280, height: 900 });
	await darBtn.click();
	await admin.p.locator('#acceso-panel', { hasText: 'Entra con mixta@example.com' }).waitFor({ timeout: 20000 }).catch(() => {});
	const usuarios = await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: dueno, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: 'mixta@example.com' } } } } }) })).json();
	const u = usuarios.find((x) => x.document)?.document?.fields || {};
	const codigos = (await (await fetch(`${AUTH}/emulator/v1/projects/demo-eq/oobCodes`)).json()).oobCodes || [];
	const oob = codigos.filter((c) => c.email === 'mixta@example.com' && c.requestType === 'PASSWORD_RESET').pop();
	paso('«Dar acceso» desde la ficha: crea su cuenta y su usuario (rol de dueño, su ficha) y le manda el correo para poner su contraseña',
		u.rol?.stringValue === 'socio' && u.propietarioId?.stringValue === 'dueno-mixto' && u.activo?.booleanValue === true && Boolean(oob), `${await avisos(admin.p)} · ${codigos.length} correos`);
	// El correo sale con el diseño de la empresa (netlify/functions/contrasena.mjs), con el enlace de Google de esa cuenta.
	const deAcceso = readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
		.filter((c) => JSON.stringify(c.to || '').includes('mixta@example.com') && c.subject === 'Crea o cambia tu contraseña').pop();
	paso('El correo para poner la contraseña sale con el diseño de la empresa, a su correo, con su enlace (en español)',
		Boolean(deAcceso) && /Crear mi contraseña/.test(deAcceso.htmlbody) && /#mode=resetPassword&amp;oobCode=/.test(deAcceso.htmlbody) && deAcceso.htmlbody.includes(oob?.oobCode || 'x'),
		deAcceso ? deAcceso.subject : 'no salió');
	await admin.p.locator('#portal-propietario').scrollIntoViewIfNeeded();
	await admin.p.screenshot({ path: `${PANEL}/acceso-con-1280.png` });
	await admin.p.setViewportSize({ width: 390, height: 844 });
	await espera(700); // el menú lateral termina de esconderse
	await admin.p.locator('#acceso-panel').scrollIntoViewIfNeeded();
	await admin.p.screenshot({ path: `${PANEL}/acceso-con-390.png` });
	const ladoAcceso = await lado(admin.p);
	await admin.p.setViewportSize({ width: 1280, height: 900 });
	paso('El bloque «Acceso al panel» sin scroll de lado a 390 px', ladoAcceso <= 0, String(ladoAcceso));
	// Mientras las reglas de antes sigan publicadas: a quien no tiene casas por noche no se le abre la entrada,
	// y Propietarios dice qué hacer y en qué orden.
	const viejas = await entrar('admin', { reglasViejas: true });
	duenos.push(['administrador con reglas de antes', viejas]);
	await ir(viejas.p, '#/propietarios', 3000);
	await viejas.p.locator('#aviso-reglas', { hasText: 'ya está al día' }).waitFor({ timeout: 30000 }).catch(() => {});
	const aviso = await viejas.p.locator('#aviso-reglas').innerText().catch(() => '');
	await viejas.p.screenshot({ path: `${PANEL}/reglas-viejas-aviso-1280.png` });
	await ir(viejas.p, '#/propietarios/dueno-del-asesor', 3500);
	const bloqueado = viejas.p.locator('#acceso-panel button', { hasText: 'Dar acceso' });
	await bloqueado.waitFor({ timeout: 15000 }).catch(() => {});
	const porque = await viejas.p.locator('#acceso-panel').innerText().catch(() => '');
	await viejas.p.locator('#portal-propietario').scrollIntoViewIfNeeded();
	await viejas.p.screenshot({ path: `${PANEL}/acceso-reglas-viejas-1280.png` });
	await viejas.p.setViewportSize({ width: 390, height: 844 });
	await espera(700); // el menú lateral termina de esconderse
	await viejas.p.locator('#acceso-panel').scrollIntoViewIfNeeded();
	await viejas.p.screenshot({ path: `${PANEL}/acceso-reglas-viejas-390.png` });
	paso('Con las reglas de antes: aviso en Propietarios con el orden, y «Dar acceso» deshabilitado (con el porqué) para un dueño sin casas por noche',
		/ya está al día/.test(aviso) && /publicar las reglas nuevas/.test(aviso) && /consola de Firebase/.test(aviso) && await bloqueado.isDisabled().catch(() => false) && /Primero hay que publicar las reglas nuevas/.test(porque), porque.replace(/\s+/g, ' ').slice(0, 120));
	await viejas.p.close();
	// La contraseña la pone ella, con el botón del correo: abre la página de la empresa en el panel (no la de Google).
	const enlaceCorreo = (deAcceso?.htmlbody.match(/href="([^"]*mode=resetPassword[^"]*)"/) || [])[1]?.replace(/&amp;/g, '&') || '';
	const mixta = await persona(390);
	await mixta.p.goto(enlaceCorreo.replace(/^https?:\/\/[^/]+/, SITIO));
	await mixta.p.locator('#clave-nueva').waitFor({ timeout: 15000 }).catch(() => {});
	const paginaClave = await mixta.p.locator('.auth-card').innerText().catch(() => '');
	await mixta.p.screenshot({ path: `${PANEL}/crear-contrasena-390.png`, fullPage: true });
	// Seguridad de la página: el código no queda en la barra ni en el historial, y no se le pasa a otros sitios.
	const urlAlAbrir = mixta.p.url();
	const sinReferer = await mixta.p.locator('meta[name="referrer"][content="no-referrer"]').count();
	// Una contraseña fácil de adivinar no se acepta (y el enlace sigue sirviendo).
	const conOjos = await mixta.p.locator('.auth-card [aria-label="Mostrar contraseña"]').count();
	await mixta.p.fill('#clave-nueva', 'corta-1');
	const enVivoCorta = await mixta.p.locator('.clave-regla.falta').count();
	await mixta.p.fill('#clave-nueva', 'aaaaaaaaaaaaaaaa');
	await mixta.p.fill('#clave-repite', 'aaaaaaaaaaaaaaaa');
	await mixta.p.locator('button', { hasText: 'Guardar y entrar' }).click();
	await espera(800);
	const debil = await mixta.p.locator('.auth-card [role="alert"]').innerText().catch(() => '');
	await mixta.p.fill('#clave-nueva', 'mixta-casa-del-lago');
	await mixta.p.fill('#clave-repite', 'mixta-casa-del-lago');
	await mixta.p.locator('button', { hasText: 'Guardar y entrar' }).click();
	await espera(800);
	const conCorreo = await mixta.p.locator('.auth-card [role="alert"]').innerText().catch(() => '');
	await mixta.p.fill('#clave-nueva', CLAVE);
	await mixta.p.fill('#clave-repite', CLAVE + 'x');
	await mixta.p.locator('button', { hasText: 'Guardar y entrar' }).click();
	await espera(500);
	const distintas = await mixta.p.locator('.auth-card [role="alert"]').innerText().catch(() => '');
	const igualesNo = await mixta.p.locator('.clave-regla.falta', { hasText: 'Las dos son iguales' }).count();
	paso('Página de contraseña: el código se borra de la barra al abrir, no se pasa a otros sitios, tiene ojito en los dos campos, avisa mientras se escribe y rechaza contraseñas cortas, fáciles, con el correo o distintas',
		!/oobCode/.test(urlAlAbrir) && sinReferer === 1 && conOjos === 2 && enVivoCorta >= 1 && igualesNo === 1 && /fácil de adivinar/.test(debil) && /no puede llevar tu correo/.test(conCorreo) && /no son iguales/.test(distintas),
		`${urlAlAbrir} · ojos ${conOjos} · en vivo ${enVivoCorta}/${igualesNo} · ${debil} · ${conCorreo} · ${distintas}`);
	await mixta.p.fill('#clave-repite', CLAVE);
	await mixta.p.locator('button', { hasText: 'Guardar y entrar' }).click();
	await mixta.p.locator('.admin-user-role').waitFor({ timeout: 20000 }).catch(() => {});
	paso('El botón del correo abre la página de la empresa en el panel: pone su contraseña y entra directo a su panel',
		/^https?:\/\/[^/]+\/admin\/#mode=resetPassword&oobCode=/.test(enlaceCorreo) && /Crea tu contraseña/.test(paginaClave) && /mixta@example\.com/.test(paginaClave)
		&& (await mixta.p.locator('.admin-user-role').innerText().catch(() => '')) === 'Propietario' && !/oobCode/.test(mixta.p.url()), `${enlaceCorreo.slice(0, 60)} · ${mixta.p.url()}`);
	// Usado otra vez, el mismo enlace ya no sirve y ofrece mandar otro.
	const otra = await persona(390);
	await otra.p.goto(enlaceCorreo.replace(/^https?:\/\/[^/]+/, SITIO));
	await otra.p.locator('.auth-card', { hasText: 'ya no sirve' }).waitFor({ timeout: 15000 }).catch(() => {});
	paso('El mismo enlace, usado otra vez, ya no sirve y ofrece mandar uno nuevo', /Este enlace ya no sirve/.test(await otra.p.locator('.auth-card').innerText().catch(() => '')));
	// La pantalla para pedir el correo (la misma de «¿Olvidaste tu contraseña?»): Enter envía y «Volver a entrar» lleva a
	// entrar, tanto antes de haber entrado (iniciar) como desde la pantalla de entrar (loginScreen).
	await otra.p.fill('#pedir-email', 'nadie.aqui@example.com');
	await otra.p.press('#pedir-email', 'Enter');
	await otra.p.locator('.auth-card [role="status"]').filter({ hasText: /\S/ }).waitFor({ timeout: 10000 }).catch(() => {});
	const respuestaPedir = await otra.p.locator('.auth-card [role="status"]').innerText().catch(() => '');
	await otra.p.locator('button', { hasText: 'Volver a entrar' }).click();
	const volver1 = await otra.p.locator('#login-email').waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
	await otra.p.locator('button', { hasText: '¿Olvidaste tu contraseña?' }).click();
	const pedir = await otra.p.locator('#pedir-email').waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
	await otra.p.locator('button', { hasText: 'Volver a entrar' }).click();
	const volver2 = await otra.p.locator('#login-email').waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
	// El enlace abierto en esa misma pestaña (el panel ya cargado): se carga de nuevo y lo atiende (aquí, ya usado).
	await otra.p.evaluate((h) => { location.hash = h; }, new URL(enlaceCorreo).hash);
	await otra.p.locator('.auth-card', { hasText: 'ya no sirve' }).waitFor({ timeout: 15000 }).catch(() => {});
	const mismaPestana = /Este enlace ya no sirve/.test(await otra.p.locator('.auth-card').innerText().catch(() => '')) && !/oobCode/.test(otra.p.url());
	paso('Pedir el correo: Enter envía, «Volver a entrar» y «¿Olvidaste tu contraseña?» van y vienen, y el enlace abierto en una pestaña con el panel ya cargado funciona',
		/correo/i.test(respuestaPedir) && volver1 && pedir && volver2 && mismaPestana, `${respuestaPedir.slice(0, 60)} · ${volver1}/${pedir}/${volver2}/${mismaPestana}`);
	await otra.p.context().close();
	// Dentro del panel, «Cambiar mi contraseña» le manda a la misma persona el correo con el botón.
	const antesLlave = readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter(Boolean).length;
	await admin.p.locator('button[aria-label="Cambiar mi contraseña"]').click();
	await admin.p.locator('.toast', { hasText: 'botón para cambiar tu contraseña' }).waitFor({ timeout: 15000 }).catch(() => {});
	await espera(1000);
	const llave = readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter(Boolean).slice(antesLlave).map((l) => JSON.parse(l));
	paso('«Cambiar mi contraseña» dentro del panel le manda a la misma persona el correo para cambiarla',
		llave.some((c) => JSON.stringify(c.to || '').includes('admin@example.com') && /contraseña/.test(c.subject || '')), await avisos(admin.p));
	// Al cambiarla le llega el aviso «Tu contraseña del panel cambió» a su propio correo.
	await espera(1500);
	const todos = () => readFileSync(`${DIR}/correos.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
	const avisoClave = todos().filter((c) => JSON.stringify(c.to || '').includes('mixta@example.com') && c.subject === 'Tu contraseña del panel cambió').pop();
	paso('Al cambiar la contraseña, le llega a su correo el aviso «Tu contraseña cambió» (con WhatsApp por si no fue ella)', Boolean(avisoClave) && /wa\.me/.test(avisoClave.htmlbody), avisoClave ? avisoClave.subject : 'no salió');
	// Ataques al servidor (/api/contrasena): nada de esto manda correos ni dice quién tiene cuenta.
	const api = (cuerpo, extra = {}) => fetch(`${SITIO}/api/contrasena`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
	const antes = todos().length;
	const r1 = await api({ email: 'nadie-en-el-panel@example.com' });
	const r2 = await api({ email: 'mixta@example.com' }, { 'Content-Type': 'text/plain' });
	const r3 = await api({ aviso: 'cambiada' });
	const r4 = await api({ aviso: 'cambiada' }, { Authorization: 'Bearer basura' });
	const r5 = await api({ email: 'mixta@example.com\r\nBcc: otro@example.com' });
	const r6 = await api({ email: ['mixta@example.com', 'otro@example.com'] });
	const tras = todos().slice(antes);
	paso('Ataques a /api/contrasena: correo sin cuenta (200 igual, sin correo), sin JSON (415), aviso sin sesión o con sesión falsa (401), correo con saltos o lista (400)',
		r1.status === 200 && r2.status === 415 && r3.status === 401 && r4.status === 401 && r5.status === 400 && r6.status === 400 && !tras.some((c) => /nadie-en-el-panel|otro@example/.test(JSON.stringify(c.to || ''))),
		[r1, r2, r3, r4, r5, r6].map((r) => r.status).join(' '));
	// Una cuenta creada por fuera (el alta de Firebase es pública) no recibe correos con la marca de la empresa.
	const intruso = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=pruebas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'intruso@example.com', password: 'Intruso-2026', returnSecureToken: true }) })).json();
	const antes2 = todos().length;
	const r7 = await api({ email: 'intruso@example.com' });
	// …ni puede pedir el aviso «Tu contraseña cambió» con su sesión recién creada (para mandar correos a otros).
	const r8 = await api({ aviso: 'cambiada' }, { Authorization: `Bearer ${intruso.idToken}` });
	paso('Una cuenta creada por fuera del panel no recibe el correo de la empresa ni puede pedir el aviso de cambio (la respuesta no lo delata)',
		r7.status === 200 && [200, 401].includes(r8.status) && !todos().slice(antes2).some((c) => JSON.stringify(c.to || '').includes('intruso@example.com')), `${r7.status} ${r8.status}`);
	// Muchos pedidos seguidos del mismo correo se frenan (429), pero no dejan bloqueado al dueño para siempre.
	const seguidos = [];
	for (let i = 0; i < 5; i++) seguidos.push((await api({ email: 'limite@example.com' })).status);
	// El límite queda guardado en la base (lo comparten todas las copias de la función), sin el correo a la vista.
	const limites = ((await (await fetch(`${FS}/limites?pageSize=50`, { headers: { Authorization: 'Bearer owner' } })).json()).documents || []);
	paso('Pedidos seguidos para el mismo correo se frenan con 429, y el límite queda en la base (sin el correo)', seguidos.includes(429) && limites.length > 0 && !JSON.stringify(limites).includes('limite@example.com'), `${seguidos.join(' ')} · ${limites.length} límites`);
	await mixta.p.setViewportSize({ width: 1280, height: 900 });
	// b) Entra y ve sus dos casas.
	duenos.push(['dueña mixta', mixta]);
	const menu = await mixta.p.locator('.admin-nav a').allInnerTexts();
	paso('La dueña mixta entra con su contraseña como «Propietario» y ve Mis propiedades y Solicitudes (tiene una casa por noche)', (await mixta.p.locator('.admin-user-role').innerText()) === 'Propietario'
		&& menu.join('|').includes('Mis propiedades') && menu.join('|').includes('Solicitudes') && menu.length === 2, menu.join(', '));
	await ir(mixta.p, '#/mis-casas', 3000);
	const listaMixta = await mixta.p.locator('.admin-main').innerText();
	paso('«Mis propiedades» muestra su casa en venta y su casa por noche, sin notas internas', /Residencial San Antonio/.test(listaMixta) && /Casa por noche de la dueña mixta/.test(listaMixta) && !/NOTA INTERNA/.test(listaMixta));
	await mixta.p.screenshot({ path: `${PANEL}/lista-1280.png`, fullPage: true });
	// c) La casa en venta: solo lectura, con su exclusiva y la aprobación del anuncio.
	await ir(mixta.p, '#/mis-casas/residencial-san-antonio', 3500);
	const venta = await mixta.p.locator('.admin-main').innerText();
	paso('La casa en venta se ve de solo lectura: consultas, visitas, ofertas, la exclusiva de esa casa y cómo se anuncia', /Consultas/.test(venta) && /Ofertas/.test(venta) && /Exclusiva hasta el 30 de junio de 2027/.test(venta)
		&& /Cómo se anuncia/.test(venta) && await mixta.p.locator('.admin-main input[type=number]').count() === 0 && !/comisi/i.test(venta) && !/NOTA INTERNA/.test(venta), venta.replace(/\s+/g, ' ').slice(0, 160));
	await mixta.p.screenshot({ path: `${PANEL}/venta-1280.png`, fullPage: true });
	await mixta.p.locator('button', { hasText: 'Sí, de acuerdo' }).click();
	await mixta.p.locator('.alert-success', { hasText: 'de acuerdo' }).waitFor({ timeout: 10000 }).catch(() => {});
	const comentarios = await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: dueno, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'comentariosPropietarios' }], where: { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: { stringValue: 'dueno-mixto' } } } } }) })).json();
	paso('Aprueba el anuncio desde su panel y el asesor lo recibe', comentarios.some((x) => x.document?.fields?.tipo?.stringValue === 'aprobado' && x.document.fields.propiedadId?.stringValue === 'residencial-san-antonio'), await avisos(mixta.p));
	// Lo que protege es la regla: ni su ficha (notas, bitácora) ni el acuerdo, aunque los pida a mano.
	const prohibido = await mixta.p.evaluate(async () => {
		const m = await import('/admin/js/firebase.js');
		const intento = (ruta) => m.getDoc(m.doc(m.db, ...ruta)).then(() => 'leyó', (e) => e.code);
		return [await intento(['propietarios', 'dueno-mixto']), await intento(['properties', 'residencial-san-antonio', 'privado', 'acuerdo'])];
	});
	paso('La dueña no puede leer su ficha interna ni el acuerdo de su casa', prohibido.every((x) => x === 'permission-denied'), prohibido.join(', '));
	// d) Su casa por noche: cambia su precio, como siempre.
	await ir(mixta.p, '#/mis-casas/casa-noche-mixta', 3500);
	await mixta.p.fill('#mc-base', '95');
	await mixta.p.locator('#mc-base').dispatchEvent('change');
	await espera(2500);
	const neto = (await leer('properties/casa-noche-mixta/privado/socio')).fields?.precioBase || {};
	paso('Cambia el precio de su casa por noche', Number(neto.doubleValue ?? neto.integerValue) === 95, await avisos(mixta.p));
	const cabeza = await mixta.p.locator('.admin-main .h4').nth(1).innerText().catch(() => '');
	paso('La cabecera de su casa por noche muestra al momento lo que verá el cliente con su precio nuevo', /US\$ 114\.00/.test(cabeza), cabeza);
	// e) Celular: sin scroll de lado en la lista ni en la casa en venta.
	await mixta.p.setViewportSize({ width: 390, height: 844 });
	await ir(mixta.p, '#/mis-casas', 3000);
	const lado1 = await lado(mixta.p);
	await mixta.p.screenshot({ path: `${PANEL}/lista-390.png`, fullPage: true });
	await ir(mixta.p, '#/mis-casas/residencial-san-antonio', 3500);
	const lado2 = await lado(mixta.p);
	await mixta.p.screenshot({ path: `${PANEL}/venta-390.png`, fullPage: true });
	await mixta.p.setViewportSize({ width: 1280, height: 900 });
	await ir(mixta.p, '#/mis-casas', 2500);
	paso('Sin scroll de lado en «Mis propiedades» ni en la casa en venta (390 y 1280 px)', lado1 <= 0 && lado2 <= 0 && await lado(mixta.p) <= 0, `${lado1} ${lado2}`);
	// f) Un colaborador: la misma entrada, con su nombre, y solo lo suyo.
	const colab = await entrar('colab');
	duenos.push(['colaborador', colab]);
	await ir(colab.p, '#/mis-casas', 3000);
	const deColab = await colab.p.locator('.admin-main').innerText();
	const ajeno = await colab.p.evaluate(async () => {
		const m = await import('/admin/js/firebase.js');
		return m.getDocs(m.query(m.collection(m.db, 'portalPropietarios'), m.where('propietarioId', '==', 'dueno-mixto'))).then(() => 'leyó', (e) => e.code);
	});
	paso('El colaborador entra como «Colaborador», ve solo la casa enlazada a él (sin Solicitudes) y no lee el resumen de otra persona',
		(await colab.p.locator('.admin-user-role').innerText()) === 'Colaborador' && /Jardines de Mirabel/.test(deColab) && !/San Antonio|dueña mixta/.test(deColab)
		&& await colab.p.locator('.admin-nav a', { hasText: 'Solicitudes' }).count() === 0 && ajeno === 'permission-denied', ajeno);
	// g) El asesor (no lee los usuarios) ve si entra, también después de guardar la ficha; quitar el acceso cierra la entrada.
	await ir(admin.p, '#/propietarios/dueno-mixto', 3000);
	await guardar(admin.p);
	await ir(asesor.p, '#/propietarios/dueno-mixto', 3000);
	const vistaAsesor = await asesor.p.locator('#acceso-panel').innerText().catch(() => '');
	paso('El asesor ve que la dueña entra al panel (aun después de guardar su ficha), sin botones para darlo o quitarlo', /Entra con mixta@example\.com/.test(vistaAsesor) && /pídeselo al administrador/.test(vistaAsesor)
		&& await asesor.p.locator('#acceso-panel button').count() === 0, vistaAsesor.replace(/\s+/g, ' '));
	await ir(admin.p, '#/propietarios/dueno-mixto', 3000);
	await admin.p.locator('#acceso-panel button', { hasText: 'Quitar acceso' }).click();
	await admin.p.locator('.modal.show button', { hasText: 'Quitar acceso' }).last().click();
	await admin.p.locator('#acceso-panel button', { hasText: 'Devolver acceso' }).waitFor({ timeout: 10000 }).catch(() => {});
	const sinAcceso = await persona();
	await sinAcceso.p.goto(`${SITIO}/admin/`);
	await sinAcceso.p.fill('#login-email', 'mixta@example.com');
	await sinAcceso.p.fill('#login-pass', CLAVE);
	await sinAcceso.p.locator('button[type=submit]', { hasText: 'Entrar' }).click();
	const cerrado = await sinAcceso.p.locator('.auth-card', { hasText: 'desactivado' }).innerText({ timeout: 15000 }).catch(() => '');
	await admin.p.locator('#acceso-panel button', { hasText: 'Devolver acceso' }).click();
	await admin.p.locator('#acceso-panel button', { hasText: 'Quitar acceso' }).waitFor({ timeout: 10000 }).catch(() => {});
	const activoOtraVez = (await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: dueno, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: 'mixta@example.com' } } } } }) })).json()).find((x) => x.document)?.document?.fields?.activo?.booleanValue;
	paso('Con el acceso quitado, al entrar le dice que está desactivado; «Devolver acceso» la deja entrar otra vez', /desactivado/.test(cerrado) && activoOtraVez === true, cerrado.replace(/\s+/g, ' ').slice(0, 100));
	// h) La página vieja de los enlaces de WhatsApp lleva al panel.
	const vieja = await persona(390);
	duenos.push(['visitante de la página vieja', vieja]);
	await vieja.p.goto(`${SITIO}/propietarios/#t=EnlaceViejoDeWhatsAppLargoYAlAzar1234`);
	await espera(800);
	const textoVieja = await vieja.p.locator('main, body').first().innerText();
	paso('La página vieja /propietarios/ dice que el portal ahora es el panel, con el botón y el WhatsApp para pedir acceso, sin scroll de lado',
		/Tu portal ahora es tu panel/.test(textoVieja) && await vieja.p.locator('a[href="/admin/"]').count() === 1 && await vieja.p.locator('a[href*="wa.me"]', { hasText: 'Pedir mi acceso' }).count() === 1
		&& /noindex/.test(await vieja.p.content()) && await lado(vieja.p) <= 0);
	await vieja.p.screenshot({ path: `${PANEL}/pagina-vieja-390.png`, fullPage: true });
}

// ---------------------------------------------------------------- Dueño que cambia, casas por noche sin asesor, estado de cuenta
{
	const sv = (x) => ({ stringValue: x }), nv = (x) => ({ integerValue: String(x) }), bv = (x) => ({ booleanValue: x });
	const pon = (ruta, fields, mascara) => fetch(`${FS}/${ruta}${mascara ? `?${mascara.map((k) => `updateMask.fieldPaths=${k}`).join('&')}` : ''}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
		// Un dato de prueba que la base rechaza (p. ej. 292.8 como entero) no pasa callado: el recorrido se detiene ahí.
		.then(async (r) => { if (!r.ok) throw new Error(`No se guardó ${ruta}: ${(await r.text()).slice(0, 160)}`); return r; });
	const lista = (ids) => ({ arrayValue: { values: ids.map((id) => ({ mapValue: { fields: { propertyId: sv(id) } } })) } });
	const mapa = (o) => ({ mapValue: { fields: o } });
	const f = async (ruta) => (await leer(ruta)).fields || {};
	const txt = (x) => x?.stringValue ?? '';
	// Fechas desde hoy en Guatemala; la reserva pasada, en el mes anterior (Rentas se abre en el de hoy).
	const dia = (n) => new Date(Date.now() - 6 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
	const mesAntes = new Date(`${dia(0).slice(0, 7)}-15T12:00:00Z`); mesAntes.setUTCMonth(mesAntes.getUTCMonth() - 1);
	const antes1 = `${mesAntes.toISOString().slice(0, 7)}-01`, antes3 = `${mesAntes.toISOString().slice(0, 7)}-03`;
	await pon('propietarios/r2-dueno', { tipo: sv('propietario'), nombre: sv('Dueña R2 (prueba)'), telefono: sv('+502 5555 0201'), agentId: sv(''), porNoche: bv(true), propiedades: lista(['r2-noche']), datosPago: sv('Banco R2 cuenta 1') });
	await pon('propietarios/r2-nuevo', { tipo: sv('propietario'), nombre: sv('Dueño nuevo R2 (prueba)'), telefono: sv('+502 5555 0202'), agentId: sv(''), propiedades: lista([]), datosPago: sv('Banco R2 cuenta 2') });
	await pon('propietarios/r2-antes', { tipo: sv('propietario'), nombre: sv('Dueño anterior R2 (prueba)'), telefono: sv('+502 5555 0203'), agentId: sv(''), propiedades: lista([]) });
	// Una casa por noche de antes, con asesor; su reserva pasada la ganó otro dueño (r2-antes).
	await pon('properties/r2-noche', { titulo: sv('Casa por noche R2 (prueba)'), slug: sv('casa-noche-r2'), codigo: sv('R2-1'), operacion: sv('vacacional'), tipo: sv('casa'), estado: sv('disponible'),
		moneda: sv('USD'), precio: nv(120), zona: sv('Monterrico'), ciudad: sv('Monterrico'), descripcion: sv('REGISTRO DE PRUEBA. Casa por noche para el cambio de dueño.'),
		propietarioId: sv('r2-dueno'), agentId: sv('asesor-prueba'), publicado: bv(false), vacacional: mapa({ base: nv(120), huespedesMax: nv(4) }) });
	await pon('properties/r2-noche/privado/socio', { precioBase: nv(100), margen: nv(20) });
	const reserva = (llegada, salida, dueno) => ({ propertyId: sv('r2-noche'), propertyTitulo: sv('Casa por noche R2 (prueba)'), propietarioId: sv(dueno), agentId: sv('asesor-prueba'), estado: sv('confirmada'),
		canal: sv('directo'), huesped: sv('Huésped R2'), llegada: sv(llegada), salida: sv(salida), noches: nv(2), costoSocio: nv(200), alojamiento: nv(240), ganancia: nv(40), moneda: sv('USD'), pagadoSocio: bv(false), leadId: sv(''), codigo: sv('') });
	await pon('reservas/r2-pasada', reserva(antes1, antes3, 'r2-antes'));
	await pon('reservas/r2-viene', reserva(dia(20), dia(22), 'r2-dueno'));
	const solicitud = (codigo, llegada, salida) => ({ nombre: sv('Cliente R2'), telefono: sv('+502 5555 0299'), email: sv('r2@example.com'), propertyId: sv('r2-noche'), propietarioId: sv('r2-dueno'),
		agentId: sv('asesor-prueba'), estado: sv('nuevo'), createdAt: { timestampValue: new Date().toISOString() },
		// Todo lo que las reglas le exigen a una solicitud de verdad (sin esto la tarjeta diría «undefined personas»).
		reserva: mapa({ codigo: sv(codigo), llegada: sv(llegada), salida: sv(salida), noches: nv(2), huespedes: nv(2), subtotal: nv(240), total: { doubleValue: 292.8 }, moneda: sv('USD') }) });
	await pon('leads/r2-abierta', solicitud('EQ-R2A', dia(30), dia(32)));
	await pon('leads/r2-vieja', solicitud('EQ-R2V', dia(-12), dia(-10)));
	const CHAT = 'ChatAbiertoDeR2LargoYAlAzar12345';
	await pon(`chats/${CHAT}`, { codigo: sv('EQ-R2A'), propertyId: sv('r2-noche'), propietarioId: sv('r2-dueno'), leadId: sv('r2-abierta'), llegada: sv(dia(30)), salida: sv(dia(32)), nombre: sv('Cliente') });

	// Casas por noche sin asesor: al abrir Propiedades, la casa de antes, sus reservas y solicitudes lo pierden.
	await ir(admin.p, '#/propiedades', 5000);
	const [c7, r7, l7] = await Promise.all([f('properties/r2-noche'), f('reservas/r2-viene'), f('leads/r2-abierta')]);
	const leeAsesor = await asesor.p.evaluate(async () => { const fb = await import('/admin/js/firebase.js'); return fb.getDoc(fb.doc(fb.db, 'leads', 'r2-abierta')).then(() => 'leyó', (e) => e.code); });
	paso('Casa por noche de antes: al abrir Propiedades pierde el asesor, y también sus reservas y solicitudes (el asesor ya no lee el teléfono del huésped)',
		txt(c7.agentId) === '' && txt(r7.agentId) === '' && txt(l7.agentId) === '' && leeAsesor === 'permission-denied', `${txt(c7.agentId)}|${txt(r7.agentId)}|${txt(l7.agentId)} · ${leeAsesor}`);

	// No queda sin dueño una casa por noche con huéspedes por venir: eliminar a su dueña se detiene antes de tocar nada.
	await ir(admin.p, '#/propietarios/r2-dueno', 3500);
	await admin.p.locator('.sticky-actions button', { hasText: 'Eliminar' }).click();
	await admin.p.locator('.modal.show button', { hasText: /^Eliminar$/ }).click();
	await espera(3500);
	const aviso3 = await avisos(admin.p);
	const sigue = await fetch(`${FS}/propietarios/r2-dueno`, { headers: { Authorization: 'Bearer owner' } });
	paso('Eliminar a la dueña de una casa por noche con huéspedes por venir se detiene y lo dice; su ficha y la casa siguen como estaban',
		/no puede quedar sin dueño/.test(aviso3) && sigue.status === 200 && txt((await f('properties/r2-noche')).propietarioId) === 'r2-dueno', aviso3);

	// Cambio de dueño desde la ficha de la casa: sus reservas, solicitudes y chats por venir pasan al nuevo; lo pasado no.
	await ir(admin.p, '#/propiedades/r2-noche', 4000);
	await campo(admin.p, 'propietarioId').selectOption('r2-nuevo');
	await espera(300);
	// La casa ya tiene dueña: antes de guardar pregunta, con los dos nombres. «Cancelar» la deja como estaba.
	await guardar(admin.p);
	const pregunta = await admin.p.locator('.modal.show').innerText().catch(() => '');
	await admin.p.locator('.modal.show button', { hasText: 'Cancelar' }).click().catch(() => {});
	await espera(1500);
	const sinCambio = txt((await f('properties/r2-noche')).propietarioId);
	paso('Pasar una casa que ya tiene dueña a otra persona pregunta antes (con los dos nombres); «Cancelar» la deja con su dueña',
		/ya tiene dueño/.test(pregunta) && /pasa a/.test(pregunta) && sinCambio === 'r2-dueno', `${pregunta.replace(/\s+/g, ' ').slice(0, 120)} · ${sinCambio}`);
	await guardar(admin.p);
	await admin.p.locator('.modal.show button', { hasText: 'Pasar la casa' }).click();
	await espera(4000);
	const [c2, viene, pasada, abierta, vieja, chat2, nuevo, anterior] = await Promise.all(['properties/r2-noche', 'reservas/r2-viene', 'reservas/r2-pasada', 'leads/r2-abierta', 'leads/r2-vieja', `chats/${CHAT}`, 'propietarios/r2-nuevo', 'propietarios/r2-dueno'].map(f));
	paso('Cambiar el dueño de una casa por noche pasa al nuevo sus reservas, solicitudes y chats por venir (y lo pasado queda con quien lo ganó)',
		txt(c2.propietarioId) === 'r2-nuevo' && txt(viene.propietarioId) === 'r2-nuevo' && txt(pasada.propietarioId) === 'r2-antes' && txt(abierta.propietarioId) === 'r2-nuevo'
		&& txt(vieja.propietarioId) === 'r2-dueno' && txt(chat2.propietarioId) === 'r2-nuevo' && JSON.stringify(nuevo.propiedades).includes('r2-noche') && nuevo.porNoche?.booleanValue === true
		&& !JSON.stringify(anterior.propiedades || {}).includes('r2-noche') && anterior.porNoche?.booleanValue === false && txt(c2.agentId) === '',
		`${txt(c2.propietarioId)} ${txt(viene.propietarioId)} ${txt(pasada.propietarioId)} ${txt(abierta.propietarioId)} ${txt(vieja.propietarioId)} ${txt(chat2.propietarioId)} · ${await avisos(admin.p)}`);

	// Estado de cuenta de Rentas: la reserva pasada sale con quien la ganó; editarla no se la pasa al dueño de hoy.
	await ir(admin.p, '#/rentas', 3500);
	await admin.p.locator('button[aria-label="Mes anterior"]').first().click();
	await espera(800);
	const fila8 = await admin.p.locator('tr', { hasText: 'Dueño anterior R2' }).first().innerText().catch(() => '');
	await admin.p.locator('tr', { hasText: 'Casa por noche R2' }).first().click();
	await espera(1500);
	await admin.p.locator('.modal.show button', { hasText: /^Guardar$/ }).click();
	await espera(3000);
	paso('Rentas: la reserva pasada cuenta para el dueño que la ganó, y editarla no se la pasa al dueño de hoy',
		/Dueño anterior R2[\s\S]*\b1\b/.test(fila8) && txt((await f('reservas/r2-pasada')).propietarioId) === 'r2-antes', `${fila8.replace(/\s+/g, ' ')} · ${await avisos(admin.p)}`);

	// «Mis propiedades» en una transacción: lo que otra pestaña bloqueó mientras tanto no se pierde, y el precio público
	// sale del suyo con el margen vigente (las reglas lo exigen).
	await ir(socio.p, `#/mis-casas/${idCasa}`, 3500);
	await pon(`properties/${idCasa}`, { vacacional: mapa({ bloqueos: { arrayValue: { values: [mapa({ desde: sv(dia(40)), hasta: sv(dia(42)), motivo: sv('Otra pestaña') })] } } }) }, ['vacacional.bloqueos']);
	await socio.p.fill('#mc-base', '115');
	await socio.p.locator('#mc-base').dispatchEvent('change');
	await espera(3000);
	const num = (x) => Number(x?.doubleValue ?? x?.integerValue);
	const v5 = (await f(`properties/${idCasa}`)).vacacional?.mapValue?.fields || {};
	const s5 = await f(`properties/${idCasa}/privado/socio`);
	paso('«Mis propiedades» guarda solo lo que cambió: no borra lo que otra pestaña bloqueó, y su precio y el público van juntos',
		JSON.stringify(v5.bloqueos || {}).includes(dia(40)) && num(s5.precioBase) === 115 && num(v5.base) === 138, `${num(s5.precioBase)} → ${num(v5.base)} · ${await avisos(socio.p)}`);

	// Usuarios: una cuenta del equipo nace con la misma pieza que la de un dueño (acceso.js), sin contraseña escrita.
	await ir(admin.p, '#/usuarios', 3000);
	await admin.p.locator('button', { hasText: 'Nuevo usuario' }).click();
	await espera(800);
	const ventana = admin.p.locator('.modal.show');
	const sinClave = await ventana.locator('input[type="password"], input[placeholder*="caracteres"]').count() === 0;
	await ventana.locator('input.form-control').nth(0).fill('Asesora nueva (prueba)');
	await ventana.locator('input.form-control').nth(1).fill('asesora.nueva@example.com');
	await ventana.locator('select').nth(1).selectOption('asesor-prueba');
	await ventana.locator('button', { hasText: 'Crear usuario' }).click();
	await espera(3500);
	const usuarios = await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: sv('asesora.nueva@example.com') } } } }) })).json();
	const u = usuarios.find((x) => x.document)?.document.fields || {};
	const aviso7 = await avisos(admin.p);
	paso('Usuarios: el administrador crea una asesora sin escribir contraseña y le llega el correo para ponerla', sinClave && txt(u.rol) === 'asesor' && txt(u.agentId) === 'asesor-prueba' && /correo/.test(aviso7), aviso7);
}

// ---------------------------------------------------------------- Acciones en lote y dos «Guardar» seguidos
{
	// «Poner marca de agua» en lote: el botón se lee después de confirmar (antes se caía ahí y no hacía nada).
	await ir(admin.p, '#/propiedades', 3500);
	await admin.p.locator('.lista-casas ~ * button, .admin-main button', { hasText: 'Elegir varias' }).first().click();
	await admin.p.locator('.casa-fila', { hasText: 'Casa de prueba Monterrico' }).first().locator('.casa-sel input').check();
	await admin.p.locator('.barra-masa button', { hasText: 'Más' }).click();
	await admin.p.locator('.barra-masa button', { hasText: 'Poner marca de agua' }).click();
	await admin.p.locator('.modal.show button', { hasText: 'Poner marca' }).click();
	await espera(3000);
	const tras = await avisos(admin.p);
	paso('«Poner marca de agua» en lote termina y avisa', /marca de agua/.test(tras), tras);
	// Dos «Guardar» seguidos sin recargar, después de cambiarle el dueño: el segundo no borra el acuerdo recién guardado.
	const sv = (x) => ({ stringValue: x });
	const pon = (ruta, fields) => fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
	await pon('propietarios/dueno-a-prueba', { tipo: sv('propietario'), nombre: sv('Dueño A (prueba)'), telefono: sv('+502 5555 0101'), agentId: sv(''),
		propiedades: { arrayValue: { values: [{ mapValue: { fields: { propertyId: sv('casa-dos-guardados') } } }] } } });
	await pon('propietarios/dueno-b-prueba', { tipo: sv('propietario'), nombre: sv('Dueño B (prueba)'), telefono: sv('+502 5555 0102'), agentId: sv('') });
	await pon('properties/casa-dos-guardados', { titulo: sv('Casa de dos guardados (prueba)'), slug: sv('casa-dos-guardados'), codigo: sv('DOS-1'), operacion: sv('venta'), tipo: sv('casa'),
		estado: sv('disponible'), moneda: sv('USD'), precio: { integerValue: '150000' }, zona: sv('Zona 10'), ciudad: sv('Guatemala'), descripcion: sv('REGISTRO DE PRUEBA. Casa para dos guardados.'),
		propietarioId: sv('dueno-a-prueba'), agentId: sv(''), publicado: { booleanValue: false } });
	await ir(admin.p, '#/propiedades/casa-dos-guardados', 3500);
	// La primera vez se traduce al inglés y la ficha se vuelve a abrir; después, «Guardar» ya no recarga.
	await guardar(admin.p);
	await espera(2500);
	await campo(admin.p, 'propietarioId').selectOption('dueno-b-prueba');
	await espera(300);
	await admin.p.locator('[data-campo="acuerdo.exclusiva"] input').check();
	await guardar(admin.p);
	await admin.p.locator('.modal.show button', { hasText: 'Pasar la casa' }).click();
	await espera(3500);
	const acuerdo = async () => (await fetch(`${FS}/properties/casa-dos-guardados/privado/acuerdo`, { headers: { Authorization: 'Bearer owner' } })).status;
	const primero = await acuerdo();
	await guardar(admin.p);
	const segundo = await acuerdo();
	paso('Un segundo «Guardar» sin recargar, después de cambiar el dueño, no borra el acuerdo recién guardado', primero === 200 && segundo === 200, `${primero} → ${segundo} · ${await avisos(admin.p)}`);
}

// ---------------------------------------------------------------- Ronda 3: lo que no debe romper ni saltarse
{
	// El socio no cancela con una escritura directa una reserva que el cliente ya pagó (las reglas, no la pantalla).
	const directo = await socio.p.evaluate(async () => {
		const fb = await import('/admin/js/firebase.js');
		const { session } = await import('/admin/js/session.js');
		const res = (await fb.getDocs(fb.query(fb.collection(fb.db, 'reservas'), fb.where('propietarioId', '==', session.profile.propietarioId)))).docs;
		for (const d of res) {
			if (d.data().estado !== 'confirmada' || !d.data().chat) continue;
			if ((await fb.getDoc(fb.doc(fb.db, 'chats', d.data().chat))).data()?.estado !== 'pagada') continue;
			return fb.updateDoc(d.ref, { estado: 'cancelada', motivo: 'Cliente canceló', updatedAt: fb.serverTimestamp() }).then(() => 'canceló', (e) => e.code);
		}
		return 'sin reserva pagada';
	});
	paso('El socio no puede cancelar una reserva pagada con una escritura directa', directo === 'permission-denied', directo);
	// Un chat terminado de una casa que ya no es suya (cambió de dueño) se queda con su nombre: su pantalla sigue cargando.
	const sv = (x) => ({ stringValue: x });
	await fetch(`${FS}/chats/ChatDeCasaQueYaNoEsDelSocio12345`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { codigo: sv('EQ-AJENA'), propertyId: sv('r2-noche'), propietarioId: sv('socio-prueba'), leadId: sv('r2-vieja'), llegada: sv('2026-01-10'), salida: sv('2026-01-12'), estado: sv('confirmada'), nombre: sv('Cliente'),
			noches: { integerValue: '2' }, huespedes: { integerValue: '2' }, total: { doubleValue: 300 }, moneda: sv('USD'), idioma: sv('es'), createdAt: { timestampValue: '2026-01-01T12:00:00Z' } } }) });
	const antes = socio.errores.length;
	await ir(socio.p, '#/solicitudes', 4000);
	const pantalla = await socio.p.locator('.admin-main').innerText().catch(() => '');
	const ajena = socio.p.locator('.card', { hasText: 'EQ-AJENA' }).first();
	const sinChat = await ajena.locator('[aria-label="Chat con el cliente"]').count() === 0 && await ajena.locator('button', { hasText: /Cancelar|Pago recibido|Confirmada/ }).count() === 0;
	paso('Las Solicitudes del socio cargan aunque una de sus casas haya cambiado de dueño (esa se ve, sin chat ni botones)', pantalla.includes(codigo3) && pantalla.includes('EQ-AJENA') && sinChat && socio.errores.length === antes, `${pantalla.includes(codigo3)} ${pantalla.includes('EQ-AJENA')} ${sinChat} · ${pantalla.slice(0, 200).replace(/\s+/g, ' ')}`);
	// El comprobante de la comisión por el botón real (la dirección que da getDownloadURL pasa la regla del comprobante).
	const [elegir] = await Promise.all([socio.p.waitForEvent('filechooser'), socio.p.locator('.card', { hasText: codigo }).first().locator('[aria-label^="Subir comprobante"]').click()]);
	await elegir.setFiles(png);
	await espera(4000);
	const recibo = await socio.p.evaluate(async () => {
		const fb = await import('/admin/js/firebase.js');
		const { session } = await import('/admin/js/session.js');
		const res = (await fb.getDocs(fb.query(fb.collection(fb.db, 'reservas'), fb.where('propietarioId', '==', session.profile.propietarioId)))).docs;
		return res.map((d) => d.data().comision?.comprobante || '').find(Boolean) || '';
	});
	paso('El socio sube el comprobante de la comisión con el botón y queda en su reserva', /\/o\/comprobantes%2F.+alt=media&token=/.test(recibo), `${recibo.slice(0, 90)} · ${await avisos(socio.p)}`);
	// El chat lleva el subtotal cotizado (el de su solicitud) y la reserva confirmada registra al menos lo cotizado.
	const q = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'chats' }], where: { fieldFilter: { field: { fieldPath: 'codigo' }, op: 'EQUAL', value: { stringValue: codigo } } } } }) }).then((r) => r.json());
	const ch = q.find((x) => x.document)?.document.fields || {};
	const numero = (f) => Number(f?.doubleValue ?? f?.integerValue);
	const sol = (await fetch(`${FS}/leads/${ch.leadId?.stringValue}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json())).fields || {};
	const subSol = numero(sol.reserva?.mapValue?.fields?.subtotal);
	const res1 = (await fetch(`${FS}/reservas/${ch.leadId?.stringValue}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json())).fields || {};
	const casa1 = (await fetch(`${FS}/properties/${ch.propertyId?.stringValue}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json())).fields || {};
	const limpieza = numero(casa1.vacacional?.mapValue?.fields?.limpieza) || 0;
	paso('El chat lleva el subtotal cotizado de su solicitud, y la reserva registra al menos lo cotizado (sin la limpieza)', numero(ch.subtotal) === subSol && subSol > 0 && numero(res1.alojamiento) >= subSol - limpieza - 0.01,
		`chat ${numero(ch.subtotal)} · solicitud ${subSol} · limpieza ${limpieza} · reserva ${numero(res1.alojamiento)}`);
	// Chats de antes sin su índice (chatsPorSolicitud): el administrador se lo pone al abrir Solicitudes.
	await ir(admin.p, '#/solicitudes', 4000);
	const indice = await fetch(`${FS}/chatsPorSolicitud/r2-abierta`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
	paso('Al abrir Solicitudes, el administrador le pone su índice a un chat de antes', indice.fields?.token?.stringValue === 'ChatAbiertoDeR2LargoYAlAzar12345', JSON.stringify(indice).slice(0, 120));
	// Un asesor sin «orden» (se deja vacío al crearlo) sigue en las listas de asesores.
	const nombres = await admin.p.evaluate(async () => (await (await import('/admin/js/session.js')).loadAgents(true)).map((a) => a.nombre));
	paso('Un asesor sin «orden» aparece en la lista de asesores (Usuarios, Propiedades, Propietarios, Leads)', nombres.includes('Asesora sin orden (prueba)'), nombres.join(', '));
}

// ---------------------------------------------------------------- Formularios: todo junto, correo y teléfono, mínimo de noches
{
	// Panel: correo mal escrito → sugerencia; al guardar, nombre que falta y teléfono malo en rojo juntos; corregido, el correo se guarda.
	await ir(admin.p, '#/propietarios/nuevo', 3000);
	const c = (n) => admin.p.locator(`[data-campo="${n}"]`).locator('input').last();
	await c('email').fill('roberto@gmial.com');
	await c('email').blur();
	const pista = await admin.p.locator('[data-campo="email"] .form-text:not([hidden])').innerText().catch(() => '');
	await admin.p.locator('[data-campo="telefono"] input').fill('1234');
	await admin.p.locator('button', { hasText: /^Guardar$/ }).last().click();
	await espera(800);
	const rojos = (await admin.p.locator('.invalid-feedback').allInnerTexts()).join(' | ');
	const nombreRojo = await c('nombre').evaluate((x) => x.classList.contains('is-invalid'));
	paso('Panel: sugiere el correo bien escrito y, al guardar, marca juntos el nombre que falta y el teléfono malo (sin repetir «falta» en el nombre)', /gmail\.com/.test(pista) && nombreRojo && /teléfono/.test(rojos) && !/Completa «Nombre»/.test(rojos), `${pista} · ${rojos}`);
	await c('nombre').fill('Socio correo (prueba)');
	await admin.p.locator('[data-campo="telefono"] input').fill('5555 7777');
	await c('email').fill('socio.correo@example.com');
	await admin.p.locator('button', { hasText: /^Guardar$/ }).last().click();
	await espera(3000);
	const todos = (await fetch(`${FS}/propietarios?pageSize=300`, { headers: { Authorization: 'Bearer owner' } }).then((x) => x.json())).documents || [];
	const guardado = todos.find((d) => d.fields?.nombre?.stringValue === 'Socio correo (prueba)');
	paso('Panel: el correo escrito en la ficha se guarda de verdad', guardado?.fields?.email?.stringValue === 'socio.correo@example.com', JSON.stringify(guardado?.fields?.email || null));
	// Sitio: con un mínimo de 3 noches, tocar una salida antes del mínimo deja la llegada y lo explica.
	const hoyM = new Date().toISOString().slice(0, 10), finM = new Date(Date.now() + 200 * 86400_000).toISOString().slice(0, 10);
	const minimo = (values) => fetch(`${FS}/properties/${idCasa}?updateMask.fieldPaths=vacacional.minimos`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: { vacacional: { mapValue: { fields: { minimos: { arrayValue: { values } } } } } } }) });
	await minimo([{ mapValue: { fields: { desde: { stringValue: hoyM }, hasta: { stringValue: finM }, noches: { integerValue: '3' } } } }]);
	const vis = await persona(390);
	await vis.p.goto(`${SITIO}${ficha}?m=3`);
	await espera(3000);
	for (let i = 0; i < 2; i++) { await vis.p.locator('.vac-cal-next').first().click(); await espera(150); }
	await vis.p.locator('.vac-cal-cuerpo button:not([aria-disabled=true])').nth(8).click();
	const llegadaM = await vis.p.locator('.vac-dia.is-llegada').getAttribute('data-fecha');
	const dentro = await vis.p.locator('.vac-dia.is-minimo').first().getAttribute('data-fecha').catch(() => '');
	if (dentro) await vis.p.locator(`[data-fecha="${dentro}"]`).click();
	const ayudaM = await vis.p.locator('.vac-ayuda').first().innerText();
	// Una sola burbuja chica, fija sobre la primera salida posible: «Mínimo 3 noches» (flota: no mueve nada).
	const globo = await vis.p.evaluate(() => {
		const g = document.querySelector('.vac-burbuja.is-visible'), d = document.querySelector('.vac-dia.is-salida-min');
		if (!g || !d) return null;
		const a = g.getBoundingClientRect(), b = d.getBoundingClientRect();
		return { texto: g.textContent, sobreElDia: a.bottom <= b.top + 2 && Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)) < b.width + 40 };
	});
	paso('Sitio: al elegir la llegada, una burbuja chica sobre la primera salida posible dice el mínimo («Mínimo 3 noches»)', globo?.texto === 'Mínimo 3 noches' && globo.sobreElDia, JSON.stringify(globo));
	paso('Sitio: tocar una noche dentro del mínimo deja la llegada (no la cambia ni la borra)', Boolean(dentro) && (await vis.p.locator('.vac-dia.is-llegada').getAttribute('data-fecha')) === llegadaM && /salida/.test(ayudaM), ayudaM);
	await espera(3500);
	paso('Sitio: la burbuja del mínimo no se va sola mientras se elige la salida', await vis.p.locator('.vac-burbuja.is-visible').count() === 1);
	await minimo([]);
	paso('Sin errores de programa en la ficha con mínimo de noches', vis.errores.length === 0, vis.errores.join(' ; '));
}

// La casa cambió de asesor y el sitio no se ha vuelto a publicar: el formulario manda el asesor de antes, las reglas lo
// rechazan y el sitio reintenta sin asesor: la solicitud se guarda y le llega al administrador (no se pierde).
{
	const CASA = 'jardines-de-mirabel';
	const asesorDe = (agentId) => fetch(`${FS}/properties/${CASA}?updateMask.fieldPaths=agentId`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { agentId: { stringValue: agentId } } }) });
	await asesorDe('otro-asesor');
	const vis = await persona(390);
	await vis.p.goto(`${SITIO}/propiedad/casa-jardines-de-mirabel-zona-16/`);
	const form = vis.p.locator(`.lead-form[data-property-id="${CASA}"]`).first();
	const viejo = await form.getAttribute('data-agent-id');
	await form.locator('[name=nombre]').fill('Luis Asesor Viejo');
	await form.locator('[name=telefono]').fill('5555 4321');
	await form.locator('button[type=submit]').click();
	await espera(4000);
	const leads = await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'leads' }], where: { fieldFilter: { field: { fieldPath: 'nombre' }, op: 'EQUAL', value: { stringValue: 'Luis Asesor Viejo' } } } } }) })).json();
	const guardado = leads.find((x) => x.document)?.document?.fields || {};
	paso('Sitio: con el asesor de antes en la página, la solicitud se guarda sin asesor (la recibe el administrador)',
		viejo === 'asesor-prueba' && guardado.agentId?.stringValue === '' && guardado.propertyId?.stringValue === CASA,
		`página ${viejo} · guardado ${JSON.stringify({ agentId: guardado.agentId?.stringValue, propertyId: guardado.propertyId?.stringValue })} · ${(await form.locator('.form-status, [role=status]').first().innerText().catch(() => '')).slice(0, 80)}`);
	await asesorDe('asesor-prueba');
	await vis.p.context().close();
}

for (const [quien, x] of [['administrador', admin], ['socio', socio], ['cliente', cliente], ['segundo cliente', otro], ['tercer cliente', tercero], ['asesor', asesor], ['administrador en otra pestaña', otraPestana], ...duenos]) paso(`Sin errores de programa en la pantalla del ${quien}`, x.errores.length === 0, x.errores.join(' ; '));
console.log(`\nCorreos que habrían salido:\n  ${resumen.join('\n  ')}`);
console.log(`\n${n - fallas} de ${n} pasos correctos. Capturas en ${CAPTURAS}`);
await navegador.close();
process.exit(fallas ? 1 : 0);
