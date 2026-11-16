// Límite de pedidos por clave (IP, chat…) dentro de una ventana. Es de mejor esfuerzo: vive en la memoria de cada
// instancia de la función (Netlify puede levantar varias y reiniciarlas), así que frena ráfagas, no a un atacante decidido.
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
