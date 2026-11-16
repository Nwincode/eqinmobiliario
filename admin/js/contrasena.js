// El correo para poner o cambiar la contraseña: uno solo para «Dar acceso», «Reenviar correo», Usuarios y
// «¿Olvidaste tu contraseña?». Sale con el diseño de la empresa desde /api/contrasena (netlify/functions/contrasena.mjs).
// El correo de Firebase de siempre se manda solo si no hay red hacia el servidor o si el servidor no está configurado
// (503): así no se salta el límite de pedidos ni la regla de «solo a quien entra al panel». Con 400, 404 o 429 se dice
// el porqué.
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
	if (res && res.status !== 503) throw Object.assign(new Error((await res.json().catch(() => ({}))).error || 'No se pudo enviar el correo.'), { delServidor: res.status });
	await sendPasswordResetEmail(auth, email);
}
