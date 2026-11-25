// Base en memoria, reloj y bandeja de salida que comparten las piezas simuladas (scripts/simulado/*).
export const S = globalThis.__EQ_SIMULADO ||= { docs: new Map(), reloj: Date.parse('2026-11-20T12:00:00-06:00'), salida: [], ids: 0, socio: null, staff: null, sesion: null, resumenes: [] };
Date.now = () => S.reloj;

export const limpiar = () => { S.docs.clear(); S.archivos?.clear(); S.salida.length = 0; S.resumenes.length = 0; S.socio = null; S.staff = null; S.sesion = null; };
export const poner = (ruta, datos) => S.docs.set(ruta, structuredClone(datos));
export const leer = (ruta) => { const d = S.docs.get(ruta); return d ? { id: ruta.split('/').pop(), ...structuredClone(d) } : null; };
export const hijos = (col) => [...S.docs.keys()].filter((k) => k.startsWith(`${col}/`) && !k.slice(col.length + 1).includes('/')).map(leer);

// Como el real: campos con puntos se anidan; `ahora` pone la hora del reloj; `agregar` suma a una lista.
export function escribir(ruta, datos, { ahora = [], agregar = {} } = {}, crear = false) {
	if (crear && S.docs.has(ruta)) { const e = new Error('ALREADY_EXISTS'); e.codigo = 'ALREADY_EXISTS'; throw e; }
	if (!crear && !S.docs.has(ruta)) { const e = new Error(`NOT_FOUND ${ruta}`); e.codigo = 'NOT_FOUND'; e.status = 404; throw e; }
	const d = crear ? {} : structuredClone(S.docs.get(ruta));
	// undefined borra el campo (como un campo de la máscara que no viene en el commit).
	const en = (k, v) => { const p = k.split('.'); let o = d; for (const x of p.slice(0, -1)) o = o[x] ||= {}; if (v === undefined) delete o[p.at(-1)]; else o[p.at(-1)] = v; };
	for (const [k, v] of Object.entries(datos)) en(k, v);
	for (const k of ahora) en(k, new Date(S.reloj));
	for (const [k, l] of Object.entries(agregar)) en(k, [...(k.split('.').reduce((o, x) => o?.[x], d) || []), ...l]);
	S.docs.set(ruta, d);
}
