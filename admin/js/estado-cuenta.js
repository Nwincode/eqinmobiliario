// Estado de cuenta de un socio (puro): lo que le debe a EQ hoy y lo de un mes. Lo usan el correo del día 1
// (netlify/functions/estado-cuenta.mjs) y el envío a mano del administrador (netlify/functions/estado-cuenta-panel.mjs),
// los dos con netlify/lib/estado-cuenta.mjs; lo prueba scripts/test-estado-cuenta.mjs. Cada moneda por su lado (nunca se
// suman Q y US$).
//  - Por pagar: sus reservas confirmadas (de cualquier mes) con la comisión sin pagar y cobrable hoy (V.cobrable: se
//    sabe que el cliente pagó o ya no puede decir «No me llegó»; la misma cuenta del corte de permisos y la pausa).
//  - Ya vencido: de eso, lo que ya tiene atraso (V.nivelMora ≥ 1).
//  - El mes (por llegada): reservas, noches y su parte (V.resumenReservas, la misma cuenta de Rentas), la ganancia de EQ
//    y lo que ya pagó, y el estado de la comisión de cada una (estadoComision).
//  - De meses anteriores: las de antes del mes sin pagar y cobrables.
// Las reservas con chat necesitan chatPagado / chatComprobante (conDatosDelChat): el servidor los pone antes (conSuChat).
import { sumarPorMoneda, dia } from './formato.js';

const V = () => globalThis.EQVacacional;
const moneda = (r) => r.moneda || 'USD';
const monto = (r) => Number(r.comision?.monto) || 0;
const redondo = (t) => Object.fromEntries(Object.entries(t).map(([m, n]) => [m, V().r2(n)]));

// El mes anterior al día `hoy` ('AAAA-MM-DD', el de Guatemala): 'AAAA-MM'.
export function mesAnterior(hoy) {
	const [a, m] = String(hoy).split('-').map(Number);
	return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

// Cómo va la comisión de una reserva: 'pagada' · 'por confirmar pago' (aún no se sabe si el cliente pagó) · 'vencida' ·
// 'vence 12 dic'. '' si no tiene comisión.
export function estadoComision(r, ahora) {
	if (!monto(r)) return '';
	if (r.comision.pagada) return 'pagada';
	if (!V().cobrable(r, ahora)) return 'por confirmar pago';
	return V().nivelMora(r, ahora) >= 1 ? 'vencida' : `vence ${dia(r.comision.vence)}`;
}

// reservas: las del socio o de todos (cada una con su propietarioId: quien la ganó, aunque la casa ya sea de otro), con
// los datos de su chat. ahora: la hora de la cuenta (ms).
export function estadoDeCuenta(reservas, propietarioId, mes, ahora) {
	const suyas = (reservas || []).filter((r) => r.propietarioId === propietarioId && V().confirmada(r))
		.sort((a, b) => String(a.llegada).localeCompare(String(b.llegada)));
	const debe = suyas.filter((r) => monto(r) && !r.comision.pagada && V().cobrable(r, ahora));
	const lista = suyas.filter((r) => r.llegada.startsWith(mes));
	const resumen = V().resumenReservas(lista);
	const porMoneda = (l, f) => redondo(sumarPorMoneda(l, f, moneda));
	const fila = (r) => ({ reserva: r, monto: monto(r), moneda: moneda(r), estado: estadoComision(r, ahora) });
	return {
		mes,
		porPagar: porMoneda(debe, monto),
		vencido: porMoneda(debe.filter((r) => V().nivelMora(r, ahora) >= 1), monto),
		total: resumen.reservas,
		noches: resumen.noches,
		tuParte: Object.fromEntries(Object.entries(resumen.porMoneda).map(([m, x]) => [m, x.costoSocio])),
		comision: porMoneda(lista, monto),
		pagada: porMoneda(lista.filter((r) => r.comision?.pagada), monto),
		reservas: lista.map(fila),
		anteriores: debe.filter((r) => r.llegada < `${mes}-01`).map(fila)
	};
}

// ¿Se le manda? Con reservas en el mes o algo por pagar.
export const hayQueMandar = (cuenta) => Boolean(cuenta.total || Object.keys(cuenta.porPagar).length);
