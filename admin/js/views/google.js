// Google: rendimiento en la Búsqueda (Search Console) y revisión SEO del inventario.
import { db, doc, getDoc, getDocs, collection, siteConfig } from '../firebase.js';
import { h, toast, showError, pageHeader, badge, mount, spinner, downloadCsv } from '../ui.js';
import { session } from '../session.js';
import { publicUrl } from './properties.js';

const SITE = (siteConfig.siteUrl || '').replace(/\/$/, '');
const num = (n) => Math.round(n || 0).toLocaleString('es-GT');
const pct = (n) => `${((n || 0) * 100).toFixed(1)} %`;
const pos = (n) => (n ? n.toFixed(1) : '—');
const ruta = (url) => String(url || '').replace(SITE, '') || '/';

async function pedirGSC(accion, datos = {}) {
	const token = await session.user.getIdToken();
	const res = await fetch('/api/gsc', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ accion, datos })
	});
	let body = {};
	try {
		body = await res.json();
	} catch {
		// Sin JSON: la función aún no está desplegada.
	}
	if (!res.ok) throw new Error(res.status === 404 ? 'La conexión con Google se activa al publicar el sitio en Netlify.' : body.error || `Error ${res.status}`);
	return body;
}

function variacion(ahora, antes, invertir = false) {
	if (!antes) return null;
	const d = (ahora - antes) / antes;
	if (!Number.isFinite(d) || Math.abs(d) < 0.005) return h('span', { class: 'small text-muted' }, 'sin cambio');
	const bueno = invertir ? d < 0 : d > 0;
	return h('span', { class: `small ${bueno ? 'text-success' : 'text-danger'}` }, `${d > 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)} % vs. periodo anterior`);
}

function kpi(label, valor, extra) {
	return h('div', { class: 'col-6 col-lg-3' }, h('div', { class: 'card stat-card h-100' }, h('div', { class: 'card-body' },
		h('div', { class: 'stat-value' }, valor), h('div', { class: 'stat-label' }, label), extra || null)));
}

function tabla(cabeceras, filas, vacio = 'Sin datos en este periodo.') {
	if (!filas.length) return h('p', { class: 'text-muted small mb-0' }, vacio);
	return h('div', { class: 'table-responsive' }, h('table', { class: 'table table-sm table-admin mb-0' },
		h('thead', {}, h('tr', {}, cabeceras.map((c, i) => h('th', { class: i ? 'text-end' : '' }, c)))),
		h('tbody', {}, filas)));
}

const filaMetricas = (r) => [
	h('td', { class: 'text-end' }, num(r.clics)),
	h('td', { class: 'text-end' }, num(r.impresiones)),
	h('td', { class: 'text-end' }, pct(r.ctr)),
	h('td', { class: 'text-end' }, pos(r.posicion))
];

const MOTIVOS = {
	ctr: ['Pocos clics para su posición', 'Estás arriba, pero el título o la descripción no convencen: hazlos más concretos (precio, zona, m², "con jardín").', 'warning'],
	top3: ['Cerca del top 3', 'Estás en la primera página. Refuerza la página con más contenido y enlaces internos para subir al top 3.', 'primary'],
	pagina1: ['A un paso de la página 1', 'Apareces en la página 2. Usa la búsqueda exacta en el título, el H1 o un subtítulo, y enlaza la página desde otras.', 'info']
};

function card(titulo, ...contenido) {
	return h('div', { class: 'card mb-4' }, h('div', { class: 'card-header bg-white fw-semibold' }, titulo), h('div', { class: 'card-body' }, ...contenido));
}

function guiaConexion(propiedad) {
	return card('Conecta Search Console (una sola vez)',
		h('p', {}, 'Así verás aquí qué buscan las personas en Google cuando encuentran el sitio, en qué posición apareces y qué páginas conviene mejorar. Además, el sitemap se enviará solo a Google en cada publicación.'),
		h('ol', { class: 'small' },
			h('li', {}, 'En Google Cloud Console (console.cloud.google.com), dentro del proyecto de Firebase "', siteConfig.firebase?.projectId || '', '", activa la API "Google Search Console API".'),
			h('li', {}, 'En "IAM y administración → Cuentas de servicio" crea una cuenta (p. ej. "search-console") y descarga una clave JSON. No la compartas con nadie.'),
			h('li', {}, 'En Netlify → Site configuration → Environment variables agrega GOOGLE_SA_EMAIL (el client_email del JSON) y GOOGLE_SA_KEY (el private_key completo).'),
			h('li', {}, 'En Search Console → Configuración → Usuarios y permisos, agrega ese correo como usuario con permiso "Completo".'),
			h('li', {}, 'Vuelve a publicar el sitio. Propiedad que se consultará: ', h('code', {}, propiedad), ' (se cambia en Contenido del sitio → Google y anuncios).')));
}

