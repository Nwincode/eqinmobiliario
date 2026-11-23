// «Estado del sistema» leído desde el servidor (lo mismo que la tarjeta de Inicio, admin/js/estado-sistema.js) y el
// correo al equipo cuando algo sigue roto después de 24 h. Lo llama el resumen de cada mañana (resumen-diario.mjs).
import '../../js/calc-vacacional.js';
import { listar, leerPrivado, consultar, donde } from './firestore.mjs';
import { enviarCorreo, destinatariosEquipo, servicioCorreo, plantilla, lista, boton, SITE_URL } from './correo.mjs';
import { dia } from '../../admin/js/formato.js';
import { armarEstado, rotoMasDeUnDia, correosDe, calendariosDe } from '../../admin/js/estado-sistema.js';

const V = globalThis.EQVacacional;
// El día en Guatemala, con el formato de todo el sistema («23 nov»): lleva más de un día roto, la hora no hace falta y así
// cabe en la fila de un celular.
const fecha = (v) => dia(V.hoy(new Date(v).getTime()));
const seguro = (p, vacio) => p.catch((err) => { console.error('Estado del sistema:', err.message); return vacio; });

export async function leerEstado(ahora = Date.now()) {
	const [lista, publish, chats, pagos, pagosNuevos, casas] = await Promise.all([
		seguro(listar('estado'), []),
		seguro(leerPrivado('meta/publish'), {}),
		seguro(consultar('chats', 'avisoPendiente', '\u0001'), []),
		seguro(donde('cambiosDatosPago', 'avisado', false), []),
		seguro(donde('bitacora', 'avisado', false), []),
		seguro(donde('properties', 'operacion', 'vacacional'), [])
	]);
	const calendarios = (await Promise.all(casas.map(async (c) => {
		const [leido, socio] = await Promise.all([leerPrivado(`properties/${c.id}/privado/icalLeido`).catch(() => null), leerPrivado(`properties/${c.id}/privado/socio`).catch(() => null)]);
		return calendariosDe(c, leido, socio, V.CALENDARIOS);
	}))).flat();
	return armarEstado({
		estados: Object.fromEntries(lista.map(({ id, ...d }) => [id, d])), publish: publish || {}, correos: correosDe(chats),
		pagos: [...pagos, ...pagosNuevos].map((p) => ({ desde: p.cuando })), calendarios, ahora
	});
}

// Lo roto desde hace más de 24 h, en un correo al equipo (cada mañana, mientras siga roto). Devuelve cuántos renglones.
export async function avisarSiSigueRoto(ahora = Date.now()) {
	if (!servicioCorreo() || !destinatariosEquipo().length) return 0;
	const rotos = rotoMasDeUnDia(await leerEstado(ahora), ahora);
	if (!rotos.length) return 0;
	// Desde cuándo no funciona: lo urgente de cada fila (en rojo).
	const filas = rotos.map((x) => [x.titulo, x.detalle || '', x.desde ? `desde ${fecha(x.desde)}` : '']);
	const html = await plantilla({
		titulo: 'Algo sigue sin funcionar',
		intro: 'Lleva más de un día así. En el panel, Inicio → Estado del sistema dice dónde se arregla cada uno.',
		// Cada cosa rota: a la izquierda qué y su motivo; a la derecha, desde cuándo (en rojo).
		bloques: (c) => lista(c, filas.map(([nombre, detalle, desde]) => ({ nombre, detalle, monto: '', estado: desde, alerta: true }))) + boton(c, 'Abrir el panel', `${SITE_URL}/admin/#/`, c.primary, { ancho: true })
	});
	await enviarCorreo({ para: destinatariosEquipo(), asunto: `Estado del sistema: ${rotos.length === 1 ? rotos[0].titulo : `${rotos.length} cosas siguen sin funcionar`}`, html, texto: filas.map(([k, v, u]) => { const d = [v, u].filter(Boolean).join(' · '); return `${k}${d ? `: ${d}` : ''}`; }).join('\n') });
	return rotos.length;
}
