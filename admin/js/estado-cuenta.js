// Estado de cuenta del mes de un socio (puro): sus reservas confirmadas con llegada en ese mes, su parte y la ganancia de
// EQ (la comisión que él le paga a EQ), pagada y pendiente, cada moneda por su lado (nunca se suman Q y US$). Las
// reservas, noches y su parte salen de la misma cuenta de Rentas y de «Mis propiedades» (V.resumenReservas). Lo usa el
// correo del día 1 (netlify/functions/estado-cuenta.mjs); lo prueba scripts/test-estado-cuenta.mjs.
import { sumarPorMoneda } from './formato.js';

const V = () => globalThis.EQVacacional;

// El mes anterior al día `hoy` ('AAAA-MM-DD', el de Guatemala): 'AAAA-MM'.
export function mesAnterior(hoy) {
	const [a, m] = String(hoy).split('-').map(Number);
	return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

// reservas: las de todos (cada una con su propietarioId: quien la ganó, aunque la casa ya sea de otro).
export function estadoDeCuenta(reservas, propietarioId, mes) {
	const lista = (reservas || []).filter((r) => r.propietarioId === propietarioId && V().confirmada(r) && String(r.llegada || '').startsWith(mes))
		.sort((a, b) => String(a.llegada).localeCompare(String(b.llegada)));
	const resumen = V().resumenReservas(lista);
	// La ganancia de EQ de cada reserva (su comisión), pagada o no: cada moneda por su lado (sumarPorMoneda).
	const monto = (r) => r.comision?.monto;
	const [comision, pagada, pendiente] = [lista, lista.filter((r) => r.comision?.pagada), lista.filter((r) => !r.comision?.pagada)].map((l) => sumarPorMoneda(l, monto));
	const porMoneda = {};
	for (const [m, x] of Object.entries(resumen.porMoneda)) porMoneda[m] = { tuParte: x.costoSocio, comision: V().r2(comision[m] || 0), pagada: V().r2(pagada[m] || 0), pendiente: V().r2(pendiente[m] || 0) };
	return { mes, reservas: lista, total: resumen.reservas, noches: resumen.noches, porMoneda };
}
