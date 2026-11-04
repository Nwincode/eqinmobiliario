// Resumen de la mañana: lo que cada asesor debe atender hoy.
// Lo usan la función programada (resumen-diario) y el botón de prueba del panel.
import { listar } from './firestore.mjs';
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
	const { inicio, fin } = hoyGT(ahora);
	const pend = actividades.filter((a) => !a.hecha && ms(a.fecha));
	const conPendiente = new Set(pend.filter((a) => a.clienteId).map((a) => a.clienteId));

	const secciones = {
		vencidas: pend.filter((a) => ms(a.fecha) < inicio).sort((a, b) => ms(a.fecha) - ms(b.fecha)),
		hoy: pend.filter((a) => ms(a.fecha) >= inicio && ms(a.fecha) < fin).sort((a, b) => ms(a.fecha) - ms(b.fecha)),
		leads: leads.filter((l) => (l.estado || 'nuevo') === 'nuevo').sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
		sinSeguimiento: clientes.filter((c) => !['cierre', 'perdido'].includes(c.etapa) && !conPendiente.has(c.id))
			.sort((a, b) => ms(a.ultimoContacto) - ms(b.ultimoContacto)),
		exclusivas: propietarios.filter((p) => {
			if (!p.exclusiva || !p.exclusivaFin) return false;
			const dias = (new Date(`${p.exclusivaFin}T23:59:59-06:00`).getTime() - ahora) / DIA;
			return dias <= 30;
		}).sort((a, b) => String(a.exclusivaFin).localeCompare(String(b.exclusivaFin))),
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
		return `${p.nombre || 'Propietario'} · vence ${d}/${m}/${y}`;
	}],
	['incompletas', 'Propiedades visibles sin fotos o sin precio', '#/propiedades', (p) => `${p.titulo || p.codigo || 'Sin título'} · falta ${[!(p.fotos || []).length && 'fotos', !Number(p.precio) && 'precio'].filter(Boolean).join(' y ')}`]
];

const MAX = 8;

async function correoDe(nombre, secciones) {
	const activas = SECCIONES.filter(([k]) => secciones[k].length);
	if (!activas.length) return null;
	const total = activas.reduce((n, [k]) => n + secciones[k].length, 0);
	const titulo = `Buenos días${nombre ? `, ${nombre.split(' ')[0]}` : ''}`;
	const html = await plantilla({
		titulo,
		intro: `Esto es lo que conviene atender hoy (${total} ${total === 1 ? 'pendiente' : 'pendientes'}).`,
		bloques: (c) => activas.map(([k, label, ruta, linea]) => {
			const lista = secciones[k];
			const alerta = k === 'vencidas';
			return `
<h2 style="font-size:15px;margin:20px 0 8px;color:${alerta ? c.primary : c.dark}">${label} <span style="font-weight:normal;color:${c.ink}">(${lista.length})</span></h2>
<ul style="margin:0 0 4px;padding-left:20px;font-size:14px;line-height:1.6">
${lista.slice(0, MAX).map((x) => `<li>${esc(linea(x))}</li>`).join('')}
</ul>
<p style="margin:0 0 8px;font-size:13px"><a href="${SITE_URL}/admin/${ruta}" style="color:${c.primary}">${lista.length > MAX ? `Ver los ${lista.length} en el panel` : 'Abrir en el panel'}</a></p>`;
		}).join('') + `<div style="margin-top:16px">${boton(c, 'Abrir el panel', `${SITE_URL}/admin/`, c.dark)}</div>`
	});
	const texto = [titulo, '', ...activas.flatMap(([k, label]) => [`${label} (${secciones[k].length})`, ...secciones[k].slice(0, MAX).map((x) => `- ${SECCIONES.find((s) => s[0] === k)[3](x)}`), '']), `${SITE_URL}/admin/`].join('\n');
	return { asunto: `Pendientes de hoy: ${total}`, html, texto };
}

// Envía un correo a cada asesor con lo suyo y uno completo al equipo (AVISO_CORREO).
// soloEquipo: para la prueba desde el panel (no molesta a los asesores).
export async function enviarResumen({ soloEquipo = false, ahora = Date.now() } = {}) {
	const { secciones, asesores } = await datosResumen(ahora);
	const enviados = [];

	const general = await correoDe('', secciones);
	if (general) {
		await enviarCorreo({ para: destinatariosEquipo(), ...general });
		enviados.push('equipo');
	}
	if (soloEquipo) return { enviados, total: general ? 1 : 0 };

	const equipo = new Set(destinatariosEquipo().map((e) => e.toLowerCase()));
	for (const a of asesores) {
		if (!a.activo || !a.email || equipo.has(String(a.email).toLowerCase())) continue;
		const propias = Object.fromEntries(Object.entries(secciones).map(([k, lista]) => [k, lista.filter((x) => x.agentId === a.id)]));
		const correo = await correoDe(a.nombre, propias);
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
