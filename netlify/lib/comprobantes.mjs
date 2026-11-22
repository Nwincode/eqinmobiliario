// Revisión del comprobante del huésped con la IA: cuando el cliente sube la foto de su pago (chat con
// `comprobanteMensaje`), el servidor la lee con la IA (el mismo cliente y modelo de netlify/lib/ia-cliente.mjs, con
// visión) y saca monto, moneda, fecha, banco y referencia. Lo compara con la reserva (total, moneda, fecha posterior a la
// confirmación) EN EL CÓDIGO (la IA solo lee) y deja en revisionesComprobante/{solicitud} «El comprobante cuadra» o
// «No cuadra: …» para el socio de la casa y el equipo (firestore.rules: los mismos que leen montosSolicitud; nadie
// escribe desde el navegador). Nunca decide ni cancela nada. Sin IA configurada o si falla, no deja nada que mostrar.
// La foto sale del mensaje guardado (nunca de quien llama) y solo de la carpeta de ese chat; una revisión por foto y a
// lo más 3 intentos por chat.
import '../../js/calc-vacacional.js';
import { leerPublico, leerPrivado } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { client, MODEL, iaConfigurada } from './ia-cliente.mjs';
import { dinero } from '../../admin/js/formato.js';

const V = globalThis.EQVacacional;
const MAX_FOTO = 5 * 1024 * 1024;
const INTENTOS = 3;
const EN_CURSO = 10 * 60_000;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const urlDelComprobante = (token, url) => new RegExp(`^https://firebasestorage[.]googleapis[.]com/v0/b/eqinmobiliariobd[.]firebasestorage[.]app/o/chats%2F${token}%2F[A-Za-z0-9._-]+[?]alt=media&token=[a-z0-9-]+$`).test(String(url || ''));

const ESQUEMA = {
	type: 'object', additionalProperties: false,
	required: ['esComprobante', 'monto', 'moneda', 'fecha', 'banco', 'referencia'],
	properties: {
		esComprobante: { type: 'boolean', description: 'true si la imagen es un comprobante de pago o transferencia' },
		monto: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Monto pagado, solo el número' },
		moneda: { anyOf: [{ type: 'string', enum: ['GTQ', 'USD', 'otra'] }, { type: 'null' }], description: 'GTQ para quetzales (Q), USD para dólares (US$, $)' },
		fecha: { anyOf: [{ type: 'string', description: 'AAAA-MM-DD' }, { type: 'null' }] },
		banco: { anyOf: [{ type: 'string' }, { type: 'null' }] },
		referencia: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Número de referencia, autorización o boleta' }
	}
};
const PEDIDO = 'Lee este comprobante de pago. Devuelve solo lo que se ve en la imagen; si un dato no se ve, null. No supongas.';

// Lo leído contra lo esperado. leido: lo que devolvió la IA; esperado: { total, moneda, confirmada: 'AAAA-MM-DD' }.
// Devuelve { cuadra, texto } con el porqué en palabras (lo que ve el socio).
export function compararComprobante(leido, { total, moneda, confirmada }) {
	if (!leido?.esComprobante) return { cuadra: false, texto: 'No cuadra: la imagen no parece un comprobante de pago' };
	const fallas = [];
	const monto = Number(leido.monto);
	if (!Number.isFinite(monto) || !monto) fallas.push('no se lee el monto');
	else if (Math.abs(monto - Number(total)) > Math.max(1, Number(total) * 0.01)) fallas.push(`monto ${dinero(monto, leido.moneda === 'otra' ? moneda : leido.moneda || moneda)}, esperado ${dinero(total, moneda)}`);
	if (leido.moneda && leido.moneda !== moneda) fallas.push(`moneda ${leido.moneda === 'otra' ? 'distinta' : leido.moneda}, esperada ${moneda}`);
	const fecha = /^\d{4}-\d{2}-\d{2}$/.test(leido.fecha || '') ? leido.fecha : '';
	if (!fecha) fallas.push('no se lee la fecha');
	else if (confirmada && fecha < confirmada) fallas.push(`fecha ${fecha}, antes de confirmar la reserva (${confirmada})`);
	return fallas.length ? { cuadra: false, texto: `No cuadra: ${fallas.join('; ')}` } : { cuadra: true, texto: 'El comprobante cuadra' };
}

async function fotoEnBase64(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`Foto: ${res.status}`);
	const tipo = String(res.headers.get('content-type') || '').split(';')[0].trim();
	if (!TIPOS.includes(tipo)) throw new Error(`Foto: tipo ${tipo}`);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length > MAX_FOTO) throw new Error('Foto: demasiado grande');
	return { tipo, datos: buf.toString('base64') };
}

async function leerConIA(foto) {
	const r = await client.beta.messages.create({
		model: MODEL, max_tokens: 2000,
		betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
		output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
		messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: foto.tipo, data: foto.datos } }, { type: 'text', text: PEDIDO }] }]
	});
	if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') throw new Error(`IA: ${r.stop_reason}`);
	return JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

// Revisa el comprobante vigente del chat `token`, si no se ha revisado. Devuelve el resultado o null (nada que hacer).
// `leer` (para pruebas): la lectura de la IA.
export async function revisarComprobante(token, { leer = (foto) => leerConIA(foto), bajar = fotoEnBase64, ahora = Date.now() } = {}) {
	if (!iaConfigurada() || !escrituraConfigurada()) return null;
	const chat = await leerPublico(`chats/${token}`);
	if (!chat?.leadId || chat.estado !== 'confirmada' || !chat.comprobanteMensaje) return null;
	const ruta = `revisionesComprobante/${chat.leadId}`;
	const mensajeId = String(chat.comprobanteMensaje);
	// Se aparta: una revisión por foto (dos avisos a la vez no la mandan dos veces a la IA), con tope por chat.
	const toca = await transaccion(async ({ leer: l, crear, cambiar }) => {
		const prev = await l(ruta);
		if (prev && prev.mensaje === mensajeId && (prev.texto || ahora - (Number(prev.apartado) || 0) < EN_CURSO)) return false;
		if ((Number(prev?.intentos) || 0) >= INTENTOS) return false;
		const datos = { mensaje: mensajeId, apartado: ahora, intentos: (Number(prev?.intentos) || 0) + 1, propietarioId: chat.propietarioId || '', propertyId: chat.propertyId || '', texto: '', cuadra: false };
		if (prev) cambiar(ruta, datos); else crear(ruta, datos);
		return true;
	});
	if (!toca) return null;
	const mensaje = await leerPrivado(`chats/${token}/mensajes/${mensajeId}`);
	if (mensaje?.tipo !== 'foto' || mensaje.de !== 'cliente' || !urlDelComprobante(token, mensaje.texto)) return null;
	const reserva = await leerPrivado(`reservas/${chat.leadId}`).catch(() => null);
	const leido = await leer(await bajar(mensaje.texto));
	const confirmada = reserva?.createdAt instanceof Date ? V.hoy(reserva.createdAt.getTime()) : '';
	const r = compararComprobante(leido, { total: Number(chat.total) || 0, moneda: chat.moneda || reserva?.moneda || 'USD', confirmada });
	const limpio = (v, n) => (v == null ? '' : String(v).slice(0, n));
	await transaccion(({ cambiar }) => cambiar(ruta, { ...r, leido: { monto: Number(leido.monto) || 0, moneda: limpio(leido.moneda, 5), fecha: limpio(leido.fecha, 10), banco: limpio(leido.banco, 80), referencia: limpio(leido.referencia, 60) } }, { ahora: ['cuando'] }));
	return r;
}
