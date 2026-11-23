// Revisión del comprobante del huésped con la IA: cuando el cliente sube la foto de su pago (chat con
// `comprobanteMensaje`), el servidor la lee con la IA (el mismo cliente y modelo de netlify/lib/ia-cliente.mjs, con
// visión) y saca monto, moneda, fecha, banco y referencia. Lo compara con la reserva (total, moneda, fecha posterior a la
// confirmación) EN EL CÓDIGO (la IA solo lee) y deja en revisionesComprobante/{solicitud} «El comprobante cuadra» o
// «No cuadra: …» para el socio de la casa y el equipo (firestore.rules: los mismos que leen montosSolicitud; nadie
// escribe desde el navegador). Nunca decide ni cancela nada. Sin IA configurada o si falla, no deja nada que mostrar.
// La foto sale del mensaje guardado (nunca de quien llama) y solo de la carpeta de ese chat; una revisión por foto y a
// lo más 3 revisiones terminadas por chat (y 3 fallidas por foto). Si la función se corta antes de terminar (la IA tarda),
// la retoma el control de cada 15 minutos (plazos-reservas.mjs, `revisarPendientes`). Tope de llamadas a la IA por chat
// (`intentos`, se cuenta al apartar: también las cortadas y las de fotos nuevas que fallan): así una foto que siempre
// falla, o una foto nueva tras otra, no la llama sin fin. Los topes viven en admin/js/hilo.js: la foto que ya no se revisa
// por ellos queda oculta para el socio (estadoDeFoto) hasta que el equipo decide.
import '../../js/calc-vacacional.js';
import { leerPublico, leerPrivado, desde } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { client, MODEL, iaConfigurada } from './ia-cliente.mjs';
import { dinero } from '../../admin/js/formato.js';
import { REVISIONES_POR_CHAT as REVISIONES, FALLOS_POR_FOTO as FALLOS, INTENTOS_POR_CHAT as INTENTOS } from '../../admin/js/hilo.js';

const V = globalThis.EQVacacional;
const MAX_FOTO = 5 * 1024 * 1024;
const EN_CURSO = 10 * 60_000;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const urlDelComprobante = (token, url) => new RegExp(`^https://firebasestorage[.]googleapis[.]com/v0/b/eqinmobiliariobd[.]firebasestorage[.]app/o/chats%2F${token}%2F[A-Za-z0-9._-]+[?]alt=media&token=[a-z0-9-]+$`).test(String(url || ''));

// Sin «null» ni «anyOf» (la misma forma de los esquemas que ya usa netlify/lib/tareas.mjs): lo que no se ve, 0 o ''.
const ESQUEMA = {
	type: 'object', additionalProperties: false,
	required: ['esComprobante', 'contactoVisible', 'monto', 'moneda', 'fecha', 'banco', 'referencia'],
	properties: {
		esComprobante: { type: 'boolean', description: 'true si la imagen es un comprobante de pago o transferencia' },
		contactoVisible: { type: 'boolean', description: 'true si en la imagen se ve un teléfono, un correo, un usuario de red social o un enlace que no es parte del comprobante bancario (los datos del banco, la cuenta y la referencia no cuentan)' },
		monto: { type: 'number', description: 'Monto pagado, solo el número; 0 si no se ve' },
		moneda: { type: 'string', enum: ['GTQ', 'USD', 'otra', ''], description: 'GTQ para quetzales (Q), USD para dólares (US$, $); vacío si no se ve' },
		fecha: { type: 'string', description: 'Fecha del pago, AAAA-MM-DD; vacío si no se ve' },
		banco: { type: 'string', description: 'Banco; vacío si no se ve' },
		referencia: { type: 'string', description: 'Número de referencia, autorización o boleta; vacío si no se ve' }
	}
};
const PEDIDO = 'Lee este comprobante de pago. Devuelve solo lo que se ve en la imagen; si un dato no se ve, 0 o vacío. No supongas. Di también si se ve algún teléfono, correo, usuario de red social o enlace que no sea parte del comprobante del banco.';

// Lo leído contra lo esperado. leido: lo que devolvió la IA; esperado: { total, moneda, confirmada: 'AAAA-MM-DD' }.
// Devuelve { cuadra, texto, oculta, motivoOculta } con el porqué en palabras (lo que ve el socio). `oculta`: la foto no
// se le muestra al socio (no es un comprobante, o trae un dato de contacto): la ve el equipo y decide. Lo decide este
// código con lo que leyó la IA (la IA solo lee).
export function compararComprobante(leido, esperado) {
	const r = compararMontos(leido, esperado);
	const sinComprobante = !leido?.esComprobante, contacto = Boolean(leido?.contactoVisible);
	return { ...r, oculta: sinComprobante || contacto, motivoOculta: contacto ? 'Posible dato de contacto' : sinComprobante ? 'No parece un comprobante' : '' };
}
function compararMontos(leido, { total, moneda, confirmada }) {
	if (!leido?.esComprobante) return { cuadra: false, texto: 'No cuadra: la imagen no parece un comprobante de pago' };
	const fallas = [];
	const monto = Number(leido.monto);
	if (!Number.isFinite(monto) || !monto) fallas.push('no se lee el monto');
	else if (Math.abs(monto - Number(total)) > Math.max(1, Number(total) * 0.01)) fallas.push(`monto ${dinero(monto, leido.moneda === 'otra' ? moneda : leido.moneda || moneda)}, esperado ${dinero(total, moneda)}`);
	// Sin la moneda a la vista no se sabe si el monto es el mismo (Q 1,122 no son US$ 1,122).
	if (!leido.moneda) fallas.push('no se lee la moneda');
	else if (leido.moneda !== moneda) fallas.push(`moneda ${leido.moneda === 'otra' ? 'distinta' : leido.moneda}, esperada ${moneda}`);
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

async function leerConIA(foto, timeout = 25_000) {
	const r = await client.beta.messages.create({
		model: MODEL, max_tokens: 2000,
		betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
		output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
		messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: foto.tipo, data: foto.datos } }, { type: 'text', text: PEDIDO }] }]
	}, { timeout });
	if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') throw new Error(`IA: ${r.stop_reason}`);
	return JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

