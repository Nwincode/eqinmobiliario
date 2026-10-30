// Asistente IA: tareas del día a día del asesor.
import {
	db, doc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp
} from '../firebase.js';
import { h, toast, showError, pageHeader, badge, formatPrice, formatDate, emptyState, mount, spinner } from '../ui.js';
import { session, loadAgents, markPending } from '../session.js';
import { pedirIA, whatsappUrl, copiar } from '../ia.js';
import { loadLeads, estadoBadge } from './leads.js';
import { publicUrl } from './properties.js';

const TABS = [
	['buscar', 'Buscar para un cliente'],
	['redactar', 'Redactar ficha y redes'],
	['seguimiento', 'Seguimiento de leads'],
	['clientes', 'Clientes que buscan'],
	['chat', 'Asistente']
];

async function cargarPropiedades() {
	const snap = await getDocs(collection(db, 'properties'));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function cargarRequerimientos() {
	const col = collection(db, 'requerimientos');
	const snap = await getDocs(session.isAdmin ? col : query(col, where('agentId', '==', session.agentId || '-')));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
		.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// Inventario que se manda a la IA: solo lo publicado y disponible (o reservado).
function inventarioIA(props) {
	return props.filter((p) => p.publicado && (!p.estado || p.estado === 'disponible' || p.estado === 'reservada'));
}

function cargando(btn, texto = 'La IA está trabajando…') {
	const original = btn.textContent;
	btn.disabled = true;
	btn.replaceChildren(h('span', { class: 'spinner-border spinner-border-sm me-2' }), texto);
	return () => { btn.disabled = false; btn.textContent = original; };
}

// Mensaje editable con acciones para enviarlo.
function mensajeBox(texto, telefono = '', titulo = 'Mensaje para el cliente') {
	const area = h('textarea', { class: 'form-control', rows: 6 });
	area.value = texto || '';
	const tel = h('input', { class: 'form-control', type: 'tel', placeholder: 'WhatsApp del cliente (opcional)', value: telefono });
	return h('div', { class: 'ia-mensaje' },
		h('div', { class: 'form-label fw-semibold' }, titulo),
		area,
		h('div', { class: 'd-flex flex-wrap gap-2 mt-2' },
			h('div', { style: 'max-width:240px' }, tel),
			h('button', { class: 'btn btn-success', type: 'button', onclick: () => window.open(whatsappUrl(tel.value, area.value), '_blank', 'noopener') }, 'Abrir en WhatsApp'),
			h('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: async () => toast((await copiar(area.value)) ? 'Copiado.' : 'No se pudo copiar.') }, 'Copiar')));
}

function propiedadMini(p, extra) {
	return h('div', { class: 'ia-prop' },
		h('img', { src: p.fotos?.[0]?.url || '', alt: '' }),
		h('div', { class: 'flex-grow-1' },
			h('div', { class: 'fw-semibold' }, p.titulo),
			h('div', { class: 'small text-muted' }, `${formatPrice(p.precio, p.moneda, p.operacion)} · ${[p.zona, p.ciudad].filter(Boolean).join(', ')}`),
			extra || null),
		h('div', { class: 'd-flex flex-column gap-1' },
			p.publicado ? h('a', { href: publicUrl(p), target: '_blank', class: 'btn btn-sm btn-outline-primary' }, 'Ver') : null,
			h('a', { href: `#/propiedades/${p.id}`, class: 'btn btn-sm btn-light' }, 'Editar')));
}

// ------------------------------------------------------------ Buscar para un cliente

function tabBuscar(cont, props) {
	const texto = h('textarea', { class: 'form-control', rows: 5, placeholder: 'Pega aquí el mensaje del cliente o describe lo que busca.\nEj.: "Busco casa en zona 15 o 16, 3 habitaciones, que acepte mascotas, presupuesto hasta 350 mil dólares. Tengo 2 carros."' });
	const out = h('div', { class: 'mt-4' });
	const btn = h('button', { class: 'btn btn-primary mt-2', type: 'button' }, 'Buscar propiedades');
	btn.addEventListener('click', async () => {
		if (texto.value.trim().length < 10) return toast('Describe un poco más lo que busca el cliente.', 'warning');
		const listo = cargando(btn);
		out.replaceChildren(spinner('Analizando el requerimiento y revisando el inventario…'));
		try {
			const r = await pedirIA('buscar', { texto: texto.value, inventario: inventarioIA(props) });
			const byId = Object.fromEntries(props.map((p) => [p.id, p]));
			const c = r.criterios || {};
			out.replaceChildren(
				h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
					h('div', { class: 'small text-muted mb-1' }, 'Lo que entendió la IA'),
					h('div', { class: 'fw-semibold mb-2' }, c.resumen),
					h('div', { class: 'd-flex flex-wrap gap-1' },
						c.operacion && c.operacion !== 'cualquiera' ? badge(c.operacion, 'secondary') : null,
						...(c.tipos || []).map((t) => badge(t, 'secondary')),
						...(c.zonas || []).map((z) => badge(z, 'info')),
						c.presupuestoMaximo ? badge(`Hasta ${formatPrice(c.presupuestoMaximo, c.moneda)}`, 'warning') : null,
						c.habitacionesMinimas ? badge(`${c.habitacionesMinimas}+ hab.`, 'secondary') : null,
						...(c.otros || []).map((o) => badge(o, 'light'))))),
				h('h2', { class: 'h6 mt-4' }, r.resultados?.length ? `Propiedades sugeridas (${r.resultados.length})` : 'No hay propiedades que encajen en el inventario'),
				...(r.resultados || []).map((res) => byId[res.id] ? propiedadMini(byId[res.id], h('div', { class: 'small mt-1' },
					badge(`${res.puntaje}%`, res.puntaje >= 75 ? 'success' : res.puntaje >= 50 ? 'warning' : 'secondary'), ' ', res.motivo,
					res.diferencias ? h('div', { class: 'text-danger' }, res.diferencias) : null)) : null),
				r.preguntas?.length ? h('div', { class: 'card mt-3' }, h('div', { class: 'card-body' },
					h('div', { class: 'fw-semibold mb-2' }, 'Preguntas para afinar la búsqueda'),
					h('ul', { class: 'mb-0' }, r.preguntas.map((q) => h('li', {}, q))))) : null,
				h('div', { class: 'card mt-3' }, h('div', { class: 'card-body' }, mensajeBox(r.mensajeCliente))),
				guardarRequerimiento(texto.value, c));
		} catch (err) {
			out.replaceChildren(h('div', { class: 'alert alert-danger' }, err.message));
		} finally {
			listo();
		}
	});
	mount(cont,
		h('p', { class: 'text-muted' }, 'La IA entiende el pedido aunque venga desordenado, revisa todo el inventario disponible y te prepara el mensaje para el cliente.'),
		texto, btn, out);
}

function guardarRequerimiento(texto, criterios) {
	const nombre = h('input', { class: 'form-control', placeholder: 'Nombre del cliente' });
	const tel = h('input', { class: 'form-control', type: 'tel', placeholder: 'WhatsApp' });
	const btn = h('button', { class: 'btn btn-outline-primary', type: 'button' }, 'Guardar cliente');
	btn.addEventListener('click', async () => {
		if (!nombre.value.trim()) return toast('Escribe el nombre del cliente.', 'warning');
		try {
			const ref = doc(collection(db, 'requerimientos'));
			await setDoc(ref, {
				cliente: nombre.value.trim(), telefono: tel.value.trim(), texto, criterios: criterios || {},
				estado: 'activo', agentId: session.agentId || '', createdBy: session.user.uid, createdAt: serverTimestamp()
			});
			toast('Cliente guardado. Te avisaremos cuando entre una propiedad que le sirva (pestaña "Clientes que buscan").');
			btn.disabled = true;
		} catch (err) { showError(err); }
	});
	return h('div', { class: 'card mt-3' }, h('div', { class: 'card-body' },
		h('div', { class: 'fw-semibold mb-1' }, 'Guardar este requerimiento'),
		h('p', { class: 'small text-muted' }, 'Para buscarle opciones automáticamente cuando captes propiedades nuevas.'),
		h('div', { class: 'row g-2' }, h('div', { class: 'col-md-5' }, nombre), h('div', { class: 'col-md-4' }, tel), h('div', { class: 'col-md-3' }, btn))));
}

// ------------------------------------------------------------ Redactar ficha

function tabRedactar(cont, props, idInicial) {
	const editables = props.filter((p) => session.isAdmin || p.agentId === session.agentId);
	const sel = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Elige una propiedad…'),
		editables.map((p) => h('option', { value: p.id }, `${p.titulo || '(sin título)'} — ${p.zona || ''}`)));
	sel.value = idInicial && editables.some((p) => p.id === idInicial) ? idInicial : '';
	const notas = h('textarea', { class: 'form-control', rows: 4, placeholder: 'Notas para la IA (opcional): lo que viste en la visita, a quién va dirigida, qué destacar.\nEj.: "Mucha luz natural, cocina remodelada en 2024, ideal para familia con niños, cerca del colegio Austriaco."' });
	const out = h('div', { class: 'mt-4' });
	const btn = h('button', { class: 'btn btn-primary mt-2', type: 'button' }, 'Redactar con IA');

	btn.addEventListener('click', async () => {
		const p = props.find((x) => x.id === sel.value);
		if (!p) return toast('Elige una propiedad.', 'warning');
		const listo = cargando(btn);
		out.replaceChildren(spinner('Escribiendo la ficha, el SEO y las publicaciones…'));
		try {
			const datos = { ...p };
			delete datos.fotos; delete datos.createdAt; delete datos.updatedAt;
			const r = await pedirIA('descripcion', { propiedad: datos, notas: notas.value });
			const campo = (label, value, rows = 3) => {
				const t = h('textarea', { class: 'form-control', rows });
				t.value = value || '';
				return { el: h('div', { class: 'mb-3' }, h('label', { class: 'form-label fw-semibold' }, label), t), get: () => t.value };
			};
			const f = {
				titulo: campo('Título', r.titulo, 1),
				descripcion: campo('Descripción', r.descripcion, 9),
				seoTitulo: campo('Título para Google', r.seoTitulo, 1),
				seoDescripcion: campo('Descripción para Google', r.seoDescripcion, 2),
				vipTitular: campo('Titular VIP', r.vipTitular, 1),
				vipSubtitular: campo('Subtítulo VIP', r.vipSubtitular, 2),
				puntos: campo('Puntos clave (uno por línea)', (r.puntosClave || []).join('\n'), 4),
				ig: campo('Publicación para Instagram', r.postInstagram, 6),
				fb: campo('Publicación para Facebook', r.postFacebook, 6)
			};
			const aplicar = h('button', { class: 'btn btn-primary', type: 'button' }, 'Aplicar a la propiedad');
			aplicar.addEventListener('click', async () => {
				try {
					const patch = {
						titulo: f.titulo.get(), descripcion: f.descripcion.get(),
						'seo.titulo': f.seoTitulo.get(), 'seo.descripcion': f.seoDescripcion.get(),
						amenidades: [...new Set([...(p.amenidades || []), ...(r.amenidades || [])])],
						updatedAt: serverTimestamp(), updatedBy: session.user.uid
					};
					if (p.vip) Object.assign(patch, { 'vipLanding.titular': f.vipTitular.get(), 'vipLanding.subtitular': f.vipSubtitular.get(), 'vipLanding.puntosClave': f.puntos.get().split('\n').map((s) => s.trim()).filter(Boolean) });
					await updateDoc(doc(db, 'properties', p.id), patch);
					await markPending(`Propiedad (IA): ${f.titulo.get()}`);
					toast('Listo: la propiedad se actualizó. Publica para verlo en el sitio.');
				} catch (err) { showError(err); }
			});
			const copy = (label, c) => h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', onclick: async () => toast((await copiar(c.get())) ? `${label} copiado.` : 'No se pudo copiar.') }, `Copiar ${label}`);
			out.replaceChildren(h('div', { class: 'row g-4' },
				h('div', { class: 'col-lg-7' }, h('div', { class: 'card' }, h('div', { class: 'card-body' },
					h('h2', { class: 'h6 mb-3' }, 'Ficha y SEO (revisa y ajusta antes de aplicar)'),
					f.titulo.el, f.descripcion.el, f.seoTitulo.el, f.seoDescripcion.el,
					p.vip ? [f.vipTitular.el, f.vipSubtitular.el, f.puntos.el] : null,
					r.amenidades?.length ? h('p', { class: 'small text-muted' }, `Amenidades detectadas: ${r.amenidades.join(', ')}`) : null,
					aplicar))),
				h('div', { class: 'col-lg-5' }, h('div', { class: 'card' }, h('div', { class: 'card-body' },
					h('h2', { class: 'h6 mb-3' }, 'Redes sociales'),
					f.ig.el, copy('Instagram', f.ig), h('hr'), f.fb.el, copy('Facebook', f.fb))))));
		} catch (err) {
			out.replaceChildren(h('div', { class: 'alert alert-danger' }, err.message));
		} finally {
			listo();
		}
	});
	mount(cont,
		h('p', { class: 'text-muted' }, 'A partir de los datos de la propiedad y tus notas, la IA escribe la descripción, el SEO, la landing VIP y las publicaciones para redes. Tú revisas y aplicas con un clic.'),
		h('div', { class: 'row g-2' }, h('div', { class: 'col-md-8' }, sel)),
		h('div', { class: 'mt-2' }, notas), btn, out);
}

// ------------------------------------------------------------ Seguimiento de leads

function tabSeguimiento(cont, props, leads, idInicial) {
	if (!leads.length) {
		mount(cont, emptyState('No tienes leads todavía.'));
		return;
	}
	const pendientes = leads.filter((l) => !['cerrado', 'descartado'].includes(l.estado));
	const lista = h('div', { class: 'list-group' });
	const out = h('div');
	const byId = Object.fromEntries(props.map((p) => [p.id, p]));

	const analizar = async (lead, item) => {
		lista.querySelectorAll('.active').forEach((x) => x.classList.remove('active'));
		item.classList.add('active');
		out.replaceChildren(spinner('Analizando el caso y redactando los mensajes…'));
		try {
			const dias = lead.createdAt?.seconds ? Math.floor((Date.now() / 1000 - lead.createdAt.seconds) / 86400) : null;
			const r = await pedirIA('seguimiento', {
				lead: {
					nombre: lead.nombre, telefono: lead.telefono, email: lead.email, mensaje: lead.mensaje, origen: lead.origen,
					estado: lead.estado, propiedad: lead.propertyTitulo, diasDesdeQueEscribio: dias,
					notas: (lead.notas || []).map((n) => n.texto)
				},
				propiedad: byId[lead.propertyId] || null,
				inventario: inventarioIA(props)
			});
			const temp = { caliente: ['Caliente', 'danger'], tibio: ['Tibio', 'warning'], frio: ['Frío', 'info'] }[r.temperatura] || ['—', 'secondary'];
			out.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'card-body' },
				h('div', { class: 'd-flex align-items-center gap-2 mb-2' }, h('h2', { class: 'h5 mb-0' }, lead.nombre), badge(temp[0], temp[1]), estadoBadge(lead.estado)),
				h('p', {}, r.resumen),
				h('div', { class: 'alert alert-info' }, h('strong', {}, 'Siguiente paso: '), r.siguientePaso),
				mensajeBox(r.mensajeWhatsApp, lead.telefono, 'Mensaje de WhatsApp'),
				lead.email ? h('div', { class: 'mt-3' },
					h('div', { class: 'form-label fw-semibold' }, 'Correo'),
					h('a', { class: 'btn btn-outline-primary btn-sm', href: `mailto:${lead.email}?subject=${encodeURIComponent(r.correoAsunto)}&body=${encodeURIComponent(r.correoCuerpo)}` }, `Abrir correo: ${r.correoAsunto}`)) : null,
				r.propiedadesSugeridas?.length ? h('div', { class: 'mt-3' },
					h('div', { class: 'form-label fw-semibold' }, 'Otras opciones para ofrecerle'),
					r.propiedadesSugeridas.map((s) => byId[s.id] ? propiedadMini(byId[s.id], h('div', { class: 'small' }, s.motivo)) : null)) : null,
				h('a', { href: '#/leads', class: 'btn btn-link px-0 mt-2' }, 'Actualizar estado del lead →'))));
		} catch (err) {
			out.replaceChildren(h('div', { class: 'alert alert-danger' }, err.message));
		}
	};

	(pendientes.length ? pendientes : leads).forEach((l) => {
		const item = h('button', { type: 'button', class: 'list-group-item list-group-item-action' },
			h('div', { class: 'd-flex justify-content-between' }, h('strong', {}, l.nombre), estadoBadge(l.estado)),
			h('div', { class: 'small text-muted' }, `${l.propertyTitulo || 'Contacto general'} · ${formatDate(l.createdAt, false)}`));
		item.addEventListener('click', () => analizar(l, item));
		lista.append(item);
		if (l.id === idInicial) setTimeout(() => analizar(l, item));
	});

	mount(cont,
		h('p', { class: 'text-muted' }, 'Elige un lead: la IA resume el caso, te dice qué hacer y te deja el mensaje listo para WhatsApp o correo.'),
		h('div', { class: 'row g-4' },
			h('div', { class: 'col-lg-4' }, lista),
			h('div', { class: 'col-lg-8' }, out)));
}

