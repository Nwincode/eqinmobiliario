// El correo para poner o cambiar la contraseña: uno solo para «Dar acceso», «Reenviar correo», Usuarios y
// «¿Olvidaste tu contraseña?». Sale con el diseño de la empresa desde /api/contrasena (netlify/functions/contrasena.mjs).
// Si el servidor no está configurado, falla o tiene demasiados pedidos, se manda el de Firebase de siempre (en español).
// Con 400 o 404 (correo inválido, o sin acceso al panel) se dice el porqué.
import { auth, sendPasswordResetEmail } from './firebase.js';

export async function correoContrasena(email) {
	let res = null;
	try {
		const token = await auth.currentUser?.getIdToken().catch(() => '');
		res = await fetch('/api/contrasena', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify({ email })
		});
	} catch { /* sin red hacia la función: el de Firebase */ }
	if (res?.ok) return;
	if (res && (res.status === 400 || res.status === 404)) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo enviar el correo.');
	await sendPasswordResetEmail(auth, email);
}
