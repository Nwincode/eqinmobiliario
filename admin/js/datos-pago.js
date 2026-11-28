// Datos de pago del socio (una sola cuenta por persona): banco, tipo de cuenta, moneda, número y a nombre de quién.
// Puro (también corre en Node). Se guardan las partes (`pago`, para que la ficha se abra llena) y el texto que sale de
// ellas (`datosPago`), que es lo que usan el chat (el mensaje de pago lo compara letra por letra en firestore.rules), la
// bitácora, el correo de cambio, «Faltan datos de pago» y el panel del socio. El texto sale solo de `textoPago`: nadie
// lo vuelve a armar por su lado. Un `datosPago` de antes (texto libre) queda como está hasta que se llenen las partes.

export const BANCOS = ['Banco Industrial', 'Banrural', 'BAM (Agromercantil)', 'G&T Continental', 'Banco Promerica', 'BAC Credomatic',
	'Bantrab', 'Banco Internacional', 'Ficohsa', 'Banco Inmobiliario', 'Vivibanco', 'Otro'];
export const TIPOS_CUENTA = [['Monetaria', 'Monetaria'], ['Ahorro', 'Ahorro']];
export const MONEDAS_CUENTA = [['GTQ', 'Quetzales'], ['USD', 'Dólares']];

// Una línea, sin saltos ni espacios de más (así el texto siempre tiene sus tres renglones).
const linea = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Las partes limpias (lo que se guarda). «Otro» lleva el nombre del banco; los demás, no.
export function limpiarPago(p = {}) {
	const banco = BANCOS.includes(p?.banco) ? p.banco : '';
	return {
		banco,
		bancoOtro: banco === 'Otro' ? linea(p.bancoOtro, 60) : '',
		tipoCuenta: TIPOS_CUENTA.some(([v]) => v === p?.tipoCuenta) ? p.tipoCuenta : 'Monetaria',
		moneda: MONEDAS_CUENTA.some(([v]) => v === p?.moneda) ? p.moneda : 'GTQ',
		cuenta: linea(p?.cuenta, 40),
		titular: linea(p?.titular, 120)
	};
}

// Sin banco, número ni titular: no hay cuenta escrita (vale el texto de antes, si lo hay).
export const pagoVacio = (p) => !p?.banco && !linea(p?.cuenta, 40) && !linea(p?.titular, 120) && !linea(p?.bancoOtro, 60);

// Lo que falta o está mal, en palabras («» si está completo). Todo o nada: una cuenta a medias no se guarda.
export function faltaEnPago(p) {
	const x = limpiarPago(p);
	if (!x.banco) return 'Elige el banco.';
	if (x.banco === 'Otro' && !x.bancoOtro) return 'Escribe el nombre del banco.';
	if (!x.cuenta) return 'Escribe el número de cuenta.';
	if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,39}$/.test(x.cuenta)) return 'El número de cuenta lleva solo números, letras y guiones.';
	if (!x.titular) return 'Escribe a nombre de quién está la cuenta.';
	return '';
}

// «Banco Industrial / Cuenta monetaria en quetzales: 123-456789-0 / A nombre de María José Castillo Pérez».
export function textoPago(p) {
	const x = limpiarPago(p);
	return [
		x.banco === 'Otro' ? x.bancoOtro : x.banco,
		`Cuenta ${x.tipoCuenta === 'Ahorro' ? 'de ahorro' : 'monetaria'} en ${x.moneda === 'USD' ? 'dólares' : 'quetzales'}: ${x.cuenta}`,
		`A nombre de ${x.titular}`
	].join('\n');
}

// Lo que se guarda en la ficha según lo que se escribió: { pago, datosPago } o { error }.
//  - partes completas: las partes y su texto;
//  - partes vacías: si la ficha tenía partes, se borran (y el texto); si no, el texto de antes queda como está.
export function pagoPorGuardar(partes, { pagoAntes = null, textoAntes = '' } = {}) {
	if (pagoVacio(partes)) return pagoAntes && !pagoVacio(pagoAntes) ? { pago: null, datosPago: '' } : { pago: null, datosPago: textoAntes };
	const error = faltaEnPago(partes);
	if (error) return { error };
	const pago = limpiarPago(partes);
	return { pago, datosPago: textoPago(pago) };
}
