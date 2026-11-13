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
paso('La casa queda enlazada en la ficha del socio, sin ir a agregarla', (await admin.p.locator('[data-campo="propiedades"]').innerHTML()).includes(idCasa));

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
	// grep sale con 1 cuando no encuentra nada (lo esperado).
	let enSitio = [];
	try { enSitio = execFileSync('grep', ['-rlE', 'Calle Real 12|13\\.8912', `${DIR}/sitio/dist`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { /* sin coincidencias */ }
	const base = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents';
	const publica = await (await fetch(`${base}/properties/${idCasa}`)).text();
	const privada = await fetch(`${base}/properties/${idCasa}/privado/llegada`);
	paso('La dirección y el mapa no están en ningún archivo del sitio', enSitio.length === 0, enSitio.slice(0, 3).join(', '));
	paso('La base no da la dirección ni el mapa a quien no tiene sesión', /Casa de prueba|titulo/.test(publica) && !EXACTO.test(publica) && privada.status === 403, `privada: ${privada.status}`);
	await ir(admin.p, `#/propiedades/${idCasa}`);
	paso('El administrador sigue viendo la dirección y el mapa en la ficha de la casa', /Calle Real 12/.test(await campo(admin.p, 'direccion').inputValue()) && /13\.8912/.test(await campo(admin.p, 'mapa').inputValue()));
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
paso('El cliente ve «Pago recibido» y los datos de llegada', /Pago recibido|Payment received/.test(await cliente.p.locator('.vac-chat-sello').innerText()) && /Calle Real 12/.test(fin) && /terracería/.test(fin));
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

for (const [quien, x] of [['administrador', admin], ['socio', socio], ['cliente', cliente], ['segundo cliente', otro], ['tercer cliente', tercero], ['asesor', asesor]]) paso(`Sin errores de programa en la pantalla del ${quien}`, x.errores.length === 0, x.errores.join(' ; '));
console.log(`\nCorreos que habrían salido:\n  ${resumen.join('\n  ')}`);
console.log(`\n${n - fallas} de ${n} pasos correctos. Capturas en ${CAPTURAS}`);
await navegador.close();
process.exit(fallas ? 1 : 0);
