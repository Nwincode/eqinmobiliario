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
console.log(`${ok} pruebas del correo pasan.`);