// Revisión local del inventario: no depende de Google.
function revisionInventario(props) {
	const publicadas = props.filter((p) => p.publicado);
	const titulos = new Map();
	publicadas.forEach((p) => titulos.set((p.titulo || '').toLowerCase(), (titulos.get((p.titulo || '').toLowerCase()) || 0) + 1));
	const reglas = [
		[(p) => (p.fotos || []).length >= 8, 'Al menos 8 fotos (las fichas con más fotos reciben más clics y aparecen en Google Imágenes).'],
		[(p) => String(p.descripcion || '').split(/\s+/).filter(Boolean).length >= 120, 'Descripción de 120 palabras o más.'],
		[(p) => Boolean(p.zona && p.ciudad), 'Zona y ciudad completas.'],
		[(p) => /@-?\d|[?&](q|ll|query)=-?\d/.test(p.mapa || ''), 'Ubicación en el mapa con coordenadas (enlace de Google Maps con @lat,lng).'],
		[(p) => Boolean(p.m2Construccion || p.m2Terreno), 'Metros cuadrados indicados.'],
		[(p) => p.operacion === 'renta' || Boolean(p.precio), 'Precio publicado (Google y los compradores en EE. UU. filtran por precio).'],
		[(p) => Boolean(p.en && p.en.titulo && p.en.descripcion), 'Traducción al inglés (para el mercado de EE. UU.).'],
		[(p) => Boolean(p.video), 'Video o recorrido (aparece en resultados de video).'],
		[(p) => (titulos.get((p.titulo || '').toLowerCase()) || 0) < 2, 'Título único (no repetido en otra ficha).']
	];
	const filas = publicadas.map((p) => {
		const fallas = reglas.filter(([ok]) => !ok(p)).map(([, txt]) => txt);
		return { p, fallas, puntaje: Math.round(((reglas.length - fallas.length) / reglas.length) * 100) };
	}).sort((a, b) => a.puntaje - b.puntaje);
	const promedio = filas.length ? Math.round(filas.reduce((s, x) => s + x.puntaje, 0) / filas.length) : 0;
	return card(`Revisión SEO del inventario · promedio ${promedio}/100`,
		h('p', { class: 'small text-muted' }, 'Cada ficha se califica con lo que más pesa para posicionar propiedades. Corrige primero las de menor puntaje.'),
		tabla(['Propiedad', 'Puntaje', 'Qué falta'], filas.slice(0, 50).map(({ p, fallas, puntaje }) => h('tr', {},
			h('td', {}, h('a', { href: `#/propiedades/${p.id}` }, p.titulo || '(sin título)')),
			h('td', { class: 'text-end' }, badge(`${puntaje}`, puntaje >= 80 ? 'success' : puntaje >= 55 ? 'warning' : 'danger')),
			h('td', { class: 'text-end small' }, fallas.length ? h('ul', { class: 'mb-0 text-start ps-3' }, fallas.map((f) => h('li', {}, f))) : '✓ Completa'))),
		'No hay propiedades publicadas.'));
}

function inspector() {
	const input = h('input', { class: 'form-control', type: 'url', placeholder: `${SITE}/propiedad/…`, value: `${SITE}/` });
	const out = h('div', { class: 'mt-3 small' });
	const btn = h('button', { class: 'btn btn-outline-primary', type: 'submit' }, 'Revisar en Google');
	const form = h('form', { class: 'input-group', onsubmit: async (e) => {
		e.preventDefault();
		btn.disabled = true;
		out.replaceChildren(spinner('Consultando a Google…'));
		try {
			const r = await pedirGSC('inspeccionar', { url: input.value.trim(), propiedad: window.__gscProp });
			const indexada = r.veredicto === 'PASS';
			out.replaceChildren(
				h('div', { class: `alert ${indexada ? 'alert-success' : 'alert-warning'} mb-2` }, indexada ? '✓ La página está en Google.' : `La página no está indexada: ${r.cobertura || r.veredicto || 'sin información'}.`),
				h('dl', { class: 'row mb-0' },
					h('dt', { class: 'col-sm-4' }, 'Último rastreo'), h('dd', { class: 'col-sm-8' }, r.rastreo ? new Date(r.rastreo).toLocaleString('es-GT') : '—'),
					h('dt', { class: 'col-sm-4' }, 'Canónica elegida por Google'), h('dd', { class: 'col-sm-8 text-break' }, r.canonicaGoogle || '—'),
					h('dt', { class: 'col-sm-4' }, 'Resultados enriquecidos'), h('dd', { class: 'col-sm-8' }, (r.enriquecidos || []).join(', ') || 'Ninguno detectado')),
				r.enlace ? h('a', { href: r.enlace, target: '_blank', rel: 'noopener' }, 'Abrir en Search Console (para pedir la indexación)') : null);
		} catch (err) {
			out.replaceChildren(h('div', { class: 'alert alert-danger mb-0' }, err.message));
		} finally {
			btn.disabled = false;
		}
	} }, input, btn);
	return card('¿Está esta página en Google?', h('p', { class: 'small text-muted' }, 'Pega la dirección de una ficha nueva para confirmar que Google ya la tiene. Si no, abre el enlace y presiona "Solicitar indexación".'), form, out);
}

