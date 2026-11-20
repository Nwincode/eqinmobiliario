// Permisos del socio (dueño de casas por noche): qué puede cambiar él solo en su panel. Puro: lo usan el panel
// (Propietarios, Mis propiedades, al marcar una comisión pagada) y el servidor (netlify/functions/comisiones-vencidas.mjs).
//   - Para todos: settings/permisosSocios { precios, fechas, casa } (false = apagado para todos).
//   - Para uno: propietarios/{id}.permisos { precios, fechas, casa, devolver } (devolver = «Devolver permisos hasta que pague»).
//   - Corte automático: si debe a Equipo Inmobiliario una comisión con DIAS_CORTE días o más de atraso (contados como
//     nivelComision: desde el fin del día de llegada, hora de Guatemala), se apagan los tres; al pagar vuelven solos.
// Lo que resulta se guarda en permisosSocios/{propietarioId} (lo leen las reglas, mi-casa.mjs y la pantalla del socio).
// Sin ese documento todo está permitido: así funciona igual antes y después de publicar las reglas.
// Responder solicitudes, el chat y subir el comprobante nunca se apagan.
import '../../js/calc-vacacional.js';

const V = () => globalThis.EQVacacional;

export const PERMISOS = [
	['precios', 'Precios y temporadas', 'icon-usd'],
	['fechas', 'Bloquear fechas', 'icon-calendar'],
	['casa', 'La casa (fotos y textos)', 'icon-home2']
];
export const CLAVES = PERMISOS.map(([k]) => k);
export const DIAS_CORTE = 7;

// ¿Esta comisión vencida puede cortar permisos? Solo si se sabe que el cliente pagó: el socio marcó «Pago recibido»
// (pagoRecibido en la reserva; las de antes, con su chat «pagada»: chatPagado) o el equipo la marcó «Cobrar comisión»
// desde la alerta de cada mañana. Una confirmada sin pago marcado no corta sola (el cliente quizá nunca pagó); la fuga
// la cuidan esa alerta y la de fechas bloqueadas después. Una reserva sin chat (a mano o de antes) cuenta como antes.
export const cuentaParaCorte = (r, ahora) => V().cobrable(r, ahora);
// ¿Hay que leer su chat para saberlo? (vencida hace DIAS_CORTE días o más, con chat y sin marca en la reserva). Quien lo
// lee pone chatPagado (estado «pagada») y chatComprobante (comprobanteVigente).
export const faltaSaberSiPago = (r, propietarioId, ahora) => r?.propietarioId === propietarioId && !cuentaParaCorte(r, ahora)
	&& (V().horasAtrasoComision(r, ahora) ?? -1) >= DIAS_CORTE * 24;

// Lo que debe un socio: las comisiones vencidas (desde la primera hora de atraso), por moneda, la más vieja y si ya
// pasaron los días del corte (cuentaParaCorte). Cuenta solo sus reservas (las de una casa que fue suya siguen siendo suyas).
export function deudaDe(reservas, propietarioId, ahora) {
	const porMoneda = {};
	let vence = '';
	let corta = false;
	for (const r of reservas || []) {
		if (!propietarioId || r.propietarioId !== propietarioId) continue;
		const horas = V().horasAtrasoComision(r, ahora);
		if (horas === null || horas < 0) continue;
		const moneda = r.moneda || r.comision.moneda || 'USD';
		porMoneda[moneda] = Math.round(((porMoneda[moneda] || 0) + Number(r.comision.monto)) * 100) / 100;
		if (!vence || r.comision.vence < vence) vence = r.comision.vence;
		if (horas >= DIAS_CORTE * 24 && cuentaParaCorte(r, ahora)) corta = true;
	}
	if (!vence) return null;
	const dias = Math.floor((ahora - (Date.parse(`${vence}T00:00:00-06:00`) + 86400000)) / 86400000);
	return { porMoneda, vence, dias, corta };
}

// Los permisos que quedan: lo de todos, lo de él y el corte (salvo que el administrador se los devolvió).
export function permisosDe({ global, propio, deuda } = {}) {
	const g = global || {}, p = propio || {};
	const cortado = Boolean(deuda?.corta) && !p.devolver;
	const out = {};
	for (const k of CLAVES) out[k] = !cortado && g[k] !== false && p[k] !== false;
	out.motivo = cortado ? 'atraso' : CLAVES.some((k) => g[k] === false) ? 'todos' : CLAVES.some((k) => p[k] === false) ? 'propio' : '';
	out.devuelto = Boolean(deuda?.corta) && Boolean(p.devolver);
	return out;
}

// «Devolver hasta que pague» se quita solo cuando ya no hay corte (pagó o se canceló la reserva).
export const limpiarDevolver = (propio, deuda) => Boolean(propio?.devolver) && !deuda?.corta;

// El documento que se guarda en permisosSocios/{id} (sin la hora: así se compara con lo guardado).
export function documentoPermisos(permisos, deuda) {
	return { precios: permisos.precios, fechas: permisos.fechas, casa: permisos.casa, motivo: permisos.motivo, devuelto: permisos.devuelto,
		deuda: deuda ? { porMoneda: deuda.porMoneda, vence: deuda.vence, dias: deuda.dias } : null };
}
// ¿Lo guardado ya es esto? (para no escribir de más: el servidor lo revisa cada hora).
// Con las llaves en orden: la base devuelve los mapas en otro orden del que se guardaron.
const ordenado = (v) => v && typeof v === 'object' ? Object.keys(v).sort().map((k) => [k, ordenado(v[k])]) : v;
const soloDatos = (d) => d ? ordenado(documentoPermisos(d, d.deuda || null)) : null;
export const mismosPermisos = (guardado, nuevo) => JSON.stringify(soloDatos(guardado)) === JSON.stringify(soloDatos(nuevo));

// ¿Puede? Lo que leen la pantalla del socio y el servidor (sin documento: sí).
export const puede = (doc, clave) => !doc || doc[clave] !== false;
