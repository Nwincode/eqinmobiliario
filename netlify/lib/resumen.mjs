// Resumen de la mañana: lo que cada asesor debe atender hoy.
// Lo usan la función programada (resumen-diario) y el botón de prueba del panel.
import '../../js/calc-vacacional.js';
import { listar, leerPrivado } from './firestore.mjs';
import { exclusivasPorVencer } from '../../admin/js/acuerdo.js';
import { conDueno as tieneDueno } from '../../admin/js/duenos.js';
import { enviarCorreo, destinatariosEquipo, plantilla, boton, esc, SITE_URL } from './correo.mjs';

const DIA = 86_400_000;
const GT = -6 * 3_600_000; // Guatemala: UTC-6 todo el año

// Inicio y fin del día de hoy en Guatemala.
function hoyGT(ahora = Date.now()) {
	const local = ahora + GT;
	const inicio = local - (local % DIA) - GT;
	return { inicio, fin: inicio + DIA };
}

const ms = (v) => (v instanceof Date ? v.getTime() : v ? new Date(v).getTime() || 0 : 0);
const hora = (v) => new Date(ms(v) + GT).toISOString().slice(11, 16);
const fecha = (v) => { const [y, m, d] = new Date(ms(v) + GT).toISOString().slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

// Junta los datos y los reparte por asesor. clave '' = sin asesor asignado.
export async function datosResumen(ahora = Date.now()) {
	const [actividades, clientes, leads, propietarios, propiedades, asesores] = await Promise.all(
		['actividades', 'clientes', 'leads', 'propietarios', 'properties', 'agents'].map((c) => listar(c).catch((err) => {
			if (c === 'actividades') throw err; // sin permiso: que se vea el error
			return [];
		}))
	);
	// La exclusiva es de cada inmueble (properties/{id}/privado/acuerdo). Si un acuerdo no se puede leer, ese
	// inmueble usa lo que quedó en su dueño y el resumen sale igual.
	const conDueno = propiedades.filter((c) => tieneDueno(c, propietarios));
	const acuerdos = Object.fromEntries(await Promise.all(conDueno.map(async (c) => [c.id, await leerPrivado(`properties/${c.id}/privado/acuerdo`).catch(() => undefined)])));
	const { inicio, fin } = hoyGT(ahora);
	const pend = actividades.filter((a) => !a.hecha && ms(a.fecha));
	const conPendiente = new Set(pend.filter((a) => a.clienteId).map((a) => a.clienteId));

	const secciones = {
		vencidas: pend.filter((a) => ms(a.fecha) < inicio).sort((a, b) => ms(a.fecha) - ms(b.fecha)),
		hoy: pend.filter((a) => ms(a.fecha) >= inicio && ms(a.fecha) < fin).sort((a, b) => ms(a.fecha) - ms(b.fecha)),
		leads: leads.filter((l) => !globalThis.EQVacacional.esSolicitudReserva(l) && (l.estado || 'nuevo') === 'nuevo').sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
		sinSeguimiento: clientes.filter((c) => !['cierre', 'perdido'].includes(c.etapa) && !conPendiente.has(c.id))
			.sort((a, b) => ms(a.ultimoContacto) - ms(b.ultimoContacto)),
		exclusivas: exclusivasPorVencer(conDueno, acuerdos, propietarios, { ahora, zona: '-06:00' }).map((x) => ({
			agentId: x.casa.agentId || x.dueno?.agentId || '', titulo: x.casa.titulo || x.casa.codigo || 'Inmueble', nombre: x.dueno?.nombre || '', exclusivaFin: x.acuerdo.exclusivaFin
		})),
		incompletas: propiedades.filter((p) => p.publicado === true &&(!(p.fotos || []).length || !Number(p.precio)))
	};
	return { secciones, asesores, ahora };
}

const SECCIONES = [
	['vencidas', 'Seguimientos atrasados', '#/agenda', (a) => `${fecha(a.fecha)} · ${a.titulo || a.tipo || 'Seguimiento'}${a.clienteNombre ? ` — ${a.clienteNombre}` : ''}`],
	['hoy', 'Para hoy', '#/agenda', (a) => `${hora(a.fecha)} · ${a.titulo || a.tipo || 'Seguimiento'}${a.clienteNombre ? ` — ${a.clienteNombre}` : ''}`],
	['leads', 'Interesados sin atender', '#/leads', (l) => `${l.nombre || 'Sin nombre'}${l.propertyTitulo ? ` · ${l.propertyTitulo}` : ''}${l.createdAt ? ` (${fecha(l.createdAt)})` : ''}`],
	['sinSeguimiento', 'Clientes sin próximo paso', '#/clientes', (c) => `${c.nombre || 'Sin nombre'}${c.ultimoContacto ? ` · último contacto ${fecha(c.ultimoContacto)}` : ' · sin contacto registrado'}`],
	['exclusivas', 'Exclusivas por vencer', '#/propietarios', (p) => {
		const [y, m, d] = String(p.exclusivaFin).split('-');
		return `${p.titulo}${p.nombre ? ` — ${p.nombre}` : ''} · vence ${d}/${m}/${y}`;
	}],
	['incompletas', 'Propiedades visibles sin fotos o sin precio', '#/propiedades', (p) => `${p.titulo || p.codigo || 'Sin título'} · falta ${[!(p.fotos || []).length && 'fotos', !Number(p.precio) && 'precio'].filter(Boolean).join(' y ')}`]
];

const MAX = 8;

// Texto corto de cada sección para el asunto y la vista previa, y el enlace al panel.
const CORTO = {
	vencidas: ['atrasado', 'atrasados', 'Ver la agenda'],
	hoy: ['para hoy', 'para hoy', 'Ver la agenda'],
	leads: ['interesado sin atender', 'interesados sin atender', 'Ver los interesados'],
	sinSeguimiento: ['cliente sin próximo paso', 'clientes sin próximo paso', 'Ver los clientes'],
	exclusivas: ['exclusiva por vencer', 'exclusivas por vencer', 'Ver los propietarios'],
	incompletas: ['propiedad incompleta', 'propiedades incompletas', 'Ver las propiedades']
};
const cuenta = (k, n) => `${n} ${CORTO[k][n === 1 ? 0 : 1]}`;

async function correoDe(nombre, secciones, ahora = Date.now()) {
	const activas = SECCIONES.filter(([k]) => secciones[k].length);
	if (!activas.length) return null;
	const total = activas.reduce((n, [k]) => n + secciones[k].length, 0);
	const pendientes = `${total} ${total === 1 ? 'pendiente' : 'pendientes'}`;
	const atrasados = secciones.vencidas.length;
	const dia = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ahora));
	const titulo = `Buenos días, ${nombre ? nombre.split(' ')[0] : 'equipo'}`;
	const intro = `${dia.charAt(0).toUpperCase()}${dia.slice(1)}. ${nombre ? 'Tienes' : 'El equipo tiene'} <strong style="color:inherit">${pendientes}</strong>${atrasados ? '; empieza por los atrasados' : ''}.`;
	const preheader = activas.map(([k]) => cuenta(k, secciones[k].length)).join(' · ');
	const html = await plantilla({
		titulo,
		intro,
		preheader,
		bloques: (c) => activas.map(([k, label, ruta, linea]) => {
			const lista = secciones[k];
			const alerta = k === 'vencidas';
			const enlace = lista.length > MAX ? `Ver los ${lista.length} en el panel` : CORTO[k][2];
			return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:separate"><tr><td bgcolor="${alerta ? c.suave : c.white}" style="background:${alerta ? c.suave : c.white};border:1px solid ${c.linea};${alerta ? `border-left:4px solid ${c.primary};` : ''}border-radius:8px;padding:14px 16px 4px;font-family:Arial,Helvetica,sans-serif">
<h2 style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:bold;color:${alerta ? c.primary : c.dark}">${label} <span style="font-weight:normal;color:${c.ink}">(${lista.length})</span></h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${c.dark}">
${lista.slice(0, MAX).map((x, i) => `<tr><td style="padding:7px 0;${i ? `border-top:1px solid ${c.linea};` : ''}word-break:break-word">${esc(linea(x))}</td></tr>`).join('')}
</table>
<a href="${SITE_URL}/admin/${ruta}" target="_blank" style="display:inline-block;padding:10px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;font-weight:bold;color:${c.primary};text-decoration:underline">${enlace}</a>
</td></tr></table>`;
		}).join('') + `<div style="margin-top:8px">${boton(c, 'Abrir el panel', `${SITE_URL}/admin/`, c.dark, { ancho: true })}</div>`
	});
	const texto = [
		titulo,
		intro.replace(/<[^>]+>/g, ''),
		'',
		...activas.flatMap(([k, label, ruta, linea]) => [
			`${label} (${secciones[k].length})`,
			...secciones[k].slice(0, MAX).map((x) => `- ${linea(x)}`),
			`${CORTO[k][2]}: ${SITE_URL}/admin/${ruta}`,
			''
		]),
		`Abrir el panel: ${SITE_URL}/admin/`
	].join('\n');
	const asunto = `${nombre ? 'Tus pendientes' : 'Pendientes del equipo'} hoy: ${total}${atrasados ? ` (${cuenta('vencidas', atrasados)})` : ''}`;
	return { asunto, html, texto };
}

// Envía un correo a cada asesor con lo suyo y uno completo al equipo (AVISO_CORREO).
// soloEquipo: para la prueba desde el panel (no molesta a los asesores).
export async function enviarResumen({ soloEquipo = false, ahora = Date.now() } = {}) {
	const { secciones, asesores } = await datosResumen(ahora);
	const enviados = [];

	const general = await correoDe('', secciones, ahora);
	if (general) {
		await enviarCorreo({ para: destinatariosEquipo(), ...general });
		enviados.push('equipo');
	}
	if (soloEquipo) return { enviados, total: general ? 1 : 0 };

	const equipo = new Set(destinatariosEquipo().map((e) => e.toLowerCase()));
	for (const a of asesores) {
		if (!a.activo || !a.email || equipo.has(String(a.email).toLowerCase())) continue;
		const propias = Object.fromEntries(Object.entries(secciones).map(([k, lista]) => [k, lista.filter((x) => x.agentId === a.id)]));
		const correo = await correoDe(a.nombre, propias, ahora);
		if (!correo) continue;
		try {
			await enviarCorreo({ para: a.email, ...correo });
			enviados.push(a.nombre || a.id);
		} catch (err) {
			console.error(`Resumen para ${a.nombre}:`, err.message);
		}
	}
	return { enviados, total: enviados.length };
}