function renderDatos(cont, d, props) {
	const porRuta = new Map(props.filter((p) => p.publicado).map((p) => [publicUrl(p), p]));
	const oportunidades = d.oportunidades || [];
	const usa = (d.paises || []).find((p) => p.claves[0] === 'usa');
	cont.replaceChildren();
	mount(cont,
		h('p', { class: 'small text-muted' }, `Datos de ${d.rango.startDate} a ${d.rango.endDate} · ${d.propiedad}`),
		h('div', { class: 'row g-3 mb-4' },
			kpi('Clics desde Google', num(d.totales.clics), variacion(d.totales.clics, d.previos.clics)),
			kpi('Veces que apareciste', num(d.totales.impresiones), variacion(d.totales.impresiones, d.previos.impresiones)),
			kpi('CTR (clics / apariciones)', pct(d.totales.ctr), variacion(d.totales.ctr, d.previos.ctr)),
			kpi('Posición promedio', pos(d.totales.posicion), variacion(d.totales.posicion, d.previos.posicion, true))),
		card(`Oportunidades: ${oportunidades.length} búsquedas para ganar más clics`,
			h('p', { class: 'small text-muted' }, 'Búsquedas en las que ya apareces, ordenadas por los clics extra que podrías ganar. Son las mejoras con más retorno.'),
			tabla(['Búsqueda', 'Página', 'Posición', 'Impresiones', 'Clics posibles', 'Qué hacer'], oportunidades.map((o) => {
				const [nombre, consejo, color] = MOTIVOS[o.motivo];
				const prop = porRuta.get(ruta(o.pagina));
				return h('tr', {},
					h('td', { class: 'fw-semibold' }, o.consulta),
					h('td', { class: 'text-end small text-break' }, prop ? h('a', { href: `#/propiedades/${prop.id}` }, prop.titulo) : h('a', { href: o.pagina, target: '_blank', rel: 'noopener' }, ruta(o.pagina))),
					h('td', { class: 'text-end' }, pos(o.posicion)),
					h('td', { class: 'text-end' }, num(o.impresiones)),
					h('td', { class: 'text-end fw-semibold' }, `+${num(o.clicsPotenciales)}`),
					h('td', { class: 'text-end small' }, badge(nombre, color), h('div', { class: 'text-muted text-start mt-1' }, consejo)));
			}), 'Todavía no hay oportunidades claras. Vuelve cuando el sitio tenga algunas semanas en Google.')),
		h('div', { class: 'row g-4' },
			h('div', { class: 'col-xl-6' }, card('Lo que buscan en Google',
				tabla(['Búsqueda', 'Clics', 'Impr.', 'CTR', 'Pos.'], (d.consultas || []).slice(0, 25).map((r) => h('tr', {}, h('td', {}, r.claves[0]), ...filaMetricas(r)))))),
			h('div', { class: 'col-xl-6' }, card('Páginas que más tráfico traen',
				tabla(['Página', 'Clics', 'Impr.', 'CTR', 'Pos.'], (d.paginas || []).slice(0, 25).map((r) => {
					const prop = porRuta.get(ruta(r.claves[0]));
					return h('tr', {}, h('td', { class: 'text-break' }, prop ? h('a', { href: `#/propiedades/${prop.id}` }, prop.titulo) : ruta(r.claves[0])), ...filaMetricas(r));
				}))))),
		h('div', { class: 'row g-4' },
			h('div', { class: 'col-xl-6' }, card(`Estados Unidos${usa ? ` · ${num(usa.clics)} clics, ${num(usa.impresiones)} impresiones` : ''}`,
				h('p', { class: 'small text-muted' }, 'Búsquedas desde EE. UU.: el mercado de tus anuncios. Úsalas como palabras clave en Google Ads y en el sitio en inglés.'),
				tabla(['Búsqueda', 'Clics', 'Impr.', 'CTR', 'Pos.'], (d.consultasUsa || []).map((r) => h('tr', {}, h('td', {}, r.claves[0]), ...filaMetricas(r))), 'Aún no hay búsquedas desde EE. UU.'))),
			h('div', { class: 'col-xl-6' }, card('Países y dispositivos',
				tabla(['País', 'Clics', 'Impr.', 'CTR', 'Pos.'], (d.paises || []).map((r) => h('tr', {}, h('td', {}, r.claves[0].toUpperCase()), ...filaMetricas(r)))),
				h('hr'),
				tabla(['Dispositivo', 'Clics', 'Impr.', 'CTR', 'Pos.'], (d.dispositivos || []).map((r) => h('tr', {}, h('td', {}, { MOBILE: 'Celular', DESKTOP: 'Computadora', TABLET: 'Tablet' }[r.claves[0]] || r.claves[0]), ...filaMetricas(r))))))),
		(d.caidas || []).length ? card('Páginas que están perdiendo clics',
			tabla(['Página', 'Clics antes', 'Clics ahora', 'Pos. antes', 'Pos. ahora'], d.caidas.map((c) => h('tr', {},
				h('td', { class: 'text-break' }, ruta(c.pagina)),
				h('td', { class: 'text-end' }, num(c.antes.clics)), h('td', { class: 'text-end' }, num(c.ahora.clics)),
				h('td', { class: 'text-end' }, pos(c.antes.posicion)), h('td', { class: 'text-end' }, pos(c.ahora.posicion)))))) : null);
}

