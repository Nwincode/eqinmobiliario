// Herramientas del asesor. Por ahora funcionan sin IA (reglas y plantillas, sin costo).
// La función /api/ia sigue en el proyecto por si algún día se activa la IA.
import { REGLAS } from './reglas.js';

export async function pedirIA(tarea, datos) {
	const fn = REGLAS[tarea];
	if (!fn) throw new Error('Esta herramienta no está disponible.');
	return fn(datos);
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
