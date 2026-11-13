// Propietarios: dueños de los inmuebles, exclusivas con vencimiento y comisión acordada.
import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from '../firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState, mount, badge, formatDate, cajaTabla, modal, formatPrice } from '../ui.js';
import { renderForm } from '../form.js';
import { session, agentOptions, loadAgents } from '../session.js';
import { whatsappUrl, copiar } from '../ia.js';
import { publicarPortal, cerrarPortal, borrarCopia, enlacePortal, visitasDe, escucharComentarios, TIPOS_BITACORA } from '../portal.js';
import { loadPropietarios, loadPropiedades, telNorm, loadReglas, textoRegla } from '../crm.js';
import { REGIMENES, MODOS } from '../cotizacion.js';
import { OPERACIONES, TIPOS, MONEDAS, datosDe, loadAll, propiedadNueva, slugLibre, vacacionalPublico, guardarPrivadoVacacional } from './properties.js';
import { generarCodigo } from '../importar.js';
import { revisar, chipFaltan, vigilarFormulario, avisarCambio } from '../pendientes.js';

// Cada casa guarda de quién es (propietarioId): así el socio de rentas ve solo las suyas.
// Si la casa es de otro asesor, Firestore no deja tocarla y se sigue con las demás.
function vincularCasas(id, ahora = [], antes = []) {
	const cambios = [...ahora.map((p) => [p, id]), ...antes.filter((p) => !ahora.includes(p)).map((p) => [p, ''])];
	return Promise.all(cambios.map(([p, propietarioId]) => updateDoc(doc(db, 'properties', p), { propietarioId }).catch(() => {})));
}

