// El estado de cuenta de un socio, a mano (solo administradores; botón de la ficha del socio, admin/js/estado-cuenta-enviar.js).
// POST /api/estado-cuenta { accion: 'vista' | 'enviar', propietarioId, mes: 'AAAA-MM' }
//   vista  → { asunto, html, para }: el correo tal cual, sin mandarlo.
//   enviar → lo manda al correo del socio. Es el mismo correo y la misma cuenta del día 1 (netlify/lib/estado-cuenta.mjs).
// No toca el envío del día 1 (`enviado` y `apartado` de estadosCuenta/{socio}_{mes}): solo anota ahí quién y cuándo
// (`manual`: [{ quien, nombre, cuando }], y el último en `manualCuando`).
import '../../js/calc-vacacional.js';
import { staffUser, json } from '../lib/auth.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { servicioCorreo, enviarCorreo } from '../lib/correo.mjs';
import { limitador } from '../lib/limite.mjs';
import { correoValido } from '../../admin/js/formato.js';
import { estadoDeCuenta } from '../../admin/js/estado-cuenta.js';
import { reservasDeSocio, correoDeCuenta } from '../lib/estado-cuenta.mjs';

const V = globalThis.EQVacacional;
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
// Por administrador: 30 vistas y 10 envíos cada 10 minutos.
const muchasVistas = limitador(30), muchosEnvios = limitador(10);

export default async (req) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	const user = await staffUser(req).catch(() => null);
	if (!user?.admin) return json(403, { error: 'Solo para administradores.' });
	const { accion, propietarioId, mes } = await req.json().catch(() => ({}));
	if (accion !== 'vista' && accion !== 'enviar') return json(400, { error: 'Acción desconocida' });
	if (!ID.test(String(propietarioId || ''))) return json(400, { error: 'Falta el socio.' });
	if (!MES.test(String(mes || '')) || mes > V.hoy().slice(0, 7)) return json(400, { error: 'Elige un mes que ya empezó.' });
	if ((accion === 'vista' ? muchasVistas : muchosEnvios)(user.uid)) return json(429, { error: 'Demasiados intentos seguidos. Espera unos minutos.' });
	if (!datosConfigurados()) return json(503, { error: 'Falta la cuenta de servicio de Google en Netlify.' });
	if (accion === 'enviar' && !servicioCorreo()) return json(503, { error: 'El correo no está configurado en Netlify: no se puede enviar.' });
	if (accion === 'enviar' && !escrituraConfigurada()) return json(503, { error: 'Falta la cuenta de escritura de Google en Netlify: no se puede anotar el envío.' });
	try {
		const socio = await leerPrivado(`propietarios/${propietarioId}`);
		if (!socio) return json(404, { error: 'Ese socio no existe.' });
		const para = String(socio.email || '').trim();
		if (!correoValido(para)) return json(422, { error: 'Este socio no tiene un correo válido en su ficha: agrégalo y vuelve a intentar.' });
		const ahora = Date.now();
		const c = await correoDeCuenta(socio, estadoDeCuenta(await reservasDeSocio(propietarioId, ahora), propietarioId, mes, ahora));
		if (accion === 'vista') return json(200, { asunto: c.asunto, html: c.html, para });
		await enviarCorreo({ para, asunto: c.asunto, html: c.html, texto: c.texto });
		// Quién y cuándo, sin tocar `enviado` ni `apartado` (el envío del día 1 sigue igual). Si no se pudo anotar, el correo
		// ya salió: se dice que salió.
		const ruta = `estadosCuenta/${propietarioId}_${mes}`;
		const marca = { quien: user.uid, nombre: user.nombre || '', cuando: new Date(ahora).toISOString() };
		await transaccion(async ({ leer, crear, cambiar }) => {
			if (await leer(ruta)) cambiar(ruta, { manualCuando: marca.cuando }, { agregar: { manual: [marca] } });
			else crear(ruta, { manualCuando: marca.cuando, manual: [marca] });
		}).catch((err) => console.error('Estado de cuenta a mano (anotar):', err.message));
		return json(200, { ok: true, para });
	} catch (err) {
		console.error('Estado de cuenta a mano:', err.message);
		return json(502, { error: `No se pudo ${accion === 'vista' ? 'preparar' : 'enviar'} el estado de cuenta: ${err.message}` });
	}
};

export const config = { path: '/api/estado-cuenta' };
