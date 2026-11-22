// Estado del sistema (estado/{pieza}): lo que falló y desde cuándo, para la tarjeta «Estado del sistema» de Inicio
// (admin/js/estado-sistema.js, solo el administrador la lee) y el correo de cada mañana si algo sigue roto
// (resumen-diario.mjs). Lo escribe solo el servidor, con la cuenta de escritura (firestore.rules: nadie del panel).
// Cada documento: { ok, fallo, falloDesde, motivo }. Roto = el último fallo es más nuevo que el último ok; `falloDesde`
// se pone solo al pasar de bien a mal, así dice desde cuándo. Lo de los relojes automáticos: `ok` al terminar cada vuelta.
// Nada de aquí cambia la respuesta de quien llama ni hace fallar un reloj: un error al anotar solo queda en el registro.
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';

const HORA = 3600_000;
// Lo mismo bien una y otra vez (cada correo que sale) no se anota cada vez: una por hora por instancia de la función.
const ultimo = new Map();
const toca = (clave, cada) => { const t = ultimo.get(clave) || 0; if (Date.now() - t < cada) return false; ultimo.set(clave, Date.now()); return true; };

const escribir = (ruta, fn) => (escrituraConfigurada()
	? transaccion(async ({ leer, crear, cambiar }) => { const d = await leer(ruta); const c = fn(d); if (!c) return; if (d) cambiar(ruta, c); else crear(ruta, c); }, 2, 3000)
		.catch((err) => console.error(`Estado (${ruta}):`, err.message))
	: Promise.resolve());

const rota = (d) => Boolean(d?.fallo) && !(d?.ok >= d.fallo);

// Salió bien. `cada`: cada cuánto se anota como mucho (los relojes, siempre: 0).
export function anotarOk(pieza, { cada = HORA } = {}) {
	if (cada && !toca(`ok:${pieza}`, cada)) return Promise.resolve();
	ultimo.delete(`fallo:${pieza}`);
	return escribir(`estado/${pieza}`, () => ({ ok: new Date(Date.now()) }));
}

// Falló (con el motivo en una línea). Un fallo repetido se anota a lo más cada 10 minutos.
export function anotarFallo(pieza, motivo, { cada = 10 * 60_000 } = {}) {
	if (cada && !toca(`fallo:${pieza}`, cada)) return Promise.resolve();
	ultimo.delete(`ok:${pieza}`);
	const ahora = new Date(Date.now());
	return escribir(`estado/${pieza}`, (d) => ({ fallo: ahora, motivo: String(motivo || '').slice(0, 200), ...(rota(d) ? {} : { falloDesde: ahora }) }));
}

// Un tope anti-robots alcanzado (limite.mjs, una vez por hora): queda en estado/limites, uno por límite.
export function anotarTope(nombre, max, minutos) {
	if (!toca(`tope:${nombre}`, HORA)) return Promise.resolve();
	const clave = String(nombre).replace(/[^A-Za-z0-9_]/g, '_');
	return escribir('estado/limites', () => ({ [clave]: { nombre: String(nombre), max, minutos, cuando: new Date(Date.now()) } }));
}

// Un reloj automático (función programada): corre `fn` y anota su última vuelta buena en estado/{nombre}. Si lanza, el
// fallo queda anotado y el error sigue su camino (el registro de Netlify lo muestra igual).
export function conReloj(nombre, fn) {
	return async (...args) => {
		try {
			const r = await fn(...args);
			await anotarOk(nombre, { cada: 0 });
			return r;
		} catch (err) {
			await anotarFallo(nombre, err?.message, { cada: 0 });
			throw err;
		}
	};
}
