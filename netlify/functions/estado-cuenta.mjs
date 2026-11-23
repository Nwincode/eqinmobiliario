// Estado de cuenta mensual de cada socio, por correo: el día 1 (≈ 7:40 a. m. de Guatemala) le llega lo que debe a EQ hoy
// (por pagar y ya vencido) y su resumen del mes anterior, por moneda (admin/js/estado-cuenta.js; las reservas y el correo,
// netlify/lib/estado-cuenta.mjs, los mismos que el envío a mano del administrador). Sale si tuvo reservas ese mes o si
// algo le debe a EQ. Corre también los días 2 y 3: lo que no salió el día 1 (el correo falló o la vuelta se cortó) sale
// entonces. No se repite: antes de mandar, cada socio y mes se aparta en estadosCuenta/{propietarioId}_{mes} (solo el
// servidor, sin `match` en las reglas); salió → `enviado`; falló → se suelta para la próxima vuelta.
import '../../js/calc-vacacional.js';
import { datosConfigurados, listar } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { servicioCorreo, enviarCorreo } from '../lib/correo.mjs';
import { correoValido } from '../../admin/js/formato.js';
import { estadoDeCuenta, mesAnterior, hayQueMandar } from '../../admin/js/estado-cuenta.js';
import { reservasParaCuentas, correoDeCuenta } from '../lib/estado-cuenta.mjs';
import { conReloj } from '../lib/estado.mjs';

const V = globalThis.EQVacacional;
const PRESUPUESTO = 20_000;
const EN_CURSO = 15 * 60_000;

// ¿Le toca a este socio y mes? Lo aparta (una sola vuelta lo manda). true = mandar ahora.
const apartar = (ruta, ahora) => transaccion(async ({ leer, crear, cambiar }) => {
	const m = await leer(ruta);
	if (m?.enviado || (m && ahora - (Number(m.apartado) || 0) < EN_CURSO)) return false;
	if (m) cambiar(ruta, { apartado: ahora }); else crear(ruta, { enviado: false, apartado: ahora });
	return true;
});

// Una vuelta: manda lo que falte del mes anterior. Devuelve cuántos salieron.
export async function mandarEstadosDeCuenta(ahora = Date.now()) {
	const inicio = Date.now();
	const mes = mesAnterior(V.hoy(ahora));
	const [propietarios, reservas] = await Promise.all([listar('propietarios'), reservasParaCuentas(mes, ahora)]);
	let enviados = 0;
	for (const socio of propietarios) {
		if (Date.now() - inicio > PRESUPUESTO) { console.log('Estado de cuenta: se acabó el tiempo; sigue en la próxima vuelta.'); break; }
		const cuenta = estadoDeCuenta(reservas, socio.id, mes, ahora);
		if (!hayQueMandar(cuenta) || !correoValido(socio.email || '')) continue;
		const ruta = `estadosCuenta/${socio.id}_${mes}`;
		if (!(await apartar(ruta, ahora).catch((err) => { console.error('Estado de cuenta (apartar):', err.message); return false; }))) continue;
		try {
			const c = await correoDeCuenta(socio, cuenta);
			await enviarCorreo({ para: socio.email, asunto: c.asunto, html: c.html, texto: c.texto });
			await transaccion(({ cambiar }) => cambiar(ruta, { enviado: true }, { ahora: ['enviadoCuando'] }));
			enviados++;
		} catch (err) {
			console.error('Estado de cuenta (correo):', err.message);
			// No salió: se suelta para la próxima vuelta (días 2 y 3).
			await transaccion(({ cambiar }) => cambiar(ruta, { apartado: 0 })).catch(() => {});
		}
	}
	return enviados;
}

export default conReloj('estado-cuenta', async () => {
	if (!servicioCorreo() || !datosConfigurados() || !escrituraConfigurada()) return console.log('Estado de cuenta: falta el correo o las cuentas de servicio.');
	console.log(`Estado de cuenta: ${await mandarEstadosDeCuenta()} correo(s).`);
});

// Días 1, 2 y 3 a las 13:40 UTC (7:40 a. m. en Guatemala).
export const config = { schedule: '40 13 1-3 * *' };
