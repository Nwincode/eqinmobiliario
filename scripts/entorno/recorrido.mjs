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
const CLAVE = 'Pruebas-2026';
const CAPTURAS = `${DIR}/capturas`;
mkdirSync(CAPTURAS, { recursive: true });

let fallas = 0, n = 0;
const paso = (nombre, bien, detalle = '') => { n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${nombre}${detalle ? ` · ${detalle}` : ''}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const navegador = await chromium.launch();
// Una persona = un contexto. El SDK de Firebase del panel se sirve desde npm (misma versión) y las llamadas
// del sitio a Google van a los emuladores; todo lo demás de fuera se corta.
async function persona(ancho = 1280) {
	const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
	const p = await ctx.newPage();
	const errores = [];
	p.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
	await p.route('**/*', async (r) => {
		const u = r.request().url();
		const sdk = u.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)$/);
		if (sdk) return r.fulfill({ path: `${DIR}/node_modules/firebase/${sdk[1]}`, contentType: 'text/javascript' });
		if (u.startsWith('https://firestore.googleapis.com')) return r.fulfill({ response: await r.fetch({ url: u.replace('https://firestore.googleapis.com', 'http://127.0.0.1:8085') }) });
		if (u.startsWith('https://firebasestorage.googleapis.com')) return r.fulfill({ response: await r.fetch({ url: u.replace('https://firebasestorage.googleapis.com', 'http://127.0.0.1:9199') }) });
		return /^http:\/\/(localhost|127\.0\.0\.1)/.test(u) ? r.continue() : r.abort();
	});
	return { p, errores };
}
async function entrar(rol) {
	const x = await persona();
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
const avisos = async (p) => (await p.locator('.toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 160);

// ---------------------------------------------------------------- 1. El administrador ingresa la casa
const admin = await entrar('admin');
paso('El administrador entra al panel', (await admin.p.locator('.admin-user-role').innerText()) === 'Administrador');
await ir(admin.p, '#/propiedades/nuevo');
await campo(admin.p, 'titulo').fill('Casa de prueba Monterrico');
await campo(admin.p, 'operacion').selectOption('vacacional');
await espera(300);
paso('Renta vacacional: no se pide asesor responsable', !(await admin.p.locator('[data-campo="agentId"]').isVisible()));
paso('Renta vacacional: tampoco VIP ni mantenimiento al mes', !(await admin.p.locator('[data-campo="vip"]').isVisible()) && !(await admin.p.locator('[data-campo="mantenimiento"]').isVisible()));
paso('Renta vacacional: no se pide nombre ni teléfono del socio', await admin.p.locator('[data-campo="socio.nombre"], [data-campo="socio.telefono"]').count() === 0);
await campo(admin.p, 'propietarioId').selectOption('socio-prueba');
await campo(admin.p, 'socio.precioBase').fill('100');
await campo(admin.p, 'zona').fill('Monterrico');
await campo(admin.p, 'ciudad').fill('Santa Rosa');
await campo(admin.p, 'direccion').fill('Calle Real 12, Monterrico');
await campo(admin.p, 'mapa').fill('https://maps.google.com/?q=13.8912,-90.4801');
await campo(admin.p, 'habitaciones').fill('3');
await campo(admin.p, 'vacacional.comoLlegar').fill('A 2 horas de la capital; los últimos 2 km son de terracería.');
await campo(admin.p, 'descripcion').fill('REGISTRO DE PRUEBA. Casa de playa para probar la reserva.');
await admin.p.locator('[data-campo="publicado"] input').check();
await guardar(admin.p);
const idCasa = (admin.p.url().match(/propiedades\/([^/?#]+)/) || [])[1];
paso('La casa se guarda', Boolean(idCasa) && idCasa !== 'nuevo', await avisos(admin.p));
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
await cliente.p.locator('.vac-card button[type=submit]').click();
await cliente.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
const token = (cliente.p.url().match(/reserva\/#(\w+)/) || [])[1];
paso('Al solicitar, el cliente queda en «Tu reserva» (sin WhatsApp)', Boolean(token), cliente.p.url().replace(/#.*/, '#…'));
await espera(1500);
const codigo = (await cliente.p.locator('[data-out="codigo"]').innerText()).trim();
const escribir = async (texto) => { await cliente.p.fill('.vac-chat-form textarea', texto); await cliente.p.keyboard.press('Enter'); await espera(1500); return cliente.p.locator('.vac-chat-aviso').innerText(); };
paso('El cliente escribe en el chat', (await escribir('Hola, ¿aceptan 2 perros pequeños?')) === '');
paso('El chat bloquea un teléfono', /no se comparten/.test(await escribir('Mejor llamame al 5555-1234')));
await cliente.p.fill('.vac-chat-form textarea', '');

// ---------------------------------------------------------------- 4. El socio atiende
const socio = await entrar('socio');
await ir(socio.p, `#/solicitudes/${codigo}`, 3500);
const tarjeta = socio.p.locator('.card', { hasText: codigo }).first();
const loDelSocio = await socio.p.locator('.admin-main').innerText();
paso('El socio ve la solicitud con el primer nombre', /Ana\b/.test(loDelSocio) && !/Ana Prueba/.test(loDelSocio));
paso('El socio no ve teléfono, correo ni WhatsApp del cliente', !/305|555 1234|ana@example/.test(await socio.p.content()) && await socio.p.locator('.admin-main a[href*="wa.me"]').count() === 0);
paso('La solicitud marca «Mensaje sin responder»', /Mensaje sin responder/.test(await tarjeta.innerText()));
await tarjeta.locator('[aria-label="Chat con el cliente"]').click();
await espera(1500);
await socio.p.fill('.modal textarea', 'Hola Ana, sí aceptamos mascotas pequeñas.');
await socio.p.locator('.modal [aria-label=Enviar]').click();
await espera(1500);
await socio.p.fill('.modal textarea', 'Mi número es 5555 0001');
await socio.p.locator('.modal [aria-label=Enviar]').click();
await espera(800);
paso('El panel bloquea el teléfono del socio', /no se comparten/.test(await avisos(socio.p)));
await socio.p.screenshot({ path: `${CAPTURAS}/socio-chat.png` });
await socio.p.locator('.modal .btn-close').click();
await espera(2500);
await socio.p.locator('.card', { hasText: codigo }).first().locator('button', { hasText: 'Confirmada' }).click();
await espera(800);
await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
await espera(4000);
paso('El socio confirma la reserva', /Confirmada/.test(await socio.p.locator('.card', { hasText: codigo }).first().innerText()), await avisos(socio.p));

await cliente.p.reload();
await espera(2500);
paso('El cliente ve «Reserva confirmada» y los datos de pago', /confirmada/i.test(await cliente.p.locator('.vac-chat-sello').innerText()) && /123-456789-0/.test(await cliente.p.locator('.vac-chat-mensajes').innerText()));
paso('El cliente todavía no ve la dirección', !/Calle Real 12/.test(await cliente.p.locator('.vac-chat-mensajes').innerText()));
// Comprobante: una imagen PNG mínima.
const png = `${CAPTURAS}/comprobante.png`;
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
await cliente.p.setInputFiles('.vac-chat-form input[type=file]', png);
await espera(3500);
paso('El cliente adjunta la foto de su comprobante (Storage)', await cliente.p.locator('.vac-chat-msj img').count() === 1, await cliente.p.locator('.vac-chat-aviso').innerText());

await ir(socio.p, `#/solicitudes/${codigo}`, 3500);
await socio.p.locator('.card', { hasText: codigo }).first().locator('button', { hasText: 'Pago recibido' }).click();
await espera(800);
await socio.p.locator('.modal button', { hasText: 'Pago recibido' }).last().click();
await espera(4000);
const trasPago = await socio.p.locator('.card', { hasText: codigo }).first().innerText();
paso('El socio marca «Pago recibido»', /Pago recibido/.test(trasPago), await avisos(socio.p));
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
await otro.p.locator('.vac-card button[type=submit]').click();
await otro.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
await espera(1500);
const codigo2 = (await otro.p.locator('[data-out="codigo"]').innerText().catch(() => '')).trim();
paso('Un segundo cliente solicita otras fechas', /^EQ-/.test(codigo2), codigo2);
await ir(socio.p, `#/solicitudes/${codigo2}`, 3500);
await socio.p.locator('.card', { hasText: codigo2 }).first().locator('button', { hasText: 'No se dio' }).click();
await espera(800);
await socio.p.locator('.modal button', { hasText: 'Fechas no disponibles' }).click();
await espera(4000);
paso('El socio responde «No se dio»', /No se dio/.test(await socio.p.locator('.card', { hasText: codigo2 }).first().locator('.badge').first().innerText()), await avisos(socio.p));
await otro.p.reload();
await espera(2500);
paso('Ese cliente ve «No disponible» y el mensaje', /No disponible/.test(await otro.p.locator('.vac-chat-sello').innerText()) && /no está disponible/.test(await otro.p.locator('.vac-chat-mensajes').innerText()));

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
await tercero.p.locator('.vac-card button[type=submit]').click();
await tercero.p.waitForURL(/\/reserva\/#/, { timeout: 15000 }).catch(() => {});
await espera(1500);
const codigo3 = (await tercero.p.locator('[data-out="codigo"]').innerText().catch(() => '')).trim();
const llegada3 = (await leer(`chats/${(tercero.p.url().match(/#(\w+)/) || [])[1]}`)).fields?.llegada?.stringValue || '';
await ir(socio.p, `#/solicitudes/${codigo3}`, 3500);
await socio.p.locator('.card', { hasText: codigo3 }).first().locator('button', { hasText: 'Confirmada' }).click();
await espera(800);
await socio.p.locator('.modal button', { hasText: /Confirmar/ }).last().click();
await espera(4000);
paso('El socio confirma una tercera reserva y las fechas quedan ocupadas', Boolean(llegada3) && (await reservadas()).includes(llegada3), codigo3);
await socio.p.locator('.card', { hasText: codigo3 }).first().locator('button', { hasText: 'Cancelar' }).click();
await espera(800);
await socio.p.locator('.modal button', { hasText: 'Cliente canceló' }).click();
await espera(4500);
paso('El socio cancela esa reserva (el cliente no pagó)', /Cancelada/.test(await socio.p.locator('.card', { hasText: codigo3 }).first().locator('.badge').first().innerText().catch(() => '')), await avisos(socio.p));
paso('Las fechas canceladas vuelven a quedar libres', !(await reservadas()).includes(llegada3));
await tercero.p.reload();
await espera(2500);
paso('Ese cliente ve «Reserva cancelada» y el mensaje', /cancelada/i.test(await tercero.p.locator('.vac-chat-sello').innerText()) && /se canceló/.test(await tercero.p.locator('.vac-chat-mensajes').innerText()));

// ---------------------------------------------------------------- 4d. El control de cada hora (lo que el socio deja sin responder)
{
	const hace = (min) => ({ timestampValue: new Date(Date.now() - min * 60_000).toISOString() });
	const sv = (v) => ({ stringValue: v });
	const poner = (ruta, fields) => fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
	const hoy = new Date().toISOString().slice(0, 10), manana = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
	// Una solicitud sin responder hace 2 h 30 min y un chat donde el cliente escribió hace 2 h 30 min.
	await poner('leads/vieja', { nombre: sv('Rita Vieja'), telefono: sv('+502 5555 1111'), propertyId: sv(idCasa), propertyTitulo: sv('Casa de prueba Monterrico'), propietarioId: sv('socio-prueba'), createdAt: hace(150),
		reserva: { mapValue: { fields: { codigo: sv('EQ-VIEJA'), llegada: sv(hoy), salida: sv(manana), huespedes: { integerValue: '2' }, moneda: sv('USD'), total: { doubleValue: 300 } } } } });
	await poner('chats/TokenDelChatSinResponder1234', { codigo: sv('EQ-MUDO'), nombre: sv('Rita'), propertyTitulo: sv('Casa de prueba Monterrico'), propietarioId: sv('socio-prueba'), llegada: sv(hoy), salida: sv(manana), huespedes: { integerValue: '2' }, moneda: sv('USD'), total: { doubleValue: 300 }, createdAt: hace(200) });
	await poner('chats/TokenDelChatSinResponder1234/mensajes/m1', { de: sv('cliente'), texto: sv('¿Hay alguien?'), createdAt: hace(150) });
	execFileSync(process.execPath, ['--import', './scripts/entorno/red-local.mjs', '-e', "import('./netlify/functions/solicitudes-sin-respuesta.mjs').then((m) => m.default())"], { cwd: `${DIR}/sitio`, stdio: 'pipe', env: { ...process.env, CORREOS: `${DIR}/correos.jsonl` } });
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
const alerta = correos.find((c) => /^Reservas:/.test(c.subject || ''));
paso('Control de cada hora: correo al equipo con lo que el socio dejó sin responder', Boolean(alerta) && para(alerta) === 'equipo@example.com' && /EQ-VIEJA/.test(JSON.stringify(alerta)) && /EQ-MUDO/.test(JSON.stringify(alerta)), alerta?.subject || 'no salió');
paso('Ese correo lleva al panel, no al WhatsApp del cliente', Boolean(alerta) && !/wa\.me/.test(JSON.stringify(alerta)) && /admin\/#\/solicitudes\/EQ-VIEJA/.test(JSON.stringify(alerta)));
paso('Correo al cliente cuando la reserva no se da', resumen.some((r) => /luis@example\.com ← .*no disponible/.test(r)));
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
		paso('Guardar una casa enlazada solo desde la lista del dueño no borra su acuerdo', num(enLista.comisionPct) === 7, avisoAdmin);
		await ir(admin.p, '#/propietarios', 5000);
		const aviso = await admin.p.locator('.alert-warning').first().innerText().catch(() => '');
		paso('El aviso de exclusivas por vencer nombra cada inmueble', /Casa heredada en venta/.test(aviso) && /Apartamento heredado en renta/.test(aviso) && !/Casa con acuerdo propio/.test(aviso), aviso.slice(0, 160));
		const sinSesion = await fetch(`${FS}/properties/leg-venta`).then((r) => r.text());
		const privadoSinSesion = await fetch(`${FS}/properties/leg-venta/privado/acuerdo`);
		paso('Quien no tiene sesión no ve el acuerdo de una casa publicada', /Casa heredada/.test(sinSesion) && !/exclusiva|comisionPct/.test(sinSesion) && privadoSinSesion.status === 403, String(privadoSinSesion.status));
		await ir(admin.p, '#/inicio', 5000);
		paso('El tablero avisa de las exclusivas por vencer', /exclusivas? por vencer/.test(await admin.p.locator('.admin-main').innerText().catch(() => '')));
		await ir(admin.p, '#/propietarios/legado-solo');
		paso('La ficha de quien aún no tiene casas dice qué acuerdo quedó anotado', /exclusiva hasta \d\d\/\d\d\/\d{4}/.test(await admin.p.locator('.alert-info', { hasText: 'Acuerdo anotado' }).innerText().catch(() => '')));
		for (const r of ['properties/leg-ajena/privado/acuerdo', 'properties/leg-lista/privado/acuerdo', 'properties/leg-ajena', 'properties/leg-lista', 'propietarios/legado-ajeno', 'properties/leg-venta/privado/acuerdo', 'properties/leg-renta/privado/acuerdo', 'properties/leg-propia/privado/acuerdo', 'properties/leg-venta', 'properties/leg-renta', 'properties/leg-propia', 'propietarios/legado-dos', 'propietarios/legado-solo']) await fetch(`${FS}/${r}`, { method: 'DELETE', headers: dueno });
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
	await admin.p.locator('button', { hasText: /^Duplicar$/ }).click();
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
		acuerdoCopia.status !== 404 && 'copió el acuerdo',
		!lista.includes(idCopia || 'x') && 'no está en la lista del socio'
	].filter(Boolean);
	paso('«Duplicar» una casa por noche: borrador con URL y código propios, su privado copiado (sin el acuerdo) y en la lista del socio', fallo.length === 0, fallo.join(', '));
}

for (const [quien, x] of [['administrador', admin], ['socio', socio], ['cliente', cliente], ['segundo cliente', otro], ['tercer cliente', tercero], ['asesor', asesor]]) paso(`Sin errores de programa en la pantalla del ${quien}`, x.errores.length === 0, x.errores.join(' ; '));
console.log(`\nCorreos que habrían salido:\n  ${resumen.join('\n  ')}`);
console.log(`\n${n - fallas} de ${n} pasos correctos. Capturas en ${CAPTURAS}`);
await navegador.close();
process.exit(fallas ? 1 : 0);
