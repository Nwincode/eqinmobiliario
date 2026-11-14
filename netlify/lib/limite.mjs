// Límite de pedidos por clave (IP, chat…) dentro de una ventana, en la memoria de cada instancia de la función.
// limitador(max, ventanaMs) devuelve una función: true = esta clave ya pasó el límite (responder 429).
export function limitador(max, ventanaMs = 10 * 60_000) {
	const hits = new Map();
	return (clave) => {
		const ahora = Date.now();
		const lista = (hits.get(clave) || []).filter((t) => ahora - t < ventanaMs);
		lista.push(ahora);
		hits.set(clave, lista);
		return lista.length > max;
	};
}

// La IP de quien llama, como la da Netlify.
export const ipDe = (req, context) => context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon';
