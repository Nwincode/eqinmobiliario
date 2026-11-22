// «Estado del sistema» leído desde el servidor (lo mismo que la tarjeta de Inicio, admin/js/estado-sistema.js) y el
// correo al equipo cuando algo sigue roto después de 24 h. Lo llama el resumen de cada mañana (resumen-diario.mjs).
import '../../js/calc-vacacional.js';
import { listar, leerPrivado, consultar, donde } from './firestore.mjs';
import { enviarCorreo, destinatariosEquipo, servicioCorreo, plantilla, datos, boton, SITE_URL } from './correo.mjs';
import { armarEstado, rotoMasDeUnDia, correosDe, calendariosDe } from '../../admin/js/estado-sistema.js';

const V = globalThis.EQVacacional;
const fecha = (v) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v));
const seguro = (p, vacio) => p.catch((err) => { console.error('Estado del sistema:', err.message); return vacio; });

export async function leerEstado(ahora = Date.now()) {
	const [lista, publish, chats, pagos, casas] = await Promise.all([
		seguro(listar('estado'), []),
		seguro(leerPrivado('meta/publish'), {}),
		seguro(consultar('chats', 'avisoPendiente', '\u0001'), []),
		seguro(donde('cambiosDatosPago', 'avisado', false), []),
		seguro(donde('properties', 'operacion', 'vacacional'), [])
	]);
	const calendarios = (await Promise.all(casas.map(async (c) => {
		const [leido, socio] = await Promise.all([leerPrivado(`properties/${c.id}/privado/icalLeido`).catch(() => null), leerPrivado(`properties/${c.id}/privado/socio`).catch(() => null)]);
		return calendariosDe(c, leido, socio, V.CALENDARIOS);
	}))).flat();
	return armarEstado({
		estados: Object.fromEntries(lista.map(({ id, ...d }) => [id, d])), publish: publish || {}, correos: correosDe(chats),
		pagos: pagos.map((p) => ({ desde: p.cuando })), calendarios, ahora
	});
}

// Lo roto desde hace más de 24 h, en un correo al equipo (cada mañana, mientras siga roto). Devuelve cuántos renglones.
export async function avisarSiSigueRoto(ahora = Date.now()) {
	if (!servicioCorreo() || !destinatariosEquipo().length) return 0;
	const rotos = rotoMasDeUnDia(await leerEstado(ahora), ahora);
	if (!rotos.length) return 0;
	const filas = rotos.map((x) => [x.titulo, [x.detalle, x.desde ? `desde ${fecha(x.desde)}` : ''].filter(Boolean).join(' · ')]);
	const html = await plantilla({
		titulo: 'Algo sigue sin funcionar',
		intro: 'Lleva más de un día así. En el panel, Inicio → Estado del sistema dice dónde se arregla cada uno.',
		bloques: (c) => datos(c, filas) + boton(c, 'Abrir el panel', `${SITE_URL}/admin/#/`, c.primary, { ancho: true })
	});
	await enviarCorreo({ para: destinatariosEquipo(), asunto: `Estado del sistema: ${rotos.length === 1 ? rotos[0].titulo : `${rotos.length} cosas siguen sin funcionar`}`, html, texto: filas.map(([k, v]) => `${k}${v ? `: ${v}` : ''}`).join('\n') });
	return rotos.length;
}
