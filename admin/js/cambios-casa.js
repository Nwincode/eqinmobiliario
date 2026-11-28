// Guardar una propiedad sin pisar lo que escriben otras pantallas mientras la ficha está abierta (Solicitudes y
// Rentas: noches reservadas; el dueño en «Mis propiedades»: precios, días bloqueados, mínimos y personas;
// Difusión; el listado: estado, visible, fotos…). Sin dependencias del navegador: lo prueba
// scripts/test-cambios-casa.mjs. Lo usan la ficha (admin/js/views/properties.js `guardarCambios`), el importador y
// las pantallas simples (`guardarSobre` en admin/js/crud.js).
import { estadoDe } from './estados.js';
// Ruta relativa: también corre en Node (el servidor arma la casa que sube el socio: netlify/functions/mi-casa-nueva.mjs).
import '../../js/calc-vacacional.js';

const V = globalThis.EQVacacional;

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

// Documento entero de una pantalla simple (asesor, reseña, página, artículo: admin/js/crud.js): lo que cambió quien
// guarda («alAbrir» → «mio») sobre lo guardado AHORA; los grupos (en, seo…) campo por campo. Así una pestaña abierta
// desde antes no borra lo que otra guardó mientras tanto.
export function guardarSobre(actual = {}, alAbrir = {}, mio = {}) {
	const grupos = [...new Set([alAbrir, mio].flatMap((o) => Object.keys(o || {}).filter((k) => esObjeto(o[k]))))];
	return aplicarCambios(actual, cambiosEntre(alAbrir, mio, grupos), grupos);
}

// Una entrada del historial de estados («quien»: { fecha, porUid }; serverTimestamp no va dentro de arreglos). Sin el
// nombre de quien la cambió: la casa publicada la lee cualquiera (firestore.rules) y el uid basta (pausaPropia).
export const entradaEstado = (estado, { fecha, porUid = '' } = {}) => ({ estado, fecha, porUid });
// El historial de estados sin los nombres que se guardaban antes (`por`), con todo lo demás igual; null si no tiene
// ninguno (no hay nada que cambiar). Lo usa la migración (netlify/lib/migrar-chats.mjs, «Pasar datos al formato nuevo»).
export function historialSinNombres(historial) {
	if (!Array.isArray(historial) || !historial.some((e) => e && typeof e === 'object' && 'por' in e)) return null;
	return historial.map((e) => { if (!e || typeof e !== 'object') return e; const { por, ...resto } = e; return resto; });
}

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
// Personas máximo: un entero de 1 a 50 (lo mismo que deja firestore.rules al dueño).
export const HUESPEDES_MAX = 50;
export const huespedesMaxDe = (n) => Math.min(HUESPEDES_MAX, Math.max(1, Math.floor(Number(n) || 1)));

// Lo que trae toda propiedad nueva (la ficha le pone el asesor de quien la crea). Nueva cada vez: sus listas no se comparten.
export const casaBase = () => ({ operacion: 'venta', tipo: 'casa', estado: 'disponible', moneda: 'USD', ciudad: 'Guatemala', publicado: false, agentId: '', fotos: [], amenidades: [], vipLanding: {}, seo: {} });
// Una propiedad al nacer: lo de siempre, lo que trae y su historial de estado y de precio empezado («quien»: { fecha,
// porUid }). La usan la ficha (propiedadNueva en admin/js/views/properties.js, con quién y cuándo la creó) y el servidor
// (la casa que sube el socio).
export function casaQueNace(datos, quien) {
	const d = { ...casaBase(), descripcion: '', ...datos };
	const hist = historialCon(null, d, quien);
	return Object.assign(d, { estado: hist.estado, historialEstado: hist.historialEstado, historialPrecio: hist.historialPrecio });
}

// Precios públicos de una casa por noche: los del socio (privado/socio) más el margen, y lo demás de la estancia con su
// forma. Puro: lo usan la ficha, el importador y el servidor (la casa que sube el socio).
// El plan de precios del socio (privado/socio) en la forma de V.planPublico.
export const planSocioDe = (s = {}) => ({ base: s.precioBase, finde: s.precioFinde, tarifas: s.tarifas || [] });
export function vacacionalPublico(d) {
	const pub = V.planPublico(planSocioDe(d.socio), d.socio?.margen);
	const v = d.vacacional || {};
	// En la ficha un bloqueo se escribe por noches (primera y última, incluida); se guarda como rango { desde, hasta }
	// con «hasta» = el día que queda libre, igual que las reservas y los calendarios.
	const bloqueos = V.unirRangos((v.bloqueos || []).map((b) => ({ desde: b?.desde, hasta: b?.ultima ? V.sumarDias(b.ultima, 1) : b?.hasta })));
	return {
		precio: V.precioDesde(pub, V.hoy()) || null,
		vacacional: {
			base: pub.base, finde: pub.finde, tarifas: pub.tarifas,
			nochesMin: Math.max(1, Math.floor(Number(v.nochesMin) || 1)),
			huespedesMax: huespedesMaxDe(v.huespedesMax),
			limpieza: V.r2(Number(v.limpieza) || 0), deposito: V.r2(Number(v.deposito) || 0),
			checkIn: v.checkIn || '15:00', checkOut: v.checkOut || '11:00',
			camas: Math.max(0, Math.floor(Number(v.camas) || 0)), mascotas: v.mascotas || '',
			comoLlegar: v.comoLlegar || '', reglas: v.reglas || '', cancelacion: v.cancelacion || '',
			// Solo si se eligió: las casas de antes no cambian al guardarse.
			...(v.cancelacionPolitica ? { cancelacionPolitica: v.cancelacionPolitica } : {}),
			bloqueos
			// Los mínimos de noches (los pone el dueño) y las noches reservadas (Solicitudes y Rentas) no salen de
			// aquí: guardarCambios los deja como están en la base.
		}
	};
}
