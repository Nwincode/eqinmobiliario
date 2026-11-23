// Pruebas del envío de correo (netlify/lib/correo.mjs) sin red: cada correo con su remitente, y que un rechazo de
// reservas@ no pierda el correo.
import assert from 'node:assert/strict';

process.env.ZEPTOMAIL_TOKEN = 'token-de-prueba';
process.env.CORREO_REMITENTE = 'Equipo Inmobiliario <noreply@ejemplo.gt>';
process.env.AVISO_CORREO = 'reservas@ejemplo.gt,otro@ejemplo.gt';
const { enviarCorreo } = await import('../netlify/lib/correo.mjs');

let ok = 0;
async function test(nombre, fn) {
	try { await fn(); ok++; console.log(`  ok  ${nombre}`); } catch (err) { console.error(`  FALLA  ${nombre}\n${err.stack}`); process.exitCode = 1; }
}
const enviados = [];
let rechazar = 0;
globalThis.fetch = async (url, op) => {
	enviados.push(JSON.parse(op.body));
	if (rechazar-- > 0) return new Response(JSON.stringify({ error: { message: 'remitente no verificado' } }), { status: 400 });
	return new Response(JSON.stringify({ request_id: 'r1' }), { status: 201 });
};
const correo = (extra = {}) => enviarCorreo({ para: 'cliente@ejemplo.com', asunto: 'a', html: '<p>a</p>', texto: 'a', ...extra });

