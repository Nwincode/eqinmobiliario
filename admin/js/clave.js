// La contraseña del panel: una sola pieza para el campo con ojito, las reglas y la revisión mientras se escribe.
// Buenas prácticas (NIST 800-63B rev. 4; pide 15 cuando la contraseña es lo único para entrar, 8 con verificación en dos
// pasos; aquí 10 por decisión del usuario, con lo demás como respaldo): largo mínimo, nada de las más usadas ni con el correo, revisar que no esté en
// filtraciones conocidas, dejar verla y pegarla; sin reglas raras de «una mayúscula y un símbolo».
import { h } from './ui.js';

export const MIN_CLAVE = 10;
// Las más usadas en el mundo y las obvias de la empresa: no se aceptan.
// (Con 10 caracteres o más, las cortas de siempre ya no pasan; las filtradas las atrapa `filtrada`.)
const COMUNES = new Set(['equipoinmobiliario', 'equipoinmobiliario1', 'eqinmobiliario.gt', 'contraseñasegura', 'contrasenasegura', 'passwordpassword', 'contraseñacontraseña', 'guatemalaguatemala', 'iloveyouiloveyou']);
const SECUENCIAS = '0123456789 9876543210 abcdefghijklmnopqrstuvwxyz qwertyuiopasdfghjklzxcvbnm';

// Campo de contraseña con el ojito para verla o esconderla, y aviso si las mayúsculas están fijas (Bloq Mayús).
export function conOjo(input) {
	const mayus = h('div', { class: 'form-text text-warning d-none', role: 'status' }, h('span', { class: 'icon-exclamation-triangle me-1', 'aria-hidden': 'true' }), 'Tienes las mayúsculas fijas (Bloq Mayús).');
	const revisarMayus = (e) => { if (e.getModifierState) mayus.classList.toggle('d-none', !e.getModifierState('CapsLock')); };
	input.addEventListener('keydown', revisarMayus);
	input.addEventListener('keyup', revisarMayus);
	input.addEventListener('blur', () => mayus.classList.add('d-none'));
	const icono = h('span', { class: 'icon-eye', 'aria-hidden': 'true' });
	const ojo = h('button', { type: 'button', class: 'btn btn-outline-secondary btn-ico', 'aria-label': 'Mostrar contraseña', 'aria-pressed': 'false', onclick: () => {
		const ver = input.type === 'password';
		input.type = ver ? 'text' : 'password';
		icono.className = ver ? 'icon-eye-slash' : 'icon-eye';
		ojo.setAttribute('aria-pressed', String(ver));
	} }, icono);
	return [h('div', { class: 'input-group' }, input, ojo), mayus];
}

// Lo que se le pide a una contraseña nueva, en el orden en que se muestra. ok(clave, email) → true si cumple.
const REGLAS = [
	{ texto: `${MIN_CLAVE} caracteres o más: una frase de 2 o 3 palabras, como «casa del lago»`, ok: (c) => c.length >= MIN_CLAVE, falla: `Usa al menos ${MIN_CLAVE} caracteres.` },
	{ texto: 'Que no sea fácil de adivinar', falla: 'Esa contraseña es muy fácil de adivinar: usa otra.',
		ok: (c) => { const m = c.toLowerCase(); return m.length >= MIN_CLAVE && !COMUNES.has(m) && !/^(.)\1+$/.test(m) && !(m.length >= 4 && SECUENCIAS.includes(m)); } },
	{ texto: 'Que no lleve tu correo', falla: 'La contraseña no puede llevar tu correo.',
		ok: (c, email) => { const u = String(email || '').toLowerCase().split('@')[0]; return Boolean(c) && !(u.length >= 4 && c.toLowerCase().includes(u)); } }
];
export function debilidad(clave, email) { return REGLAS.find((r) => !r.ok(clave, email))?.falla || ''; }

// ¿Aparece en filtraciones conocidas? (Have I Been Pwned por rangos: solo salen los 5 primeros caracteres de su huella
// SHA-1, nunca la contraseña.) Sin respuesta en 4 s, no se bloquea a nadie.
export async function filtrada(clave) {
	try {
		const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(clave)))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
		// GET simple, sin encabezados propios: así el navegador no pide permiso antes (CORS) y la consulta no se cae.
		const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { signal: AbortSignal.timeout(4000), referrerPolicy: 'no-referrer' });
		if (!res.ok) { console.warn('Revisión de filtraciones sin respuesta:', res.status); return false; }
		return (await res.text()).split('\n').some((l) => { const [resto, veces] = l.trim().split(':'); return resto === hex.slice(5) && Number(veces) > 0; });
	} catch (err) { console.warn('Revisión de filtraciones sin respuesta:', err?.name || err); return false; }
}

// Lista que se pone al día mientras se escribe: ✓ lo que ya cumple; y si las dos son iguales. Cada campo apunta a su
// lista (aria-describedby) y cada línea dice «cumple» o «falta» en texto para el lector de pantalla; sin aria-live,
// que hablaría en cada tecla.
export function revisionEnVivo(clave, repite, email) {
	const item = (texto) => {
		const ico = h('span', { class: 'icon-circle-thin', 'aria-hidden': 'true' });
		const estado = h('span', { class: 'visually-hidden' }, '');
		return { ico, estado, li: h('li', { class: 'clave-regla' }, ico, estado, h('span', {}, texto)) };
	};
	const filas = REGLAS.map((r) => ({ r, ...item(r.texto) }));
	const igual = item('Las dos son iguales');
	const marcar = (f, ok, tocado) => {
		f.ico.className = ok ? 'icon-check' : tocado ? 'icon-times' : 'icon-circle-thin';
		f.estado.textContent = ok ? 'Cumple: ' : 'Falta: ';
		f.li.classList.toggle('ok', ok); f.li.classList.toggle('falta', !ok && tocado);
	};
	const pintar = () => {
		filas.forEach((f) => marcar(f, Boolean(clave.value) && f.r.ok(clave.value, email), Boolean(clave.value)));
		// Mientras la va escribiendo igual a la primera, sin ✗: solo cuando ya no coincide.
		marcar(igual, Boolean(repite.value) && repite.value === clave.value, Boolean(repite.value) && !clave.value.startsWith(repite.value));
	};
	clave.addEventListener('input', pintar);
	repite.addEventListener('input', pintar);
	pintar();
	const reglas = h('ul', { class: 'clave-reglas', id: `${clave.id}-reglas` }, filas.map((f) => f.li));
	const iguales = h('ul', { class: 'clave-reglas', id: `${repite.id}-reglas` }, igual.li);
	clave.setAttribute('aria-describedby', reglas.id);
	repite.setAttribute('aria-describedby', iguales.id);
	return { reglas, iguales };
}
