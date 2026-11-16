// El correo para poner o cambiar la contraseña: uno solo para «Dar acceso», «Reenviar correo», Usuarios y
// «¿Olvidaste tu contraseña?». Sale con el diseño de la empresa desde /api/contrasena (netlify/functions/contrasena.mjs);
// si el servidor todavía no está configurado o falla, se manda el de Firebase de siempre (en español).
import { auth, sendPasswordResetEmail } from './firebase.js';

export async function correoContrasena(email) {
	try {
		const token = await auth.currentUser?.getIdToken().catch(() => '');
		const res = await fetch('/api/contrasena', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify({ email })
		});
		if (res.ok) return;
		if (res.status === 429) throw Object.assign(new Error('Demasiados intentos: espera unos minutos y vuelve a probar.'), { delServidor: true });
	} catch (err) {
		if (err?.delServidor) throw err;
	}
	await sendPasswordResetEmail(auth, email);
}
