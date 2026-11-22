import { createHmac } from 'node:crypto';
import { transaccion, escrituraConfigurada, sumarUno } from './firestore-escritura.mjs';

// Límite de pedidos por clave (IP, chat…) dentro de una ventana. `limitador` vive en la memoria de cada instancia de la
// función (Netlify puede levantar varias y reiniciarlas): frena ráfagas, no a un atacante decidido; para eso, abajo,
// `limitadorDurable`.
// limitador(max, ventanaMs) devuelve una función: true = esta clave ya pasó el límite (responder 429).
export function limitador(max, ventanaMs = 10 * 60_000) {
	const hits = new Map();
	return (clave) => {
		const ahora = Date.now();
		const lista = (hits.get(clave) || []).filter((t) => ahora - t < ventanaMs);
		// Un pedido rechazado no cuenta: así nadie deja bloqueada una clave ajena (p. ej. el correo de otra persona).
		if (lista.length >= max) { hits.set(clave, lista); return true; }
		lista.push(ahora);
		hits.set(clave, lista);
		if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => ahora - t < ventanaMs)) hits.delete(k);
		return false;
	};
}

// La IP de quien llama, como la da Netlify.
export const ipDe = (req, context) => context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon';

// El mismo límite, pero guardado en la base (limites/{huella}): lo comparten todas las instancias de la función y no se
// pierde cuando Netlify las reinicia. Para lo que se puede abusar desde afuera (p. ej. mandar correos de contraseña).
// La clave se guarda como huella HMAC-SHA256 con un secreto del servidor (la clave de la cuenta de escritura): ni correos
// ni IPs en la base, y no se pueden adivinar probando. Las reglas no dejan a nadie del panel leer ni escribir `limites`
// (no tiene `match`). Sin la cuenta de escritura, queda el de memoria. Si la base falla o hay choque (muchos pedidos a la
// vez para la misma clave), se frena (429): justo en un ataque, no se deja pasar. Con `{ siFalla: 'memoria' }` (lo que
// un cliente de verdad necesita para seguir, como revisar fechas antes de reservar), en ese caso cuenta el de memoria.
// limitadorDurable(nombre, max, ventanaMs, opciones) → async (clave) => true si ya pasó el límite.
// `.enTransaccion(tx, clave)`: cuenta dentro de la transacción de quien llama (la del guardado): si esta falla o se
// rechaza, no cuenta, y dos pedidos a la vez no pasan los dos por el mismo cupo (la base los pone en fila).
// `{ avisar: true }`: al llegar al tope lo dice en el registro (console.warn), una vez por hora.
export function limitadorDurable(nombre, max, ventanaMs, { siFalla = 'frenar', avisar = false } = {}) {
	const enMemoria = limitador(max, ventanaMs);
	let avisadoEn = 0;
	const tope = () => { if (avisar && Date.now() - avisadoEn > 3_600_000) { avisadoEn = Date.now(); console.warn(`Límite «${nombre}» en su tope (${max} en ${Math.round(ventanaMs / 60_000)} min).`); } return true; };
	const ruta = (clave) => `limites/${createHmac('sha256', process.env.GOOGLE_SA_ESCRITURA_KEY || '').update(`${nombre}:${clave}`).digest('hex')}`;
	// Lee, decide y anota en `tx` (la transacción de quien llama). true = ya estaba en su tope (no anota nada).
	const enTx = async ({ leer, crear, cambiar }, clave) => {
		const ahora = Date.now();
		const r = ruta(clave);
		const doc = await leer(r);
		const veces = (doc?.veces || []).map(Number).filter((t) => ahora - t < ventanaMs);
		// Un pedido rechazado no cuenta (nadie deja bloqueada una clave ajena) y no se escribe nada.
		if (veces.length >= max) return tope();
		// `vence`: para que una política de vida (TTL) de Firestore borre los viejos sola, si se activa.
		const datos = { veces: [...veces, ahora], vence: new Date(ahora + ventanaMs) };
		if (doc) cambiar(r, datos); else crear(r, datos);
		return false;
	};
	const contar = async (clave) => {
		if (!escrituraConfigurada()) return enMemoria(clave);
		try {
			return await transaccion((tx) => enTx(tx, clave));
		} catch (err) {
			console.error('Límite en la base:', err.message);
			return siFalla === 'memoria' ? enMemoria(clave) : true;
		}
	};
	contar.enTransaccion = enTx;
	return contar;
}

// Un contador por ventana fija (la hora en curso) que no choca: cada pedido es un solo commit que suma 1
// (limites/{huella de nombre, clave y ventana}) y lee el valor que quedó, sin transacción; una ráfaga queda contada en la
// base aunque llegue toda a la vez. `distinto`: cuenta cosas distintas (p. ej. solicitudes por su id): repetir la misma
// no suma. Si la base falla, cuenta en memoria. limitadorContador(nombre, max, ventanaMs) → async (clave, distinto?) =>
// true si ya pasó el límite.
export function limitadorContador(nombre, max, ventanaMs, { avisar = false } = {}) {
	const enMemoria = limitador(max, ventanaMs);
	let avisadoEn = 0;
	const huella = (x) => createHmac('sha256', process.env.GOOGLE_SA_ESCRITURA_KEY || '').update(x).digest('hex');
	return async (clave, distinto = '') => {
		if (!escrituraConfigurada()) return enMemoria(clave);
		const ventana = Math.floor(Date.now() / ventanaMs);
		try {
			const n = await sumarUno(`limites/${huella(`${nombre}:${clave}:${ventana}`)}`, new Date((ventana + 2) * ventanaMs),
				distinto ? `limites/${huella(`${nombre}:${clave}:${ventana}:${distinto}`)}` : '');
			if (n === null || n <= max) return false;
			if (avisar && Date.now() - avisadoEn > 3_600_000) { avisadoEn = Date.now(); console.warn(`Límite «${nombre}» en su tope (${max} en ${Math.round(ventanaMs / 60_000)} min).`); }
			return true;
		} catch (err) {
			console.error('Límite en la base (contador):', err.message);
			return enMemoria(clave);
		}
	};
}
