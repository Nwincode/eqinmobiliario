// Estado de cuenta mensual de cada socio, por correo: el día 1 (≈ 7:40 a. m. de Guatemala) le llega su resumen del mes
// anterior: reservas, su parte y la ganancia de EQ, pagada y pendiente, por moneda (admin/js/estado-cuenta.js, la misma
// cuenta de Rentas). Corre también los días 2 y 3: lo que no salió el día 1 (el correo falló o la vuelta se cortó) sale
// entonces. No se repite: antes de mandar, cada socio y mes se aparta en estadosCuenta/{propietarioId}_{mes} (solo el
// servidor, sin `match` en las reglas); salió → `enviado`; falló → se suelta para la próxima vuelta.
import '../../js/calc-vacacional.js';
import { datosConfigurados, listar, consultar } from '../lib/firestore.mjs';
import { escrituraConfigurada, transaccion } from '../lib/firestore-escritura.mjs';
import { servicioCorreo, enviarCorreo, plantilla, datos, boton, esc, SITE_URL } from '../lib/correo.mjs';
import { correoValido, dinero } from '../../admin/js/formato.js';
import { estadoDeCuenta, mesAnterior } from '../../admin/js/estado-cuenta.js';
import { conReloj } from '../lib/estado.mjs';

const V = globalThis.EQVacacional;
const PRESUPUESTO = 20_000;
const EN_CURSO = 15 * 60_000;
const nombreMes = (mes) => new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-15T12:00:00Z`));
const dia = (f) => { const [, m, d] = String(f).split('-'); return `${Number(d)}/${Number(m)}`; };

// ¿Le toca a este socio y mes? Lo aparta (una sola vuelta lo manda). true = mandar ahora.
const apartar = (ruta, ahora) => transaccion(async ({ leer, crear, cambiar }) => {
	const m = await leer(ruta);
	if (m?.enviado || (m && ahora - (Number(m.apartado) || 0) < EN_CURSO)) return false;
	if (m) cambiar(ruta, { apartado: ahora }); else crear(ruta, { enviado: false, apartado: ahora });
	return true;
});

// El correo de un socio. Devuelve { asunto, html, texto }.
export async function correoDeCuenta(socio, cuenta) {
	const filas = [['Reservas', `${cuenta.total} · ${cuenta.noches} ${cuenta.noches === 1 ? 'noche' : 'noches'}`]];
	for (const [m, x] of Object.entries(cuenta.porMoneda)) {
		filas.push(['Tu parte', dinero(x.tuParte, m)]);
		if (x.comision) filas.push(['Ganancia de EQ', dinero(x.comision, m)], ['Ya pagaste a EQ', x.pagada ? dinero(x.pagada, m) : ''], ['Pendiente de pagar a EQ', x.pendiente ? dinero(x.pendiente, m) : '']);
	}
	const detalle = cuenta.reservas.map((r) => [`${r.codigo || 'Reserva'} · ${r.propertyTitulo || ''}`.trim(),
		[`${dia(r.llegada)} – ${dia(r.salida)}`, Number(r.comision?.monto) ? `EQ ${dinero(r.comision.monto, r.moneda || 'USD')} ${r.comision.pagada ? 'pagada' : 'pendiente'}` : ''].filter(Boolean).join(' · ')]);
	const mes = nombreMes(cuenta.mes);
	const html = await plantilla({
		titulo: `Tu estado de cuenta de ${mes}`,
		intro: esc(`Hola ${String(socio.nombre || '').split(' ')[0] || ''}, estas son tus reservas confirmadas del mes y lo que va de cada una.`),
		bloques: (c) => datos(c, filas) + datos(c, detalle) + boton(c, 'Abrir mi panel', `${SITE_URL}/admin/#/solicitudes`, c.primary, { ancho: true }),
		pie: 'Lo recibes porque tienes casas en renta por noche con eqinmobiliario.gt.'
	});
	const texto = [`Tu estado de cuenta de ${mes}`, '', ...filas.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', ...detalle.map(([k, v]) => `${k}: ${v}`), '', `${SITE_URL}/admin/#/solicitudes`].join('\n');
	return { asunto: `Tu estado de cuenta de ${mes} · Equipo Inmobiliario`, html, texto };
}

// Una vuelta: manda lo que falte del mes anterior. Devuelve cuántos salieron.
export async function mandarEstadosDeCuenta(ahora = Date.now()) {
	const inicio = Date.now();
	const mes = mesAnterior(V.hoy(ahora));
	const [propietarios, reservas] = await Promise.all([listar('propietarios'), consultar('reservas', 'llegada', `${mes}-01`)]);
	const delMes = reservas.filter((r) => String(r.llegada).startsWith(mes));
	let enviados = 0;
	for (const socio of propietarios) {
		if (Date.now() - inicio > PRESUPUESTO) { console.log('Estado de cuenta: se acabó el tiempo; sigue en la próxima vuelta.'); break; }
		const cuenta = estadoDeCuenta(delMes, socio.id, mes);
		if (!cuenta.total || !correoValido(socio.email || '')) continue;
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
