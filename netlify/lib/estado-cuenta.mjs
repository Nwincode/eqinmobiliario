// El estado de cuenta de un socio en el servidor: qué reservas se leen y el correo. Una sola pieza para el envío del
// día 1 (netlify/functions/estado-cuenta.mjs) y el del administrador a mano (netlify/functions/estado-cuenta-panel.mjs):
// los mismos números (admin/js/estado-cuenta.js). Lo prueba scripts/test-estado-cuenta.mjs.
import '../../js/calc-vacacional.js';
import { consultar, donde } from './firestore.mjs';
import { conSuChat } from './comisiones.mjs';
import { plantilla, datos, lista, boton, subtitulo, esc, SITE_URL } from './correo.mjs';
import { dinero, dineroPorMoneda, nNoches } from '../../admin/js/formato.js';
import { rango } from '../../admin/js/texto-dueno.js';

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
// Una reserva: la casa, sus fechas, el monto de la comisión y cómo va (lista() de correo.mjs; en el texto plano, una
// línea: «Casa Lago · 5 – 7 oct: US$ 30.50 · vencida»).
const fila = (x, anio) => ({ nombre: x.reserva.propertyTitulo || x.reserva.codigo || 'Reserva', detalle: rango({ desde: x.reserva.llegada, hasta: x.reserva.salida }, anio),
	monto: dinero(x.monto, x.moneda), estado: x.estado });

// El correo de un socio (cuenta: estadoDeCuenta). Devuelve { asunto, html, texto }.
export async function correoDeCuenta(socio, cuenta) {
	const porPagar = dineroPorMoneda(cuenta.porPagar);
	const resumen = [['Por pagar a EQ', porPagar || 'Nada'], ['Ya vencido', dineroPorMoneda(cuenta.vencido) || 'Nada: estás al día']];
	const [texto, url] = porPagar ? ['Subir comprobante', `${SITE_URL}/admin/#/solicitudes`] : ['Abrir mi panel', `${SITE_URL}/admin/`];
	const mes = mayuscula(nombreMes(cuenta.mes, { month: 'long' }));
	const delMes = cuenta.total ? [['Reservas', `${cuenta.total} · ${nNoches(cuenta.noches)}`], ['Tu parte', dineroPorMoneda(cuenta.tuParte)],
		['Ganancia de EQ', dineroPorMoneda(cuenta.comision)], ['Ya pagaste', dineroPorMoneda(cuenta.pagada)]] : [];
	const anio = cuenta.mes.slice(0, 4);
	// Las filas: las del mes (si las hay), las de antes y las próximas (las que ya suman en «Por pagar a EQ»).
	const bloques = [[mes, cuenta.reservas], ['De meses anteriores', cuenta.anteriores], ['Próximas', cuenta.proximas]]
		.map(([t, l]) => [t, l.map((x) => fila(x, anio))]).filter(([, l]) => l.length);
	const titulo = `Tu estado de cuenta de ${nombreMes(cuenta.mes, { month: 'long', year: 'numeric' })}`;
	const nombre = String(socio.nombre || '').trim().split(' ')[0];
	const intro = `Hola${nombre ? ` ${nombre}` : ''}, esto es lo que llevas con EQ.`;
	const html = await plantilla({
		titulo,
		intro: esc(intro),
		bloques: (c) => datos(c, resumen) + boton(c, texto, url, c.primary, { ancho: true })
			+ bloques.map(([t, l], i) => subtitulo(c, t, { arriba: i ? 0 : 24 }) + (t === mes ? datos(c, delMes) : '') + lista(c, l)).join(''),
		pie: 'Lo recibes porque tienes casas en renta por noche con eqinmobiliario.gt.'
	});
	const lineas = (l) => l.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
	const textoPlano = [titulo, '', intro, '', ...lineas(resumen), '', `${texto}: ${url}`,
		...bloques.flatMap(([t, l]) => ['', t, ...(t === mes ? [...lineas(delMes), ''] : []), ...l.map((f) => `${f.nombre} · ${f.detalle}: ${[f.monto, f.estado].filter(Boolean).join(' · ')}`)])].join('\n');
	return { asunto: `${titulo} · Equipo Inmobiliario`, html, texto: textoPlano };
}