// Revisa el comprobante vigente del chat `token`, si no se ha revisado. Devuelve el resultado o null (nada que hacer).
// `leer` (para pruebas): la lectura de la IA.
// `timeout`: lo más que se espera a la IA (el control de cada 15 minutos tiene poco tiempo).
export async function revisarComprobante(token, { leer = (foto, t) => leerConIA(foto, t), bajar = fotoEnBase64, ahora = Date.now(), timeout = 25_000 } = {}) {
	if (!iaConfigurada() || !escrituraConfigurada()) return null;
	const chat = await leerPublico(`chats/${token}`);
	if (!chat?.leadId || chat.estado !== 'confirmada' || !chat.comprobanteMensaje) return null;
	const ruta = `revisionesComprobante/${chat.leadId}`;
	const mensajeId = String(chat.comprobanteMensaje);
	// Solo la foto del cliente, de la carpeta de su chat: lo demás ni se aparta.
	const mensaje = await leerPrivado(`chats/${token}/mensajes/${mensajeId}`);
	if (mensaje?.tipo !== 'foto' || mensaje.de !== 'cliente' || !urlDelComprobante(token, mensaje.texto)) return null;
	// Se aparta: una revisión por foto (dos avisos a la vez no la mandan dos veces a la IA), con tope por chat.
	const toca = await transaccion(async ({ leer: l, crear, cambiar }) => {
		const prev = await l(ruta);
		const misma = prev?.mensaje === mensajeId;
		if (misma && (prev.texto || ahora - (Number(prev.apartado) || 0) < EN_CURSO || (Number(prev.fallos) || 0) >= FALLOS)) return false;
		if ((Number(prev?.revisiones) || 0) >= REVISIONES || (Number(prev?.intentos) || 0) >= INTENTOS) return false;
		const datos = { mensaje: mensajeId, apartado: ahora, oculta: false, motivoOculta: '', fallos: misma ? Number(prev.fallos) || 0 : 0, revisiones: Number(prev?.revisiones) || 0, intentos: (Number(prev?.intentos) || 0) + 1,
			propietarioId: chat.propietarioId || '', propertyId: chat.propertyId || '', texto: '', cuadra: false };
		if (prev) cambiar(ruta, datos); else crear(ruta, datos);
		return true;
	});
	if (!toca) return null;
	const reserva = await leerPrivado(`reservas/${chat.leadId}`).catch(() => null);
	let leido;
	try {
		leido = await leer(await bajar(mensaje.texto), timeout);
	} catch (err) {
		// No se pudo (la foto o la IA): cuenta como fallida y queda para la próxima vuelta.
		await transaccion(async ({ leer: l, cambiar }) => cambiar(ruta, { fallos: 1 + (Number((await l(ruta))?.fallos) || 0), apartado: 0 })).catch(() => {});
		throw err;
	}
	const confirmada = reserva?.createdAt instanceof Date ? V.hoy(reserva.createdAt.getTime()) : '';
	const r = compararComprobante(leido, { total: Number(chat.total) || 0, moneda: chat.moneda || reserva?.moneda || 'USD', confirmada });
	const limpio = (v, n) => (v == null ? '' : String(v).slice(0, n));
	await transaccion(async ({ leer: l, cambiar }) => {
		// Y el veredicto de esta foto por su id (`fotos.f{id}`: la «f» hace del id un nombre de campo válido aunque empiece con
		// un número): una foto de antes sigue con el suyo cuando llega otra.
		cambiar(ruta, { ...r, [`fotos.f${mensajeId}`]: { oculta: r.oculta, motivo: r.motivoOculta }, revisiones: (Number((await l(ruta))?.revisiones) || 0) + 1, leido: { monto: Number(leido.monto) || 0, moneda: limpio(leido.moneda, 5), fecha: limpio(leido.fecha, 10), banco: limpio(leido.banco, 80), referencia: limpio(leido.referencia, 60), contactoVisible: Boolean(leido.contactoVisible) } }, { ahora: ['cuando'] });
		// En el chat (que lee el cliente con su enlace): solo que esa foto no se aceptó, para decirle en una línea que solo
		// se aceptan fotos del comprobante. Nada de lo leído.
		cambiar(`chats/${token}`, { comprobanteOculto: r.oculta ? mensajeId : '' });
	});
	return r;
}

// Los comprobantes de los últimos 3 días que aún no tienen su revisión (la de /api/aviso-chat se cortó o falló): uno tras
// otro mientras quede tiempo (`hasta`, en ms). Lo llama el control de cada 15 minutos.
export async function revisarPendientes(hasta) {
	if (!iaConfigurada() || !escrituraConfigurada()) return 0;
	const chats = await desde('chats', 'comprobanteCliente', new Date(Date.now() - 3 * 86_400_000));
	let hechos = 0;
	for (const c of chats.filter((x) => x.estado === 'confirmada' && x.comprobanteMensaje)) {
		const queda = hasta - Date.now();
		if (queda < 8000) break;
		if (await revisarComprobante(c.id, { timeout: queda - 2000 }).catch((err) => { console.error('Revisión del comprobante:', err.message); return null; })) hechos++;
	}
	return hechos;
}
