// El estado de cuenta de un socio en el servidor: qué reservas se leen y el correo. Una sola pieza para el envío del
// día 1 (netlify/functions/estado-cuenta.mjs) y el del administrador a mano (netlify/functions/estado-cuenta-panel.mjs):
// los mismos números (admin/js/estado-cuenta.js). Lo prueba scripts/test-estado-cuenta.mjs.
import '../../js/calc-vacacional.js';
import { consultar, donde } from './firestore.mjs';
import { conSuChat } from './comisiones.mjs';
import { plantilla, datos, boton, subtitulo, esc, SITE_URL } from './correo.mjs';
import { dinero, dineroPorMoneda, nNoches } from '../../admin/js/formato.js';
import { rango } from '../../admin/js/texto-dueno.js';
import { recortar } from '../../admin/js/seo-auto.js';

const V = globalThis.EQVacacional;
// Las confirmadas con los datos de su chat (conSuChat: el mismo que la pausa y el corte de permisos).
const listas = async (l, ahora) => conSuChat(l.filter((r) => V.confirmada(r)), ahora);

// Para todos los socios: las que llegan desde el mes (las del mes, aunque ya estén pagadas) y todas las que tienen la
// comisión sin pagar (comisionDeReserva siempre pone `pagada`; el mismo índice que usa solicitudes-sin-respuesta.mjs).
export async function reservasParaCuentas(mes, ahora) {
	const [delMes, sinPagar] = await Promise.all([consultar('reservas', 'llegada', `${mes}-01`), donde('reservas', 'comision.pagada', false)]);
	return listas([...new Map([...delMes, ...sinPagar].map((r) => [r.id, r])).values()], ahora);
}
// Para uno (el envío a mano): todas las suyas.
export const reservasDeSocio = async (propietarioId, ahora) => listas(await donde('reservas', 'propietarioId', propietarioId), ahora);

const nombreMes = (mes, opciones) => new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', ...opciones }).format(new Date(`${mes}-15T12:00:00Z`));
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Una reserva en un renglón: «Casa Lago · 5 – 7 oct» | «US$ 30.50 · vencida». En el correo (corto: true) caben unos 44
// caracteres entre las dos en un celular (datos compacto, 14 px): la casa se acorta a lo que sobra y, si no sobra casi
// nada, sale (quedan las fechas y el monto). En el texto plano va completa.
const CABEN = 44;
const fila = (x, anio, corto) => {
	const fechas = rango({ desde: x.reserva.llegada, hasta: x.reserva.salida }, anio);
	const der = [dinero(x.monto, x.moneda), x.estado].filter(Boolean).join(' · ');
	const nombre = x.reserva.propertyTitulo || x.reserva.codigo || '';
	const espacio = corto ? CABEN - fechas.length - der.length - 3 : Infinity;
	// En una palabra completa (recortar); si así queda muy corta («Villa…»), en la letra («Villa Anti…»).
	const porPalabra = corto ? recortar(nombre, espacio) : nombre;
	const casa = espacio < 8 ? '' : nombre.length <= espacio || porPalabra.length >= espacio - 2 ? porPalabra : `${nombre.slice(0, espacio - 1).trimEnd()}…`;
	return [casa ? `${casa} · ${fechas}` : fechas, der];
};

// El correo de un socio (cuenta: estadoDeCuenta). Devuelve { asunto, html, texto }.
export async function correoDeCuenta(socio, cuenta) {
	const porPagar = dineroPorMoneda(cuenta.porPagar);
	const resumen = [['Por pagar a EQ', porPagar || 'Nada'], ['Ya vencido', dineroPorMoneda(cuenta.vencido) || 'Nada: estás al día']];
	const [texto, url] = porPagar ? ['Subir comprobante', `${SITE_URL}/admin/#/solicitudes`] : ['Abrir mi panel', `${SITE_URL}/admin/`];
	const mes = mayuscula(nombreMes(cuenta.mes, { month: 'long' }));
	const delMes = cuenta.total ? [['Reservas', `${cuenta.total} · ${nNoches(cuenta.noches)}`], ['Tu parte', dineroPorMoneda(cuenta.tuParte)],
		['Ganancia de EQ', dineroPorMoneda(cuenta.comision)], ['Ya pagaste', dineroPorMoneda(cuenta.pagada)]] : [];
	const anio = cuenta.mes.slice(0, 4);
	const filas = (lista, corto) => lista.map((x) => fila(x, anio, corto));
	const [reservas, anteriores] = [filas(cuenta.reservas, true), filas(cuenta.anteriores, true)];
	const titulo = `Tu estado de cuenta de ${nombreMes(cuenta.mes, { month: 'long', year: 'numeric' })}`;
	const nombre = String(socio.nombre || '').trim().split(' ')[0];
	const intro = `Hola${nombre ? ` ${nombre}` : ''}, esto es lo que llevas con EQ.`;
	const html = await plantilla({
		titulo,
		intro: esc(intro),
		bloques: (c) => datos(c, resumen) + boton(c, texto, url, c.primary, { ancho: true })
			+ (cuenta.total ? subtitulo(c, mes, { arriba: 24 }) + datos(c, delMes) + datos(c, reservas, { compacto: true }) : '')
			+ (anteriores.length ? subtitulo(c, 'De meses anteriores', { arriba: cuenta.total ? 0 : 24 }) + datos(c, anteriores, { compacto: true }) : ''),
		pie: 'Lo recibes porque tienes casas en renta por noche con eqinmobiliario.gt.'
	});
	const lineas = (l) => l.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
	const textoPlano = [titulo, '', intro, '', ...lineas(resumen), '', `${texto}: ${url}`,
		...(cuenta.total ? ['', mes, ...lineas(delMes), '', ...lineas(filas(cuenta.reservas, false))] : []),
		...(anteriores.length ? ['', 'De meses anteriores', ...lineas(filas(cuenta.anteriores, false))] : [])].join('\n');
	return { asunto: `${titulo} · Equipo Inmobiliario`, html, texto: textoPlano };
}
