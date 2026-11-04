// Herramientas del asesor. Si la IA está configurada en Netlify (ANTHROPIC_API_KEY) se usa;
// si no, o si falla, se resuelven con reglas y plantillas (admin/js/reglas.js), sin costo.
import { session } from './session.js';
import { REGLAS } from './reglas.js';

let iaActiva = null;

// ¿Está encendida la IA? Se consulta una vez por sesión del panel.
export async function estadoIA() {
	if (iaActiva !== null) return iaActiva;
	try {
		const res = await fetch('/api/ia', { cache: 'no-store' });
		iaActiva = res.ok && Boolean((await res.json()).activa);
	} catch {
		iaActiva = false;
	}
	return iaActiva;
}

async function llamarIA(tarea, datos) {
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

export async function pedirIA(tarea, datos) {
	const local = REGLAS[tarea];
	if (await estadoIA()) {
		try {
			return await llamarIA(tarea, datos);
		} catch (err) {
			if (!local) throw err;
			console.warn('La IA no respondió; se usan las reglas sin IA.', err);
		}
	}
	if (!local) throw new Error('Esta herramienta necesita la IA, que no está activada.');
	return local(datos);
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
