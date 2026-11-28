// El cierre de una casa en venta o renta: cuándo se vendió o se rentó y por cuánto (el precio final). Puro (también
// corre en Node; lo prueba scripts/test-reportes.mjs).
// Dónde vive: properties/{id}/privado/cierre ({ fechaCierre, precioFinal?, moneda, operacion, pedidoId?, por, updatedAt }).
// Nunca en la casa: su documento lo lee cualquiera mientras está publicada (y una vendida sigue publicada con su aviso);
// privado/ lo leen solo el administrador y el asesor de la casa (firestore.rules), y el build y los feeds no lo tocan.
// Lo escribe «Aplicar» del aviso «ya se vendió» del dueño (admin/js/views/cambios-dueno.js); lo usa Reportes.
import { comisionDe, montoComision } from './acuerdo.js';
import { enMs } from './formato.js';

export const estadoDeCierre = (operacion) => (operacion === 'renta' ? 'rentada' : 'vendida');
export const estaCerrada = (casa) => ['vendida', 'rentada'].includes(casa?.estado);

// Lo que el dueño escribe al avisar el cierre (admin/js/pedido-dueno.js «Ya se vendió» / «Ya se rentó»).
// Precio final (opcional): un número positivo, con hasta dos decimales. '' si no puso nada; null si está mal.
export function precioFinalDe(v) {
	const t = String(v ?? '').trim();
	if (!t) return '';
	const n = Number(t);
	return Number.isFinite(n) && n > 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}
// La fecha del cierre: AAAA-MM-DD, no después de hoy. '' si está bien; si no, qué falta.
export function faltaFechaCierre(fecha, hoyIso) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return 'Elige la fecha.';
	if (fecha > hoyIso) return 'La fecha no puede ser después de hoy.';
	if (fecha < '2000-01-01') return 'Revisa la fecha.';
	return '';
}

// La ficha de la casa (bloque «Cierre», admin/js/views/properties.js): lo que falta o está mal ('' si va bien). Vacío
// todo, no hay cierre que guardar; con precio, la fecha es obligatoria.
export function faltaEnCierre(c = {}, hoyIso) {
	const fecha = String(c?.fechaCierre || '');
	const hayPrecio = !(c?.precioFinal === '' || c?.precioFinal == null);
	if (!fecha && !hayPrecio) return '';
	if (!fecha) return 'Cierre: escribe la fecha.';
	const f = faltaFechaCierre(fecha, hoyIso);
	if (f) return `Cierre: ${f.charAt(0).toLowerCase()}${f.slice(1)}`;
	if (hayPrecio && precioFinalDe(c.precioFinal) === null) return 'Cierre: el precio final va solo con el número, mayor que cero.';
	return '';
}
// Qué se guarda en privado/cierre al guardar la ficha: el cierre, 'borrar' (la casa vuelve a ofrecerse, o se vaciaron
// los campos) o null (nada que hacer). Moneda y operación, de la casa; el pedido del dueño que lo trajo se conserva.
export function cierrePorGuardar(form, casa, previo) {
	const fecha = String(form?.fechaCierre || '');
	if (casa?.operacion === 'vacacional' || !estaCerrada(casa) || !fecha) return previo ? 'borrar' : null;
	const precio = precioFinalDe(form?.precioFinal);
	return { fechaCierre: fecha, ...(precio ? { precioFinal: precio } : {}), moneda: casa.moneda || 'USD', operacion: casa.operacion === 'renta' ? 'renta' : 'venta',
		...(previo?.pedidoId ? { pedidoId: previo.pedidoId } : {}) };
}

// Lo que se guarda al aplicar el pedido del dueño: la fecha y el precio que él dio, en la moneda de la CASA (nunca la
// del pedido) y con la operación de la casa.
export function cierreDePedido(pedido, casa) {
	const precio = Number(pedido?.precioFinal);
	return {
		fechaCierre: String(pedido?.fechaCierre || ''),
		...(Number.isFinite(precio) && precio > 0 ? { precioFinal: precio } : {}),
		moneda: casa?.moneda || 'USD',
		operacion: casa?.operacion === 'renta' ? 'renta' : 'venta',
		...(pedido?.id ? { pedidoId: pedido.id } : {})
	};
}

// Reportes. casasCerradas: [{ id, operacion, moneda, precio, agentId, cierre: { fechaCierre, precioFinal, moneda } }]
// (solo las que tienen su privado/cierre).
//
// 1. El cliente en «Cierre» cuyo interés tiene UNA casa cerrada con precio final: su monto es ese precio, en la moneda
//    de la casa (el monto del negocio que se anotó en el cliente era un estimado). Si tiene varias, no se adivina.
export function conPrecioFinal(clientes, casasCerradas) {
	const conPrecio = casasCerradas.filter((c) => Number(c.cierre?.precioFinal) > 0);
	return clientes.map((cl) => {
		const suyas = conPrecio.filter((c) => (cl.interes || []).includes(c.id));
		if (suyas.length !== 1) return cl;
		const casa = suyas[0];
		return { ...cl, montoEstimado: Number(casa.cierre.precioFinal), moneda: casa.cierre.moneda || casa.moneda || 'USD', casaCerrada: casa.id };
	});
}

// 2. La casa cerrada en el periodo que ningún cliente en «Cierre» tiene en su interés (p. ej. la que avisó el dueño):
//    cuenta como un cierre del asesor de la casa, con su precio final (si no lo dio, el precio publicado) y la comisión
//    acordada en esa casa (o la regla general). Así una venta no se cuenta dos veces.
//    clientesCierre: TODOS los clientes en «Cierre» (de cualquier periodo); desde: ms.
export function cierresSinCliente(casasCerradas, clientesCierre, { desde = 0, acuerdos = {}, reglas } = {}) {
	const conCliente = new Set(clientesCierre.flatMap((c) => c.interes || []));
	return casasCerradas
		.filter((c) => !conCliente.has(c.id) && c.cierre?.fechaCierre && enMs(c.cierre.fechaCierre) >= desde)
		.map((c) => {
			const operacion = c.cierre.operacion || (c.operacion === 'renta' ? 'renta' : 'venta');
			const monto = Number(c.cierre.precioFinal) > 0 ? Number(c.cierre.precioFinal) : Number(c.precio) || 0;
			return { casaId: c.id, agentId: c.agentId || '', operacion, monto, moneda: c.cierre.moneda || c.moneda || 'USD',
				comision: montoComision(comisionDe(operacion, acuerdos[c.id], reglas), monto) };
		});
}