// ------------------------------------------------------------ Clientes que buscan (requerimientos)

function tabClientes(cont, props, reqs) {
	const editables = props.filter((p) => p.publicado);
	const sel = h('select', { class: 'form-select' }, h('option', { value: '' }, 'Elige una propiedad (p. ej. una recién captada)…'),
		editables.map((p) => h('option', { value: p.id }, `${p.titulo} — ${p.zona || ''}`)));
	const out = h('div', { class: 'mt-3' });
	const btn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Buscar clientes interesados');
	const activos = reqs.filter((r) => r.estado !== 'cerrado');

	btn.addEventListener('click', async () => {
		const p = props.find((x) => x.id === sel.value);
		if (!p) return toast('Elige una propiedad.', 'warning');
		if (!activos.length) return toast('Aún no hay clientes guardados. Guárdalos desde "Buscar para un cliente".', 'warning');
		const listo = cargando(btn);
		out.replaceChildren(spinner('Comparando con los requerimientos de tus clientes…'));
		try {
			const r = await pedirIA('coincidencias', { propiedad: p, requerimientos: activos });
			const byId = Object.fromEntries(activos.map((x) => [x.id, x]));
			out.replaceChildren(...(r.coincidencias?.length ? r.coincidencias.map((c) => h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' },
				h('div', { class: 'd-flex align-items-center gap-2 mb-1' }, h('strong', {}, byId[c.id]?.cliente), badge(`${c.puntaje}%`, c.puntaje >= 75 ? 'success' : 'warning')),
				h('p', { class: 'small text-muted' }, c.motivo),
				mensajeBox(c.mensajeWhatsApp, byId[c.id]?.telefono)))) : [h('div', { class: 'alert alert-secondary' }, 'Ningún cliente guardado busca algo parecido.')]));
		} catch (err) {
			out.replaceChildren(h('div', { class: 'alert alert-danger' }, err.message));
		} finally {
			listo();
		}
	});

	const cerrar = async (r, row) => {
		try {
			await updateDoc(doc(db, 'requerimientos', r.id), { estado: 'cerrado', updatedAt: serverTimestamp() });
			row.remove();
			toast('Requerimiento cerrado.');
		} catch (err) { showError(err); }
	};

	mount(cont,
		h('p', { class: 'text-muted' }, 'Cuando captes o publiques una propiedad, la IA te dice a qué clientes ofrecérsela y te deja cada mensaje listo.'),
		h('div', { class: 'row g-2 align-items-center' }, h('div', { class: 'col-md-8' }, sel), h('div', { class: 'col-md-4' }, btn)),
		out,
		h('h2', { class: 'h6 mt-4' }, `Clientes con búsqueda activa (${activos.length})`),
		activos.length ? h('div', { class: 'card overflow-hidden' }, h('table', { class: 'table table-admin mb-0' },
			h('thead', {}, h('tr', {}, ['Cliente', 'Busca', 'Guardado', ''].map((t) => h('th', {}, t)))),
			h('tbody', {}, activos.map((r) => {
				const row = h('tr', {},
					h('td', {}, h('div', { class: 'fw-semibold' }, r.cliente), h('div', { class: 'small text-muted' }, r.telefono || '')),
					h('td', { class: 'small' }, r.criterios?.resumen || String(r.texto || '').slice(0, 120)),
					h('td', { class: 'small text-muted text-nowrap' }, formatDate(r.createdAt, false)),
					h('td', { class: 'text-nowrap' },
						r.telefono ? h('a', { class: 'btn btn-sm btn-success me-1', target: '_blank', href: whatsappUrl(r.telefono, `Hola ${r.cliente}, `) }, 'WhatsApp') : null,
						h('button', { class: 'btn btn-sm btn-outline-secondary', type: 'button', onclick: () => cerrar(r, row) }, 'Cerrar')));
				return row;
			})))) : emptyState('Aún no hay clientes guardados.'));
}

