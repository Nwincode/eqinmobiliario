// Traducción automática del chat de una reserva: cuando el cliente escribe en inglés (su reserva es en inglés,
// `chat.idioma`) y el panel lee en español, el servidor traduce cada mensaje de texto al idioma de quien lo lee y lo
// guarda en el mismo mensaje (`traduccion: { es | en: texto }`, con la cuenta de escritura; nadie más lo escribe: las
// reglas no dejan cambiar un mensaje). El hilo (admin/js/hilo.js) lo muestra debajo del original.
// - Solo con la IA configurada (el mismo cliente y modelo de netlify/lib/ia-cliente.mjs); sin ella no se muestra nada.
// - Se aparta antes de llamar a la IA, en una transacción: cada mensaje queda marcado (`traduccion: { idioma: '' }`) y
//   se cuenta en traduccionesChat/{token} (solo el servidor; sin `match` en las reglas), con tope por chat (TOPE). Dos
//   avisos a la vez no traducen dos veces; lo que falla queda sin traducción (no se reintenta sin fin).
// - Se salta lo de 2 palabras o menos y lo que ya está en el idioma de quien lo lee (lo dice la IA: queda vacío).
// - La traducción pasa el mismo filtro de contacto que el chat (V.tieneContacto): una que lo dispare no se guarda (el
//   original ya pasó el filtro; la traducción no puede volver a armar un teléfono escrito con palabras).
import '../../js/calc-vacacional.js';
import { leerPublico, listar } from './firestore.mjs';
import { escrituraConfigurada, transaccion } from './firestore-escritura.mjs';
import { client, MODEL, iaConfigurada } from './ia-cliente.mjs';

const V = globalThis.EQVacacional;
export const TOPE = 60;
const POR_VEZ = 5;
const IDIOMAS = { es: 'español', en: 'inglés' };
// A qué idioma va cada mensaje: lo del cliente, al del panel (español); lo del socio y el equipo, al del cliente.
export const destinoDe = (m, chat) => (m.de === 'cliente' ? 'es' : chat.idioma === 'en' ? 'en' : 'es');
const palabras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
// ¿Hace falta traducir este mensaje? Texto (sin tipo), de más de 2 palabras, todavía sin su marca.
export const porTraducir = (m, chat) => !m.tipo && typeof m.texto === 'string' && palabras(m.texto) > 2 && !(m.traduccion && typeof m.traduccion === 'object')
	&& !(m.de !== 'cliente' && destinoDe(m, chat) === 'es');

const ESQUEMA = {
	type: 'object', additionalProperties: false, required: ['mismoIdioma', 'traduccion'],
	properties: {
		mismoIdioma: { type: 'boolean', description: 'true si el mensaje ya está en el idioma pedido' },
		traduccion: { type: 'string', description: 'El mensaje traducido; vacío si ya estaba en ese idioma' }
	}
};
async function traducirConIA(texto, idioma, timeout = 20_000) {
	const r = await client.beta.messages.create({
		model: MODEL, max_tokens: 2000,
		betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
		output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
		system: `Traduces mensajes del chat de una reserva de una casa vacacional en Guatemala. Traduce al ${IDIOMAS[idioma]} el mensaje que va entre <mensaje>, con el mismo tono y sin agregar, quitar ni explicar nada. Si ya está en ${IDIOMAS[idioma]}, responde mismoIdioma = true y la traducción vacía.`,
		messages: [{ role: 'user', content: `<mensaje>\n${String(texto).slice(0, 1000)}\n</mensaje>` }]
	}, { timeout });
	if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') throw new Error(`IA: ${r.stop_reason}`);
	const d = JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
	return d.mismoIdioma ? '' : String(d.traduccion || '').trim().slice(0, 2000);
}

// Traduce lo nuevo del chat `token`. Devuelve cuántos mensajes se guardaron con traducción. `traducir` (para pruebas): la IA.
export async function traducirChat(token, { traducir = traducirConIA } = {}) {
	if (!iaConfigurada() || !escrituraConfigurada()) return 0;
	const chat = await leerPublico(`chats/${token}`);
	// Solo cuando el cliente lee en otro idioma que el panel.
	if (!chat || chat.idioma !== 'en') return 0;
	const recientes = (await listar(`chats/${token}/mensajes`)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).slice(-20);
	const candidatos = recientes.filter((m) => porTraducir(m, chat));
	if (!candidatos.length) return 0;
	const cuenta = `traduccionesChat/${token}`;
	// Se apartan (marca y cuenta) en una transacción: con el tope por chat y sin traducir dos veces el mismo.
	const apartados = await transaccion(async ({ leer, crear, cambiar }) => {
		const prev = await leer(cuenta);
		const n = Number(prev?.n) || 0;
		const lista = [];
		for (const m of candidatos) {
			if (n + lista.length >= TOPE || lista.length >= POR_VEZ) break;
			const actual = await leer(`chats/${token}/mensajes/${m.id}`);
			if (!actual || !porTraducir(actual, chat)) continue;
			lista.push({ id: m.id, texto: actual.texto, idioma: destinoDe(actual, chat) });
		}
		for (const x of lista) cambiar(`chats/${token}/mensajes/${x.id}`, { [`traduccion.${x.idioma}`]: '' });
		if (lista.length) { if (prev) cambiar(cuenta, { n: n + lista.length }); else crear(cuenta, { n: lista.length }); }
		return lista;
	});
	let hechos = 0;
	for (const x of apartados) {
		let texto = '';
		try { texto = await traducir(x.texto, x.idioma); } catch (err) { console.error('Traducción del chat:', err.message); continue; }
		// Lo que parezca un contacto no se guarda (ni se muestra).
		if (!texto || V.tieneContacto(texto)) continue;
		await transaccion(async ({ cambiar }) => cambiar(`chats/${token}/mensajes/${x.id}`, { [`traduccion.${x.idioma}`]: texto })).catch((err) => console.error('Traducción del chat:', err.message));
		hechos++;
	}
	return hechos;
}