await test('contraseñas y avisos internos: desde noreply@, sin «Responder a»', async () => {
	enviados.length = 0;
	await correo();
	assert.equal(enviados[0].from.address, 'noreply@ejemplo.gt');
	assert.equal(enviados[0].reply_to, undefined);
});
await test('reservas: desde reservas@ (primer correo del equipo, mismo dominio) y se responde ahí', async () => {
	enviados.length = 0;
	await correo({ responder: true });
	assert.deepEqual(enviados[0].from, { name: 'Equipo Inmobiliario', address: 'reservas@ejemplo.gt' });
	assert.deepEqual(enviados[0].reply_to, [{ address: 'reservas@ejemplo.gt', name: 'Equipo Inmobiliario' }]);
});
await test('si Zoho no acepta reservas@, el correo sale igual desde noreply@', async () => {
	enviados.length = 0; rechazar = 1;
	assert.equal(await correo({ responder: true }), 'r1');
	assert.equal(enviados.length, 2);
	assert.equal(enviados[1].from.address, 'noreply@ejemplo.gt');
	assert.equal(enviados[1].reply_to, undefined);
});
await test('equipo con correo de otro dominio: sale de noreply@ con «Responder a» ese correo', async () => {
	process.env.AVISO_CORREO = 'alguien@hotmail.com';
	enviados.length = 0;
	await correo({ responder: true });
	assert.equal(enviados[0].from.address, 'noreply@ejemplo.gt');
	assert.deepEqual(enviados[0].reply_to, [{ address: 'alguien@hotmail.com', name: 'Equipo Inmobiliario' }]);
});
await test('contraseña: el diseño aprobado, con los colores del tema y el WhatsApp y las redes de Contenido (nada escrito a mano)', async () => {
	const { correoContrasena } = await import('../netlify/lib/correo-contrasena.mjs');
	const seed = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
	const { html, texto } = await correoContrasena({ link: 'https://x.test/a?b=1&c=2', email: 'ana@ejemplo.gt' });
	assert.match(html, new RegExp(`wa\\.me/${seed.settings.contacto.whatsapp}\\?text=`));
	assert.match(html, /href="https:\/\/x\.test\/a\?b=1&amp;c=2"/);
	assert.match(html, /Eliminar mi cuenta del panel/);
	// Con el tema original da los colores del diseño aprobado; el cuadro «Cuida tu cuenta» y las redes siguen.
	// Exactos los colores del diseño aprobado (con el tema original), también los tonos claros.
	for (const x of ['#0e1920', '#0e5e8a', '#85662b', '#1e7e4a', '#00b7e7', '#5b666f', '#eef3f6', '#edf5fa', '#d3e4ee', '#e3e9ee', '#f7f3eb', '#e6dbc6', '#b5bec5']) assert.match(html, new RegExp(x), x);
	assert.match(html, /CUIDA TU CUENTA/);
	// Ningún correo lleva texto invisible de relleno en la vista previa (Hotmail lo manda a «No deseado»).
	const { readdirSync, readFileSync } = await import('node:fs');
	for (const dir of ['../netlify/lib/', '../netlify/functions/']) for (const f of readdirSync(new URL(dir, import.meta.url)).filter((x) => x.endsWith('.mjs')))
		assert.doesNotMatch(readFileSync(new URL(dir + f, import.meta.url), 'utf8'), /&#8199;|&#847;|&zwnj;|\u200c|\u034f/, f);
	assert.doesNotMatch(html, /&#8199;|&#847;/);
	assert.match(html, new RegExp(seed.settings.redes.instagram.replace(/[.]/g, '\\.')));
	const fuente = (await (await import('node:fs/promises')).readFile(new URL('../netlify/lib/correo-contrasena.mjs', import.meta.url), 'utf8'));
	assert.doesNotMatch(fuente, /#[0-9a-f]{6}|wa\.me\/\d/i, 'sin colores ni números escritos a mano');
	assert.match(texto, /https:\/\/x\.test\/a\?b=1&c=2/);
});
await test('respuesta al lead en su idioma (aviso del lead y botón de Leads)', async () => {
	const { saludoLead } = await import('../admin/js/formato.js');
	assert.equal(saludoLead({ nombre: 'Ana Pérez', propertyTitulo: 'Casa en zona 16' }), 'Hola Ana, gracias por escribirnos por Casa en zona 16. ');
	assert.equal(saludoLead({ nombre: 'John Smith', propertyTitulo: 'House in Zona 16', idioma: 'en' }), 'Hi John, thanks for reaching out about House in Zona 16. ');
	assert.equal(saludoLead({ nombre: '', idioma: 'en' }), 'Hi, thanks for reaching out. ');
});
await test('lo urgente: solo esa parte en el rojo del tema y seminegrita; datos() con el dato urgente; lista() con el estado urgente', async () => {
	const { urgente, conUrgente, datos, lista } = await import('../netlify/lib/correo.mjs');
	const c = { dark: '#0e1920', ink: '#5b666f', linea: '#dddddd', danger: '#b42318' };
	const rojo = (t) => `<span style="color:#b42318;font-weight:600">${t}</span>`;
	assert.equal(urgente(c, '<x>'), rojo('&lt;x&gt;'), 'escapado');
	assert.equal(conUrgente(c, 'A <b>. Y el socio dice que no le llegó: revisa.', 'el socio dice que no le llegó'), `A &lt;b&gt;. Y ${rojo('el socio dice que no le llegó')}: revisa.`);
	assert.equal(conUrgente(c, 'Nada urgente.', 'no está'), 'Nada urgente.', 'sin esa parte, el texto tal cual');
	const tabla = datos(c, [['Correo', 'Falla al enviar', 'desde 3 nov'], ['Calendario', '', 'desde 1 nov'], ['Vacía', '', '']]);
	assert.ok(tabla.includes(`Falla al enviar · ${rojo('desde 3 nov')}`));
	assert.ok(tabla.includes(`>${rojo('desde 1 nov')}</td>`), 'sin detalle, solo el dato urgente');
	assert.ok(!tabla.includes('Vacía'), 'la fila vacía no sale');
	const filas = lista(c, [{ nombre: 'Casa', detalle: 'EQ-1', monto: 'US$ 50', estado: 'vencida', alerta: true }, { nombre: 'Casa', detalle: 'EQ-2', monto: 'US$ 60', estado: '' }]);
	assert.equal(filas.split(rojo('vencida')).length, 2, 'solo el estado urgente va en rojo');
	assert.ok(!filas.includes('600">US$'), 'el monto no');
});
await test('lista() sin monto: el estado sube a la primera línea («Estado del sistema»: desde cuándo, en rojo)', async () => {
	const { lista } = await import('../netlify/lib/correo.mjs');
	const c = { dark: '#0e1920', ink: '#5b666f', linea: '#dddddd', danger: '#b42318' };
	const html = lista(c, [{ nombre: 'Informe SEO semanal', detalle: 'Backend Error', monto: '', estado: 'desde 23 nov', alerta: true }]);
	assert.ok(!html.includes('font-weight:bold;color:#0e1920"></div>'), 'sin la línea vacía del monto');
	assert.match(html, /white-space:nowrap"><div style="font-size:13px[^"]*"><span style="color:#b42318;font-weight:600">desde 23 nov<\/span>/);
});
await test('resumen del equipo: sin fondo de color en «atrasados»; solo la fecha atrasada en rojo; el texto plano igual', async () => {
	const { correoDe } = await import('../netlify/lib/resumen.mjs');
	const vacio = { vencidas: [], hoy: [], leads: [], sinSeguimiento: [], exclusivas: [], incompletas: [] };
	const ahora = Date.parse('2026-11-23T08:00:00-06:00');
	const r = await correoDe('', { ...vacio, vencidas: [{ fecha: Date.parse('2026-11-20T10:00:00-06:00'), titulo: 'Llamar', clienteNombre: 'Ana' }], hoy: [{ fecha: Date.parse('2026-11-23T10:00:00-06:00'), titulo: 'Visita' }] }, ahora);
	assert.match(r.html, /<span style="color:#[0-9a-f]{6};font-weight:600">20\/11\/2026<\/span> · Llamar — Ana/);
	assert.equal((r.html.match(/font-weight:600">/g) || []).length, 1, 'solo esa fecha');
	assert.doesNotMatch(r.html, /border-left:4px/, 'sin la franja');
	assert.match(r.texto, /- 20\/11\/2026 · Llamar — Ana\n/);
	assert.match(r.asunto, /Pendientes del equipo hoy: 2 \(1 atrasado\)/);
});
console.log(`${ok} pruebas del correo pasan.`);
