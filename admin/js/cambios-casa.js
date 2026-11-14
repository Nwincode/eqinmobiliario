// Guardar una propiedad sin pisar lo que escriben otras pantallas mientras la ficha está abierta (Solicitudes y
// Rentas: noches reservadas; el dueño en «Mis propiedades»: precios, días bloqueados, mínimos y personas;
// Difusión; el listado: estado, visible, fotos…). Sin dependencias del navegador: lo prueba
// scripts/test-cambios-casa.mjs. Lo usan la ficha (admin/js/views/properties.js `guardarCambios`) y el importador.
import { estadoDe } from './estados.js';

// Igualdad por contenido (el orden de las llaves no cuenta).
const ordenado = (v) => (Array.isArray(v) ? v.map(ordenado)
	: v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])])) : v);
const igual = (a, b) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// Objetos cuyos campos los escriben pantallas distintas: se comparan y se juntan campo por campo.
const POR_CAMPO = ['vacacional'];

// Lo que cambió en la ficha respecto de lo que había al abrirla («base»). undefined = se quitó.
export function cambiosEntre(base = {}, mio = {}, porCampo = POR_CAMPO) {
	const c = {};
	for (const k of new Set([...Object.keys(base || {}), ...Object.keys(mio || {})])) {
		if (porCampo.includes(k) && esObjeto(base[k]) && esObjeto(mio[k])) {
			const sub = cambiosEntre(base[k], mio[k], []);
			if (Object.keys(sub).length) c[k] = sub;
		} else if (!igual(base?.[k], mio?.[k])) c[k] = mio?.[k];
	}
	return c;
}

// Pone los cambios sobre lo que está guardado AHORA: lo que la ficha no cambió queda como lo dejó el otro.
export function aplicarCambios(actual = {}, cambios = {}, porCampo = POR_CAMPO) {
	const m = { ...(actual || {}) };
	for (const [k, v] of Object.entries(cambios)) {
		if (v === undefined) delete m[k];
		else if (porCampo.includes(k) && esObjeto(v) && esObjeto(m[k])) m[k] = aplicarCambios(m[k], v, []);
		else m[k] = v;
	}
	return m;
}

// Una entrada del historial de estados («quien»: { fecha, por, porUid }; serverTimestamp no va dentro de arreglos).
export const entradaEstado = (estado, { fecha, por = '', porUid = '' } = {}) => ({ estado, fecha, por, porUid });

// Historial de estado y de precio al guardar: lo que ya tiene la casa en la base («antes»; null si nace) y lo nuevo.
// Una sola para todo el panel: la ficha, el importador y toda propiedad nueva (propiedadNueva).
// No cambia «antes». Devuelve el estado normalizado, si cambió y los dos historiales completos.
export function historialCon(antes, despues, quien) {
	const a = antes || {};
	const estado = estadoDe(despues).valor;
	const cambioEstado = !antes || estadoDe(a).valor !== estado;
	const historialEstado = [...(a.historialEstado || []), ...(cambioEstado ? [entradaEstado(estado, quien)] : [])];
	const historialPrecio = [...(a.historialPrecio || [])];
	const precio = Number(despues.precio) || 0;
	const moneda = despues.moneda || 'USD';
	const ultimo = historialPrecio[historialPrecio.length - 1];
	if (precio && (!ultimo || Number(ultimo.precio) !== precio || (ultimo.moneda || 'USD') !== moneda)) {
		const previo = Number(a.precio) || 0;
		// Sin historial todavía (guardada antes de que existiera): el precio de antes entra con la fecha en que nació.
		if (!ultimo && previo && previo !== precio) historialPrecio.push({ precio: previo, moneda: a.moneda || 'USD', fecha: a.createdAt || quien.fecha });
		historialPrecio.push({ precio, moneda, fecha: (!ultimo && previo === precio && a.createdAt) || quien.fecha });
	}
	return { estado, cambioEstado, historialEstado, historialPrecio };
}

// Huéspedes máximos de una casa por noche: al menos 1, entero. La misma regla en la ficha y en «Mis propiedades».
export const huespedesMaxDe = (n) => Math.max(1, Math.floor(Number(n) || 1));