// ------------------------------------------------------------ Asistente (chat)

const SUGERENCIAS = [
	'Redacta un mensaje para confirmar una visita mañana a las 10 a. m.',
	'Un cliente dice que el precio está muy alto. ¿Cómo le respondo?',
	'Compara las propiedades de zona 16 que tenemos disponibles.',
	'Calcula la cuota mensual de un préstamo de US$ 200,000 a 20 años al 8.5 %.',
	'Arma mi plan de seguimiento para esta semana con 5 leads nuevos.'
];

function tabChat(cont, props) {
	const historial = [];
	const log = h('div', { class: 'ia-chat-log' });
	const input = h('textarea', { class: 'form-control', rows: 2, placeholder: 'Pregúntale lo que necesites…' });
	const btn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Enviar');

	const pintar = (role, text) => {
		const burbuja = h('div', { class: `ia-burbuja ia-${role}` });
		if (role === 'assistant') burbuja.innerHTML = mdBasico(text);
		else burbuja.textContent = text;
		log.append(burbuja);
		log.scrollTop = log.scrollHeight;
		return burbuja;
	};

	const enviar = async () => {
		const texto = input.value.trim();
		if (!texto) return;
		input.value = '';
		historial.push({ role: 'user', content: texto });
		pintar('user', texto);
		const espera = pintar('assistant', '…');
		const listo = cargando(btn, 'Pensando…');
		try {
			const r = await pedirIA('chat', { mensajes: historial, inventario: inventarioIA(props) });
			historial.push({ role: 'assistant', content: r.texto });
			espera.innerHTML = mdBasico(r.texto);
		} catch (err) {
			historial.pop();
			espera.textContent = err.message;
			espera.classList.add('text-danger');
		} finally {
			listo();
		}
	};
	btn.addEventListener('click', enviar);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });

	mount(cont,
		h('p', { class: 'text-muted' }, 'Tu asistente para el día a día: mensajes, objeciones, comparaciones, cálculos y organización. Conoce el inventario disponible.'),
		h('div', { class: 'd-flex flex-wrap gap-2 mb-3' }, SUGERENCIAS.map((s) => h('button', { class: 'btn btn-sm btn-light border', type: 'button', onclick: () => { input.value = s; input.focus(); } }, s))),
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, log,
			h('div', { class: 'd-flex gap-2 mt-3' }, h('div', { class: 'flex-grow-1' }, input), btn))));
}

