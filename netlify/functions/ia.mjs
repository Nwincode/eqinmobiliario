// Función de IA (Netlify Functions v2). POST /api/ia { tarea, datos }
// Las tareas del panel exigen un usuario activo de Firebase; la búsqueda pública no.
// Requiere la variable de entorno ANTHROPIC_API_KEY en Netlify.
import Anthropic from '@anthropic-ai/sdk';
import siteConfig from '../../site.config.json' with { type: 'json' };
import { TAREAS, SISTEMA } from '../lib/tareas.mjs';
import { staffUser, json } from '../lib/auth.mjs';

const SITE_URL = siteConfig.siteUrl.replace(/\/$/, '');
const MODEL = 'claude-opus-5-5';

const client = new Anthropic({ timeout: 25_000, maxRetries: 0 });

// Límite simple por IP para la búsqueda pública (por instancia; evita abusos obvios).
const publicHits = new Map();
function publicRateLimited(ip) {
	const now = Date.now();
	const hits = (publicHits.get(ip) || []).filter((t) => now - t < 60_000);
	hits.push(now);
	publicHits.set(ip, hits);
	return hits.length > 8;
}

const cut = (v, n) => String(v ?? '').slice(0, n);

// Inventario compacto y acotado: solo campos útiles, con el enlace público de cada propiedad.
function inventario(list) {
	return (Array.isArray(list) ? list : []).slice(0, 300).map((p) => ({
		id: cut(p.id, 60),
		titulo: cut(p.titulo, 120),
		operacion: cut(p.operacion, 10),
		tipo: cut(p.tipo, 20),
		estado: cut(p.estado, 20),
		precio: Number(p.precio) || 0,
		moneda: cut(p.moneda, 3),
		zona: cut(p.zona, 60),
		ciudad: cut(p.ciudad, 60),
		direccion: cut(p.direccion, 120),
		habitaciones: Number(p.habitaciones) || 0,
		banos: Number(p.banos) || 0,
		parqueos: Number(p.parqueos) || 0,
		m2Construccion: Number(p.m2Construccion) || 0,
		m2Terreno: Number(p.m2Terreno) || 0,
		amenidades: (p.amenidades || []).slice(0, 20).map((a) => cut(a, 60)),
		resumen: cut(p.descripcion, 400),
		url: `${SITE_URL}${p.vip ? '/vip/' : '/propiedad/'}${cut(p.slug, 90)}/`
	}));
}

function construirPrompt(tarea, datos) {
	const bloques = [];
	if (datos.inventario) bloques.push(`<inventario>\n${JSON.stringify(inventario(datos.inventario))}\n</inventario>`);
	switch (tarea) {
		case 'buscar':
			bloques.push(`<requerimiento>\n${cut(datos.texto, 4000)}\n</requerimiento>`);
			break;
		case 'seguimiento':
			bloques.push(`<lead>\n${JSON.stringify({ ...datos.lead, mensaje: cut(datos.lead?.mensaje, 2000) }).slice(0, 8000)}\n</lead>`);
			if (datos.propiedad) bloques.push(`<propiedad_de_interes>\n${JSON.stringify(inventario([datos.propiedad])[0])}\n</propiedad_de_interes>`);
			break;
		case 'traducir':
		case 'descripcion':
			bloques.push(`<propiedad>\n${JSON.stringify(datos.propiedad || {}).slice(0, 6000)}\n</propiedad>`);
			bloques.push(`<notas_del_asesor>\n${cut(datos.notas, 3000)}\n</notas_del_asesor>`);
			break;
		case 'coincidencias':
			bloques.push(`<propiedad>\n${JSON.stringify(inventario([datos.propiedad || {}])[0])}\n</propiedad>`);
			bloques.push(`<requerimientos>\n${JSON.stringify((datos.requerimientos || []).slice(0, 200).map((r) => ({ id: cut(r.id, 60), cliente: cut(r.cliente, 80), texto: cut(r.texto, 800), criterios: r.criterios || {} })))}\n</requerimientos>`);
			break;
		case 'busquedaPublica':
			bloques.push(`<zonas_disponibles>${JSON.stringify((datos.zonas || []).slice(0, 80).map((z) => cut(z, 60)))}</zonas_disponibles>`);
			bloques.push(`<tipos_disponibles>${JSON.stringify((datos.tipos || []).slice(0, 20).map((t) => cut(t, 30)))}</tipos_disponibles>`);
			bloques.push(`<busqueda>${cut(datos.texto, 300)}</busqueda>`);
			break;
		default:
			break;
	}
	return bloques.join('\n\n');
}