// Ficha corta de la casa elegida (foto, título, zona, datos y precio), con las mismas piezas del listado de Propiedades.
function fichaCasa(el, p) {
	if (!p) return el.replaceChildren();
	const chips = datosDe(p);
	const operacion = OPERACIONES.find(([v]) => v === p.operacion)?.[1] || '';
	el.replaceChildren(h('a', { href: `#/propiedades/${p.id}`, target: '_blank', class: 'd-flex align-items-center gap-2 text-body text-decoration-none', title: 'Abrir la ficha de la propiedad' },
		p.fotos?.[0]?.url ? h('img', { class: 'thumb', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' })),
		h('div', { class: 'flex-grow-1' },
			h('div', { class: 'fw-semibold prop-titulo' }, p.titulo || '(sin título)', ' ', p.publicado ? null : badge('Sin publicar', 'light')),
			h('div', { class: 'small text-muted prop-zona' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${[operacion, p.zona, p.ciudad].filter(Boolean).join(' · ')}`),
			chips.length ? h('div', { class: 'prop-datos' }, chips) : null),
		h('div', { class: 'text-nowrap fw-semibold' }, formatPrice(p.precio, p.moneda, p.operacion))));
}

// «Nueva propiedad» desde la ficha del dueño: lo mínimo para que la casa exista, sin publicar y ya enlazada a él.
// Lo demás (fotos, descripción, dirección) se completa en Propiedades; «Faltan» avisa qué le falta.
function nuevaPropiedad(dueno, alCrear) {
	const V = window.EQVacacional;
	const socio = dueno.tipo === 'socio';
	const porNoche = (d) => d.operacion === 'vacacional';
	const form = renderForm([
		{ name: 'titulo', label: 'Título', required: true, placeholder: 'Casa de playa en Monterrico' },
		// La renta por noche es de socios: necesita su correo y sus datos de pago.
		{ name: 'operacion', label: 'Operación', type: 'select', cols: 6, options: OPERACIONES.filter(([v]) => socio || v !== 'vacacional') },
		{ name: 'tipo', label: 'Tipo', type: 'select', cols: 6, options: TIPOS },
		{ name: 'zona', label: 'Zona', cols: 6 },
		{ name: 'ciudad', label: 'Ciudad', cols: 6 },
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, step: 1, cols: 6, when: (d) => !porNoche(d), help: 'Vacío = «Precio a consultar».' },
		{ name: 'precioSocio', label: 'Precio por noche del socio', type: 'number', min: 0, step: 0.01, cols: 6, when: porNoche, help: 'Lo que recibe el socio. Privado.' },
		{ name: 'moneda', label: 'Moneda', type: 'select', cols: 6, options: MONEDAS }
	], { operacion: socio ? 'vacacional' : 'venta', tipo: 'casa', ciudad: 'Guatemala', moneda: 'USD' });
	const crear = h('button', { class: 'btn btn-primary', onclick: async () => {
		if (!form.validate()) return;
		const { precioSocio, ...d } = form.getData();
		const vac = porNoche(d);
		if (vac && !(Number(precioSocio) > 0)) return toast('Escribe el precio por noche del socio.', 'warning');
		crear.disabled = true;
		try {
			const [todas, agentes] = await Promise.all([loadAll(), loadAgents()]);
			// El socio atiende él mismo sus casas; las demás quedan con el asesor del dueño (o conmigo, si soy asesor).
			d.agentId = session.isAdmin ? (dueno.agentId || '') : session.agentId;
			d.propietarioId = dueno.id;
			d.slug = slugLibre(d.titulo, new Set(todas.map((p) => p.slug)));
			const costo = { precioBase: Number(precioSocio), precioFinde: 0, margen: V.MARGEN, tarifas: [], nombre: dueno.nombre || '', telefono: dueno.telefono || '', icalUrl: '' };
			if (vac) Object.assign(d, vacacionalPublico({ socio: costo, vacacional: {} }));
			else delete d.vacacional;
			d.codigo = generarCodigo(d, { agentes, codigos: todas.map((p) => p.codigo).filter(Boolean) });
			const ref = doc(collection(db, 'properties'));
			await setDoc(ref, propiedadNueva(d));
			if (vac) await guardarPrivadoVacacional(ref.id, costo, { direccion: '', mapa: '' });
			toast(`Propiedad creada sin publicar: ${d.codigo}. Complétala en Propiedades.`);
			ventana.close();
			alCrear({ id: ref.id, ...d });
		} catch (err) { showError(err); crear.disabled = false; }
	} }, 'Crear y enlazar');
	const ventana = modal({ title: `Nueva propiedad de ${dueno.nombre}`, body: form.el,
		footer: [h('button', { class: 'btn btn-light', 'data-bs-dismiss': 'modal' }, 'Cancelar'), crear] });
}

// Días que faltan para que venza la exclusiva (negativo = vencida).
function diasExclusiva(p) {
	if (!p.exclusiva || !p.exclusivaFin) return null;
	const fin = new Date(`${p.exclusivaFin}T23:59:59`).getTime();
	return Math.ceil((fin - Date.now()) / 86400000);
}

export function estadoExclusiva(p) {
	const d = diasExclusiva(p);
	if (d === null) return p.exclusiva ? badge('Exclusiva sin fecha', 'secondary') : badge('Sin exclusiva', 'light');
	if (d < 0) return badge(`Vencida hace ${-d} días`, 'danger');
	if (d <= 30) return badge(`Vence en ${d} días`, 'warning');
	return badge(`Exclusiva · ${d} días`, 'success');
}

async function renderLista(container) {
	const [lista, propiedades, agentes, reglas] = await Promise.all([loadPropietarios(), loadPropiedades(), loadAgents(), loadReglas()]);
	const tituloProp = Object.fromEntries(propiedades.map((p) => [p.id, p.titulo]));
	const nombreAsesor = Object.fromEntries(agentes.map((a) => [a.id, a.nombre]));
	const porVencer = lista.filter((p) => { const d = diasExclusiva(p); return d !== null && d <= 30; });
	lista.sort((a, b) => (diasExclusiva(a) ?? 9999) - (diasExclusiva(b) ?? 9999));
	const faltanDe = (p) => revisar('propietarios', p);
	const solo = h('input', { type: 'checkbox', class: 'form-check-input', id: 'solo-incompletos', checked: /\/incompletos$/.test(location.hash) });
	const tabla = h('div');
	const fila = (p) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/propietarios/${p.id}`; } },
		h('td', {}, h('div', { class: 'fw-semibold' }, p.nombre || '(sin nombre)', p.tipo === 'colaborador' ? [' ', badge('Colaborador', 'info')] : p.tipo === 'socio' ? [' ', badge('Socio', 'primary')] : null), h('div', { class: 'small text-muted' }, [p.empresa, p.telefono || p.email].filter(Boolean).join(' · ')), chipFaltan(faltanDe(p))),
		h('td', { class: 'small' }, (p.propiedades || []).map((x) => tituloProp[x.propertyId]).filter(Boolean).join(', ') || '—'),
		h('td', {}, estadoExclusiva(p)),
		h('td', { class: 'small' }, p.comisionPct ? `${p.comisionPct} %` : h('span', { class: 'text-muted' }, `${reglas.comisionVentaPct} % (general)`)),
		session.isAdmin ? h('td', { class: 'small' }, nombreAsesor[p.agentId] || (p.tipo === 'socio' ? '—' : 'Sin asignar')) : null);
	const dibujar = () => {
		const vis = solo.checked ? lista.filter((p) => faltanDe(p).length) : lista;
		tabla.replaceChildren(vis.length ? cajaTabla(h('table', { class: 'table table-hover table-admin mb-0' },
			h('thead', {}, h('tr', {}, ['Propietario', 'Propiedades', 'Exclusiva', 'Comisión', session.isAdmin ? 'Asesor' : null].filter(Boolean).map((t) => h('th', {}, t)))),
			h('tbody', {}, vis.map(fila))), { tarjeta: true })
			: h('p', { class: 'text-muted' }, 'Todos los propietarios tienen sus datos completos.'));
	};
	solo.addEventListener('change', dibujar);
	dibujar();

	mount(container,
		pageHeader('Propietarios', h('a', { href: '#/propietarios/nuevo', class: 'btn btn-primary' }, '+ Propietario')),
		h('p', { class: 'text-muted' }, 'Dueños de los inmuebles que manejan: contacto, propiedades, exclusiva y comisión acordada.'),
		porVencer.length ? h('div', { class: 'alert alert-warning' }, `${porVencer.length} exclusiva(s) vencidas o por vencer en 30 días. Contacta al propietario para renovarla.`) : null,
		lista.length ? [h('div', { class: 'form-check mb-3' }, solo, h('label', { class: 'form-check-label', for: 'solo-incompletos' }, 'Solo con datos por completar')), tabla]
			: emptyState('Aún no hay propietarios registrados.', h('a', { href: '#/propietarios/nuevo', class: 'btn btn-primary' }, 'Registrar propietario')));
}

async function renderEditor(container, id) {
	const nuevo = id === 'nuevo';
	const ref = nuevo ? doc(collection(db, 'propietarios')) : doc(db, 'propietarios', id);
	const [snap, agentes, propiedades, reglas] = await Promise.all([nuevo ? null : getDoc(ref), agentOptions(), loadPropiedades(), loadReglas()]);
	if (!nuevo && !snap.exists()) {
		mount(container, emptyState('No se encontró.', h('a', { href: '#/propietarios', class: 'btn btn-primary' }, 'Volver')));
		return;
	}
	// El régimen acordado con la agencia es pequeño contribuyente (5 %) salvo que se indique otro.
	const data = { comisionRegimen: 'pequeno', ...(nuevo ? { exclusiva: false, agentId: session.isAdmin ? '' : session.agentId, propiedades: [] } : snap.data()) };
	const opcionesProp = [['', 'Elegir propiedad…'], ...propiedades.map((p) => [p.id, p.titulo])];
	const form = renderForm([
		// Quién nos dio el inmueble: su dueño, o un asesor de otra oficina que lo comparte con nosotros.
		{ name: 'tipo', label: 'Es', type: 'select', default: 'propietario', cols: 6, options: [
			['propietario', 'Propietario (vende o renta su inmueble)'], ['socio', 'Socio de renta vacacional (atiende sus casas por noche)'],
			['colaborador', 'Asesor colaborador (nos pasó el inmueble)']],
			help: 'Socio: necesita correo (ahí le llegan las solicitudes) y datos de pago. Colaborador: su comisión acordada es la parte que comparte con nosotros.' },
		{ name: 'empresa', label: 'Empresa o inmobiliaria', cols: 6, when: (d) => d.tipo === 'colaborador' },
		{ name: 'nombre', label: 'Nombre', required: true, cols: 6 },
		// El socio de renta vacacional atiende él mismo sus casas: no lleva asesor responsable.
		session.isAdmin ? { name: 'agentId', label: 'Asesor responsable', type: 'select', options: agentes, cols: 6, when: (d) => d.tipo !== 'socio' } : null,
		{ name: 'telefono', label: 'Teléfono / WhatsApp', type: 'telefono', cols: 6 },
		{ name: 'email', label: 'Correo', type: 'email', cols: 6 },
		{ name: 'datosPago', label: 'Datos de pago para reservas vacacionales', type: 'textarea', rows: 2, maxlength: 1000, when: (d) => d.tipo === 'socio', placeholder: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de…', help: 'Se le envían al cliente por el chat al confirmar su reserva. Solo socios de renta vacacional.' },
		{ type: 'section', label: 'Propiedades' },
		{ name: 'propiedades', label: 'Propiedades de este propietario', type: 'list', itemLabel: 'Propiedad', fields: [
			{ name: 'propertyId', label: 'Propiedad', type: 'select', options: opcionesProp, cols: 8, crear: { label: 'Nueva propiedad…', abrir: (elegir) => crearPropiedad(elegir) } },
			{ name: 'precioMinimo', label: 'Precio mínimo aceptado', type: 'number', cols: 4 },
			{ type: 'custom', update: (el, _, item) => fichaCasa(el, propiedades.find((p) => p.id === item.propertyId)) }
		] },
		{ type: 'section', label: 'Exclusiva y comisión' },
		{ name: 'exclusiva', label: 'Tenemos exclusiva', type: 'checkbox', cols: 4 },
		{ name: 'exclusivaInicio', label: 'Desde', type: 'date', cols: 4 },
		{ name: 'exclusivaFin', label: 'Hasta', type: 'date', cols: 4 },
		{ name: 'comisionPct', label: 'Comisión acordada %', type: 'number', cols: 4, help: `Vacío = regla general: ${textoRegla(reglas)}.` },
		{ name: 'comisionRegimen', label: 'Impuesto de la comisión', type: 'select', cols: 4, options: REGIMENES },
		{ name: 'comisionModo', label: 'Cómo se cobra', type: 'select', cols: 4, options: MODOS, help: 'Las mismas opciones de Cotización de servicios.' },
		{ type: 'section', label: 'Impuestos de la venta' },
		{ name: 'impuestoVenta', label: 'Impuesto del traspaso', type: 'select', cols: 6, options: [['', 'Por definir'], ['iva', 'IVA 12 % (primera venta de inmueble nuevo)'], ['timbres', 'Timbres fiscales 3 % (reventa)']] },
		{ name: 'impuestoPaga', label: 'Quién paga el impuesto', type: 'select', cols: 6, options: [['', 'Por definir'], ['comprador', 'Comprador'], ['vendedor', 'Vendedor'], ['mitad', 'Mitad y mitad']] },
		{ name: 'notasImpuestos', label: 'Notas de impuestos', cols: 12, placeholder: 'Ej.: IUSI al día, ISR por ganancia de capital, gastos de escritura…' },
		{ name: 'contrato', label: 'Enlace al contrato (Drive, Dropbox…)', cols: 8, placeholder: 'https://…' },
		{ name: 'notas', label: 'Notas', type: 'textarea', rows: 3 }
	].filter(Boolean), data, { folder: `propietarios/${ref.id}` });

	// Guarda la ficha. Devuelve false si falta algo o falló (ya avisó).
	const persistir = async () => {
		if (!form.validate()) return false;
		const d = form.getData();
		d.telefonoNorm = telNorm(d.telefono);
		d.propiedades = (d.propiedades || []).filter((x) => x.propertyId);
		d.propertyIds = d.propiedades.map((x) => x.propertyId);
		d.updatedAt = serverTimestamp();
		if (nuevo) d.createdAt = serverTimestamp();
		if (!session.isAdmin) d.agentId = session.agentId;
		// setDoc reemplaza el documento: se conservan la bitácora y el enlace del portal.
		for (const k of ['bitacora', 'portalToken', 'proximoPaso', 'portalActualizado', 'portalPrivado']) if (data[k] !== undefined) d[k] = data[k];
		try {
			await setDoc(ref, d);
			await vincularCasas(ref.id, d.propertyIds, data.propertyIds);
			data.propertyIds = d.propertyIds;
			if (d.portalToken) await publicarPortal({ ...d, id: ref.id }).catch((err) => console.warn('Portal sin actualizar', err));
			avisarCambio();
			return true;
		} catch (err) { showError(err); return false; }
	};
	const guardar = async (btn) => {
		btn.disabled = true;
		if (await persistir()) { toast('Propietario guardado.'); location.hash = '#/propietarios'; }
		btn.disabled = false;
	};
	// Casa que todavía no existe: se crea aquí mismo y queda elegida. La ficha del dueño se guarda antes y
	// después, para que la casa nunca apunte a un dueño sin guardar ni quede fuera de su lista.
	const crearPropiedad = async (elegir) => {
		if (!(await persistir())) return;
		nuevaPropiedad({ id: ref.id, ...form.getData() }, async (casa) => {
			propiedades.push(casa);
			opcionesProp.push([casa.id, casa.titulo]);
			elegir(casa.id, casa.titulo);
			await persistir();
		});
	};
	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar a ${data.nombre}?`, { okText: 'Eliminar' }))) return;
		try {
			// Primero la copia del portal: si quedara, el enlace privado seguiría funcionando.
			if (data.portalToken) await borrarCopia(data.portalToken);
			await deleteDoc(ref); await vincularCasas(ref.id, [], data.propertyIds); toast('Eliminado.'); location.hash = '#/propietarios'; } catch (err) { showError(err); }
	};

	mount(container,
		pageHeader(nuevo ? 'Nuevo propietario' : data.nombre, h('a', { href: '#/propietarios', class: 'btn btn-light' }, 'Volver')),
		!nuevo ? h('div', { class: 'd-flex flex-wrap gap-2 mb-3 align-items-center' }, estadoExclusiva(data),
			data.telefono ? h('a', { href: whatsappUrl(data.telefono, `Hola ${String(data.nombre || '').split(' ')[0]}, te escribo de Equipo Inmobiliario.`), target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-success' }, 'WhatsApp') : null,
			data.telefono ? h('a', { href: `tel:${data.telefono}`, class: 'btn btn-sm btn-outline-primary' }, 'Llamar') : null,
			data.contrato ? h('a', { href: data.contrato, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-outline-primary' }, 'Ver contrato') : null) : null,
		vigilarFormulario(form, 'propietarios'),
		h('div', { class: 'card' }, h('div', { class: 'card-body' }, form.el)),
		!nuevo ? seccionPortal(Object.assign(data, { id: ref.id }), propiedades) : null,
		h('div', { class: 'sticky-actions' },
			h('button', { class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar'),
			h('a', { href: '#/propietarios', class: 'btn btn-light' }, 'Cancelar'),
			!nuevo && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: eliminar }, 'Eliminar') : null));
}

// ——— Portal del propietario ———
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nombreTipo = (t) => (TIPOS_BITACORA.find(([k]) => k === t) || TIPOS_BITACORA[5])[1];

function seccionPortal(prop, propiedades) {
	const ids = (prop.propiedades || []).map((x) => x.propertyId).filter(Boolean);
	const titulo = Object.fromEntries(propiedades.map((p) => [p.id, p.titulo]));
	const misProps = ids.map((id) => [id, titulo[id] || 'Propiedad']);
	const estadoEl = h('div', { class: 'small' });
	const botones = h('div', { class: 'd-flex flex-wrap gap-2 portal-botones' });
	const listaBit = h('div', { class: 'list-group list-group-flush border rounded' });
	const listaVis = h('div', { class: 'd-grid gap-2' });

	const ocupado = async (btn, fn) => {
		if (btn) btn.disabled = true;
		try { await fn(); } catch (err) { showError(err); } finally { if (btn) btn.disabled = false; }
	};
	const refrescar = async (silencioso = false) => {
		if (!prop.portalToken) return;
		await publicarPortal(prop);
		pintarEstado();
		if (!silencioso) toast('Portal actualizado.');
	};
	const mensajeWa = () => `Hola ${String(prop.nombre || '').split(' ')[0]}, aquí puedes ver cómo va tu propiedad (visitas, consultas y próximos pasos), sin tener que llamar:\n${enlacePortal(prop.portalToken)}\n\nEs un enlace privado: no lo compartas.`;

	function pintarEstado() {
		estadoEl.replaceChildren(prop.portalToken
			? h('span', {}, badge('Portal activo', 'success'), ' ', h('span', { class: 'text-muted' }, `Actualizado: ${formatDate(prop.portalActualizado)} · Se actualiza solo cuando hay cambios`))
			: h('span', {}, badge('Sin portal', 'secondary'), ' ', h('span', { class: 'text-muted' }, 'Crea el portal para enviarle el enlace al propietario.')));
		const conToken = Boolean(prop.portalToken);
		botones.replaceChildren();
		mount(botones,
			h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => ocupado(e.currentTarget, async () => { const nuevo = !prop.portalToken; await publicarPortal(prop); pintarEstado(); toast(nuevo ? 'Portal creado. Ya puedes enviar el enlace.' : 'Portal actualizado.'); }) },
				conToken ? 'Actualizar ahora' : 'Crear portal'),
			conToken ? h('a', { class: 'btn btn-success', target: '_blank', rel: 'noopener', href: whatsappUrl(prop.telefono, mensajeWa()) }, 'Enviar por WhatsApp') : null,
			conToken ? h('button', { class: 'btn btn-outline-primary', type: 'button', onclick: async () => toast((await copiar(enlacePortal(prop.portalToken))) ? 'Enlace copiado.' : 'No se pudo copiar. Cópialo a mano.', 'success') }, 'Copiar enlace') : null,
			conToken ? h('a', { class: 'btn btn-outline-primary', target: '_blank', rel: 'noopener', href: enlacePortal(prop.portalToken) }, 'Ver como propietario') : null,
			conToken ? h('button', { class: 'btn btn-outline-danger', type: 'button', onclick: async (e) => {
				const btn = e.currentTarget;
				if (!(await confirmDialog('Se crea un enlace nuevo y el anterior deja de funcionar. Tendrás que enviarle el nuevo al propietario.', { okText: 'Regenerar enlace' }))) return;
				ocupado(btn, async () => { await publicarPortal(prop, { regenerar: true }); pintarEstado(); toast('Enlace nuevo creado. El anterior ya no funciona.'); });
			} }, 'Regenerar enlace') : null,
			conToken ? h('button', { class: 'btn btn-link text-danger', type: 'button', onclick: async (e) => {
				const btn = e.currentTarget;
				if (!(await confirmDialog('El propietario ya no podrá ver su portal (ni con el enlace ni con su correo).', { okText: 'Quitar acceso' }))) return;
				ocupado(btn, async () => { await cerrarPortal(prop); pintarEstado(); toast('Acceso quitado.'); });
			} }, 'Quitar acceso') : null);
	}

	// Bitácora: privada en el propietario; al portal solo van las entradas visibles.
	const guardarBitacora = async (lista) => {
		await updateDoc(doc(db, 'propietarios', prop.id), { bitacora: lista, updatedAt: serverTimestamp() });
		prop.bitacora = lista;
		pintarBitacora();
		await refrescar(true);
	};
	function pintarBitacora() {
		const lista = (prop.bitacora || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
		listaBit.replaceChildren(...(lista.length ? lista.map((b) => h('div', { class: 'list-group-item d-flex flex-wrap gap-2 align-items-start' },
			h('div', { class: 'flex-grow-1', style: 'min-width: 12rem' },
				h('div', { class: 'small text-muted' }, `${formatDate(`${b.fecha}T12:00:00`, false)} · ${nombreTipo(b.tipo)}${b.propertyId && misProps.length > 1 ? ` · ${titulo[b.propertyId] || ''}` : ''}`),
				h('div', { style: 'white-space: pre-line' }, b.texto)),
			h('div', { class: 'form-check form-switch mb-0 align-self-center' },
				h('input', { class: 'form-check-input', type: 'checkbox', id: `vis-${b.id}`, checked: Boolean(b.visible), onchange: (e) => ocupado(null, () => guardarBitacora((prop.bitacora || []).map((x) => (x.id === b.id ? { ...x, visible: e.target.checked } : x)))) }),
				h('label', { class: 'form-check-label small', for: `vis-${b.id}` }, 'Visible para el propietario')),
			h('button', { class: 'btn btn-sm btn-link text-danger p-0 align-self-center', type: 'button', 'aria-label': 'Borrar entrada', onclick: async () => {
				if (!(await confirmDialog('¿Borrar esta entrada de la bitácora?', { okText: 'Borrar' }))) return;
				ocupado(null, () => guardarBitacora((prop.bitacora || []).filter((x) => x.id !== b.id)));
			} }, 'Borrar')))
			: [h('div', { class: 'list-group-item text-muted small' }, 'Sin entradas todavía.')]));
	}
	const fFecha = h('input', { type: 'date', class: 'form-control', value: hoy(), required: true, id: 'bit-fecha' });
	// Una «Nota» suele ser interna: al elegirla, el propietario no la ve salvo que se marque.
	const fTipo = h('select', { class: 'form-select', id: 'bit-tipo', onchange: (e) => { fVisible.checked = e.target.value !== 'nota'; } }, TIPOS_BITACORA.map(([v, t]) => h('option', { value: v }, t)));
	const fProp = misProps.length > 1 ? h('select', { class: 'form-select', id: 'bit-prop' }, h('option', { value: '' }, 'Todas'), misProps.map(([v, t]) => h('option', { value: v }, t))) : null;
	const fTexto = h('textarea', { class: 'form-control', rows: 2, required: true, maxlength: 600, id: 'bit-texto', placeholder: 'Ej.: Subimos 8 fotos nuevas de la terraza.' });
	const fVisible = h('input', { class: 'form-check-input', type: 'checkbox', checked: true, id: 'bit-visible' });
	const formBit = h('form', { class: 'row g-2 align-items-end mb-3', onsubmit: (e) => {
		e.preventDefault();
		const texto = fTexto.value.trim();
		if (!texto) return toast('Escribe qué pasó.', 'warning');
		const entrada = { id: Math.random().toString(36).slice(2, 10), fecha: fFecha.value || hoy(), tipo: fTipo.value, texto, propertyId: fProp ? fProp.value : '', visible: fVisible.checked };
		ocupado(e.submitter, async () => { await guardarBitacora([...(prop.bitacora || []), entrada]); fTexto.value = ''; toast(prop.portalToken ? 'Agregado a la bitácora y portal actualizado.' : 'Agregado a la bitácora.'); });
	} },
		h('div', { class: 'col-6 col-md-3' }, h('label', { class: 'form-label small', for: 'bit-fecha' }, 'Fecha'), fFecha),
		h('div', { class: 'col-6 col-md-3' }, h('label', { class: 'form-label small', for: 'bit-tipo' }, 'Tipo'), fTipo),
		fProp ? h('div', { class: 'col-12 col-md-6' }, h('label', { class: 'form-label small', for: 'bit-prop' }, 'Propiedad'), fProp) : null,
		h('div', { class: 'col-12' }, h('label', { class: 'form-label small', for: 'bit-texto' }, 'Qué pasó'), fTexto,
			h('div', { class: 'form-text' }, 'No escribas nombres ni teléfonos de clientes.')),
		h('div', { class: 'col-12 d-flex flex-wrap gap-3 align-items-center justify-content-between' },
			h('div', { class: 'form-check mb-0' }, fVisible, h('label', { class: 'form-check-label', for: 'bit-visible' }, 'Visible para el propietario')),
			h('button', { class: 'btn btn-primary', type: 'submit' }, 'Agregar a la bitácora')));

	// Próximo paso.
	const fPaso = h('input', { class: 'form-control', id: 'portal-paso', maxlength: 400, value: prop.proximoPaso || '', placeholder: 'Ej.: Open house el sábado 10 a las 10:00' });
	const formPaso = h('form', { class: 'd-flex flex-wrap gap-2 align-items-end', onsubmit: (e) => {
		e.preventDefault();
		ocupado(e.submitter, async () => {
			prop.proximoPaso = fPaso.value.trim();
			await updateDoc(doc(db, 'propietarios', prop.id), { proximoPaso: prop.proximoPaso, updatedAt: serverTimestamp() });
			await refrescar(true);
			toast('Próximo paso guardado.');
		});
	} }, h('div', { class: 'flex-grow-1', style: 'min-width: 14rem' }, h('label', { class: 'form-label small', for: 'portal-paso' }, 'Próximo paso (lo ve el propietario)'), fPaso),
	h('button', { class: 'btn btn-outline-primary', type: 'submit' }, 'Guardar paso'));

	// Comentarios de visitas (de la agenda): texto aparte, sin datos del cliente.
	async function pintarVisitas() {
		listaVis.replaceChildren(h('div', { class: 'small text-muted' }, 'Cargando visitas…'));
		try {
			const vis = (await visitasDe(prop)).sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)).slice(0, 20);
			if (!vis.length) { listaVis.replaceChildren(h('div', { class: 'small text-muted' }, 'No hay visitas en la agenda para estas propiedades. Las visitas se registran desde la ficha del cliente (tipo «Visita»).')); return; }
			listaVis.replaceChildren(...vis.map((a) => {
				const txt = h('textarea', { class: 'form-control form-control-sm', rows: 2, maxlength: 600, id: `vc-${a.id}`, placeholder: 'Ej.: Les gustó la cocina; preguntaron por el parqueo de visitas.' }, a.comentarioPropietario || '');
				const chk = h('input', { class: 'form-check-input', type: 'checkbox', id: `vv-${a.id}`, checked: Boolean(a.visiblePropietario) });
				return h('form', { class: 'border rounded p-2', onsubmit: (e) => {
					e.preventDefault();
					ocupado(e.submitter, async () => {
						await updateDoc(doc(db, 'actividades', a.id), { comentarioPropietario: txt.value.trim(), visiblePropietario: chk.checked });
						await refrescar(true);
						toast('Comentario guardado.');
					});
				} },
				h('div', { class: 'small text-muted mb-1' }, `${formatDate(a.fecha)} · ${titulo[a.pid] || ''}${a.hecha ? ' · hecha' : ''}`),
				h('label', { class: 'visually-hidden', for: `vc-${a.id}` }, 'Comentario para el propietario'), txt,
				h('div', { class: 'd-flex flex-wrap gap-2 align-items-center justify-content-between mt-2' },
					h('div', { class: 'form-check mb-0' }, chk, h('label', { class: 'form-check-label small', for: `vv-${a.id}` }, 'Visible para el propietario')),
					h('button', { class: 'btn btn-sm btn-outline-primary', type: 'submit' }, 'Guardar comentario')));
			}));
		} catch (err) { listaVis.replaceChildren(h('div', { class: 'small text-danger' }, 'No se pudieron cargar las visitas.')); console.error(err); }
	}

	// Comentarios que dejó el propietario en su portal (solo lectura).
	const listaCom = h('div', { class: 'list-group' });
	// En vivo: lo que responda el propietario aparece solo, sin recargar.
	let dejarDeEscuchar = null;
	function pintarComentarios() {
		listaCom.replaceChildren(h('div', { class: 'list-group-item small text-muted' }, 'Cargando comentarios…'));
		dejarDeEscuchar?.();
		dejarDeEscuchar = escucharComentarios(prop, (lista) => {
			if (!listaCom.isConnected && listaCom.dataset.visto) return dejarDeEscuchar?.();
			listaCom.dataset.visto = '1';
			listaCom.replaceChildren(...(lista.length ? lista.map((c) => h('div', { class: 'list-group-item' },
				h('div', { class: 'small text-muted d-flex flex-wrap gap-2 align-items-center' },
					c.tipo === 'aprobado' ? badge('Aprobó el anuncio', 'success') : badge('Pidió cambios', 'warning'),
					`${formatDate(c.fecha)}${c.propiedadId && misProps.length > 1 ? ` · ${titulo[c.propiedadId] || ''}` : ''}`),
				c.texto ? h('div', { class: 'mt-1', style: 'white-space: pre-line' }, c.texto) : null))
				: [h('div', { class: 'list-group-item text-muted small' }, 'El propietario todavía no ha respondido sobre el anuncio.')]));
		}, (err) => { listaCom.replaceChildren(h('div', { class: 'list-group-item small text-danger' }, `No se pudieron cargar los comentarios (${err?.code || err?.message || 'error'}).`)); console.error(err); });
	}

	pintarEstado();
	pintarBitacora();
	pintarVisitas();
	pintarComentarios();
	return h('div', { class: 'card mt-4', id: 'portal-propietario' },
		h('div', { class: 'card-header bg-white' }, h('h2', { class: 'h5 mb-0' }, 'Portal del propietario')),
		h('div', { class: 'card-body d-grid gap-4' },
			h('div', { class: 'd-grid gap-2' },
				h('p', { class: 'text-muted small mb-0' }, 'El propietario ve el estado, los días en el mercado, cuántas consultas, visitas y ofertas hubo, cómo se anuncia (título, precio, datos, descripción y fotos), el historial de precio, los portales, lo que marques como visible y la lista de clientes interesados como «Cliente 1, 2…» (solo cómo llegaron, fechas, visitas y etapa; nunca nombres, teléfonos ni correos). El portal se actualiza solo cuando cambias la propiedad, una visita o la etapa de un cliente. Entra con el enlace privado o con su correo, sin contraseña, y puede dejarte comentarios si quiere cambios.'),
				!prop.email ? h('div', { class: 'alert alert-info small mb-0' }, 'Agrega el correo del propietario (arriba) para que también pueda entrar con su correo.') : null,
				estadoEl, botones),
			formPaso,
			h('div', {}, h('h3', { class: 'h6' }, 'Respuesta del propietario al anuncio'), h('p', { class: 'small text-muted' }, 'Si aprobó cómo se anuncia o los cambios que pidió desde su portal. Lo más nuevo arriba.'), listaCom),
			h('div', {}, h('h3', { class: 'h6' }, 'Bitácora del asesor'), formBit, listaBit),
			h('div', {}, h('h3', { class: 'h6' }, 'Comentarios de visitas'), h('p', { class: 'small text-muted' }, 'Escribe un comentario para el propietario y márcalo como visible. No escribas el nombre del cliente.'), listaVis)));
}

export async function render(container, [id]) {
	if (id && id !== 'incompletos') return renderEditor(container, id);
	return renderLista(container);
}