// Markdown mínimo y seguro para las respuestas del chat.
function mdBasico(md) {
	const esc = String(md || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
	return esc
		.replace(/^### (.*)$/gm, '<h4 class="h6 mt-2">$1</h4>')
		.replace(/^## (.*)$/gm, '<h3 class="h6 mt-2">$1</h3>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/^[-*] (.*)$/gm, '<li>$1</li>')
		.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
		.replace(/\n{2,}/g, '<br><br>')
		.replace(/\n/g, '<br>');
}

// ------------------------------------------------------------ Vista

export async function render(container, [tab = 'buscar', id]) {
	const [props, leads, reqs] = await Promise.all([
		cargarPropiedades(),
		session.isAdmin || session.agentId ? loadLeads() : [],
		cargarRequerimientos().catch(() => []),
		loadAgents()
	]);
	const nav = h('ul', { class: 'nav nav-pills flex-wrap gap-1 mb-4' },
		TABS.map(([key, label]) => h('li', { class: 'nav-item' }, h('a', { class: `nav-link${key === tab ? ' active' : ''}`, href: `#/ia/${key}` }, label))));
	const cont = h('div');
	if (tab === 'redactar') tabRedactar(cont, props, id);
	else if (tab === 'seguimiento') tabSeguimiento(cont, props, leads, id);
	else if (tab === 'clientes') tabClientes(cont, props, reqs);
	else if (tab === 'chat') tabChat(cont, props);
	else tabBuscar(cont, props);
	mount(container, pageHeader('Asistente IA'), nav, cont);
}