export default async (req, context) => {
	if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
	if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'La IA no está configurada: falta ANTHROPIC_API_KEY en Netlify.' });

	let body;
	try {
		body = await req.json();
	} catch {
		return json(400, { error: 'Solicitud inválida' });
	}
	const def = TAREAS[body.tarea];
	if (!def) return json(400, { error: 'Tarea desconocida' });
	const datos = body.datos || {};

	let usuario = null;
	if (def.staff) {
		try {
			usuario = await staffUser(req);
		} catch {
			usuario = null;
		}
		if (!usuario) return json(401, { error: 'Inicia sesión en el panel para usar la IA.' });
	} else if (publicRateLimited(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon')) {
		return json(429, { error: 'Demasiadas búsquedas seguidas. Intenta en un minuto.' });
	}

	let messages;
	if (body.tarea === 'chat') {
		const historial = (Array.isArray(datos.mensajes) ? datos.mensajes : []).slice(-20)
			.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
			.map((m) => ({ role: m.role, content: cut(m.content, 6000) }));
		if (!historial.length || historial[0].role !== 'user') return json(400, { error: 'Escribe un mensaje.' });
		const contexto = construirPrompt('chat', datos);
		messages = contexto ? [{ role: 'user', content: contexto }, ...historial] : historial;
	} else {
		messages = [{ role: 'user', content: construirPrompt(body.tarea, datos) }];
	}

	const asesor = usuario?.nombre ? `\nEl asesor que te escribe se llama ${usuario.nombre}; firma los mensajes al cliente con su nombre.` : '';

	try {
		const response = await client.beta.messages.create({
			model: MODEL,
			max_tokens: 8000,
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			system: [
				{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } },
				{ type: 'text', text: `${def.instrucciones}${asesor}` }
			],
			output_config: def.schema
				? { effort: def.effort, format: { type: 'json_schema', schema: def.schema } }
				: { effort: def.effort },
			messages
		});

		if (response.stop_reason === 'refusal') return json(422, { error: 'La IA no pudo procesar esta solicitud. Reformúlala e intenta de nuevo.' });
		if (response.stop_reason === 'max_tokens') return json(502, { error: 'La respuesta quedó incompleta. Intenta con menos información.' });

		const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
		if (!def.schema) return json(200, { texto: text });

		const resultado = JSON.parse(text);
		// Solo se devuelven ids que existen en el inventario enviado (la IA no puede inventar propiedades).
		const ids = new Set(inventario(datos.inventario).map((p) => p.id));
		if (resultado.resultados) resultado.resultados = resultado.resultados.filter((r) => ids.has(r.id));
		if (resultado.propiedadesSugeridas) resultado.propiedadesSugeridas = resultado.propiedadesSugeridas.filter((r) => ids.has(r.id));
		if (resultado.coincidencias) {
			const reqIds = new Set((datos.requerimientos || []).map((r) => r.id));
			resultado.coincidencias = resultado.coincidencias.filter((c) => reqIds.has(c.id));
		}
		return json(200, resultado);
	} catch (err) {
		if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'La IA está muy ocupada. Intenta en un momento.' });
		if (err instanceof Anthropic.AuthenticationError) return json(503, { error: 'La clave de la IA (ANTHROPIC_API_KEY) no es válida.' });
		if (err instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: 'La IA tardó demasiado. Intenta de nuevo o con menos información.' });
		if (err instanceof Anthropic.APIError) return json(502, { error: `Error de la IA (${err.status ?? 'sin conexión'}).` });
		if (err instanceof SyntaxError) return json(502, { error: 'La IA devolvió una respuesta inválida. Intenta de nuevo.' });
		console.error(err);
		return json(500, { error: 'Error inesperado.' });
	}
};

export const config = { path: '/api/ia' };