export async function render(container) {
	const [settingsSnap, propSnap] = await Promise.all([getDoc(doc(db, 'settings', 'site')), getDocs(collection(db, 'properties'))]);
	const propiedad = settingsSnap.exists() ? (settingsSnap.data().seo || {}).searchConsolePropiedad || '' : '';
	window.__gscProp = propiedad;
	let props = propSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
	if (!session.isAdmin) props = props.filter((p) => p.agentId === session.agentId);

	let dias = 28;
	let ultimo = null;
	const datos = h('div', {}, spinner('Consultando Search Console…'));
	const selector = h('select', { class: 'form-select form-select-sm w-auto', 'aria-label': 'Periodo' },
		[[7, 'Últimos 7 días'], [28, 'Últimos 28 días'], [90, 'Últimos 3 meses']].map(([v, l]) => h('option', { value: v, selected: v === dias }, l)));
	const exportar = h('button', { class: 'btn btn-sm btn-outline-primary', disabled: true, onclick: () => ultimo && downloadCsv(`google-busquedas-${ultimo.rango.endDate}.csv`, [
		['Búsqueda', 'Clics', 'Impresiones', 'CTR', 'Posición'],
		...ultimo.consultas.map((r) => [r.claves[0], r.clics, r.impresiones, (r.ctr * 100).toFixed(2), r.posicion.toFixed(1)])
	]) }, 'Exportar búsquedas (CSV)');
	const enviar = session.isAdmin ? h('button', { class: 'btn btn-sm btn-primary', onclick: async (e) => {
		e.target.disabled = true;
		try {
			const r = await pedirGSC('enviarSitemap', { propiedad });
			toast(r.configurado === false ? 'Primero conecta Search Console.' : 'Sitemap enviado a Google.', r.configurado === false ? 'warning' : 'success');
		} catch (err) { showError(err); } finally { e.target.disabled = false; }
	} }, 'Enviar sitemap a Google') : null;

	const cargar = async () => {
		datos.replaceChildren(spinner('Consultando Search Console…'));
		try {
			const r = await pedirGSC('resumen', { dias, propiedad });
			if (!r.configurado) {
				datos.replaceChildren(guiaConexion(r.propiedad));
				return;
			}
			ultimo = r;
			exportar.disabled = false;
			renderDatos(datos, r, props);
		} catch (err) {
			datos.replaceChildren(h('div', { class: 'alert alert-warning' }, err.message));
		}
	};
	selector.addEventListener('change', () => { dias = Number(selector.value); cargar(); });

	mount(container,
		pageHeader('Google', h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, selector, exportar, enviar)),
		h('p', { class: 'text-muted' }, 'Cómo te encuentran en la Búsqueda de Google y qué mejorar para conseguir más visitas. Los datos vienen de Google Search Console y tienen unos 2 días de retraso.'),
		datos,
		h('div', { class: 'row g-4' }, h('div', { class: 'col-xl-5' }, inspector()), h('div', { class: 'col-xl-7' }, revisionInventario(props))));
	cargar();
}
