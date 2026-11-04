// Cliente de la función de IA (/api/ia) y ayudas para contactar clientes.
import { session } from './session.js';

export async function pedirIA(tarea, datos) {
	const token = session.user && session.user.getIdToken ? await session.user.getIdToken() : '';
	const res = await fetch('/api/ia', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ tarea, datos })
	});
	let body = {};
	try {
		body = await res.json();
	} catch {
		// Respuesta sin JSON: p. ej. la función aún no está desplegada.
	}
	if (!res.ok) {
		const msg = res.status === 404 ? 'La IA todavía no está publicada en el sitio (se activa al publicar en Netlify).' : body.error || `Error ${res.status}`;
		throw new Error(msg);
	}
	return body;
}

// Número en formato internacional para wa.me (los de 8 dígitos se asumen de Guatemala).
export function telefonoWa(tel) {
	let n = String(tel || '').replace(/\D/g, '');
	if (n.length === 8) n = `502${n}`;
	return n;
}

export function whatsappUrl(tel, mensaje) {
	const n = telefonoWa(tel);
	const text = mensaje ? `text=${encodeURIComponent(mensaje)}` : '';
	return n ? `https://wa.me/${n}${text ? `?${text}` : ''}` : `https://wa.me/?${text}`;
}

export async function copiar(texto) {
	try {
		await navigator.clipboard.writeText(texto);
		return true;
	} catch {
		return false;
	}
}
