import { createHmac } from 'node:crypto';
import { transaccion, escrituraConfigurada, sumar } from './firestore-escritura.mjs';
import { anotarTope } from './estado.mjs';

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

// Al llegar al tope (con `avisar`): una vez por hora en el registro (console.warn) y en estado/limites (la tarjeta
// «Estado del sistema»). Lo de estado va por su lado, sin esperarlo: nunca cambia la respuesta del límite ni entra en la
// transacción de quien llama. Devuelve true (ya pasó el límite).
function avisoDeTope(nombre, max, ventanaMs, avisar) {
	let avisadoEn = 0;
	return () => {
		if (avisar && Date.now() - avisadoEn > 3_600_000) {
			avisadoEn = Date.now();
			const minutos = Math.round(ventanaMs / 60_000);
			console.warn(`Límite «${nombre}» en su tope (${max} en ${minutos} min).`);
			anotarTope(nombre, max, minutos);
		}
		return true;
	};
}

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
	const tope = avisoDeTope(nombre, max, ventanaMs, avisar);
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
// base aunque llegue toda a la vez. `distinto` (p. ej. el id de una solicitud): repetir el mismo no suma a la clave, pero
// suma a sus propios reintentos (a lo más `reintentos` por ventana, 6: un clic con sus reintentos automáticos por un 503 —1 + 3— y uno más) y lee cómo va la clave: se frena si la clave pasó su
// tope o si ese mismo se repitió de más (reusar un id no salta el freno). Sin `distinto`, cada pedido cuenta. Si la base
// falla, cuenta en memoria. limitadorContador(nombre, max, ventanaMs) → async (clave, distinto?) => true si ya pasó.
export function limitadorContador(nombre, max, ventanaMs, { avisar = false, reintentos = 6 } = {}) {
	const enMemoria = limitador(max, ventanaMs);
	const huella = (x) => createHmac('sha256', process.env.GOOGLE_SA_ESCRITURA_KEY || '').update(x).digest('hex');
	const tope = avisoDeTope(nombre, max, ventanaMs, avisar);
	return async (clave, distinto = '') => {
		if (!escrituraConfigurada()) return enMemoria(clave);
		const ventana = Math.floor(Date.now() / ventanaMs);
		// Un Timestamp: con la política de vida (TTL) de Firestore sobre `vence`, se borra solo (docs/portal-propietarios.md).
		const vence = new Date((ventana + 2) * ventanaMs);
		const ruta = `limites/${huella(`${nombre}:${clave}:${ventana}`)}`;
		try {
			const marca = distinto ? `limites/${huella(`${nombre}:${clave}:${ventana}:${distinto}`)}` : '';
			const r = await sumar([{ ruta, n: 1 }], vence, marca);
			if (r) return r[0] > max ? tope() : false;
			// El mismo otra vez: sus reintentos suben y la clave se lee (sumando 0).
			const [veces, n] = await sumar([{ ruta: `${marca}-r`, n: 1 }, { ruta, n: 0 }], vence);
			return n > max || veces > reintentos ? tope() : false;
		} catch (err) {
			console.error('Límite en la base (contador):', err.message);
			return enMemoria(clave);
		}
	};
}
