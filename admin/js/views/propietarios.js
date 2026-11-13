// Propietarios: dueños de los inmuebles, exclusivas con vencimiento y comisión acordada.
import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, serverTimestamp } from '../firebase.js';
import { h, toast, showError, confirmDialog, pageHeader, emptyState, mount, badge, formatDate, cajaTabla, modal, formatPrice } from '../ui.js';
import { renderForm } from '../form.js';
import { session, agentOptions, loadAgents } from '../session.js';
import { whatsappUrl, copiar } from '../ia.js';
import { publicarPortal, cerrarPortal, borrarCopia, enlacePortal, visitasDe, escucharComentarios, TIPOS_BITACORA } from '../portal.js';
import { loadPropietarios, loadPropiedades, loadAcuerdos, telNorm, loadReglas } from '../crm.js';
import { sinTildes } from '../cotizacion.js';
import { OPERACIONES, TIPOS, MONEDAS, datosDe, loadAll, propiedadNueva, slugLibre, vacacionalPublico, guardarPrivadoVacacional } from './properties.js';
import { generarCodigo } from '../importar.js';
import { CAMPOS_ACUERDO, acuerdoDe, acuerdoHeredado, diasExclusiva, exclusivasPorVencer, legadoSobrante } from '../acuerdo.js';
import { revisar, chipFaltan, vigilarFormulario, avisarCambio } from '../pendientes.js';

// Cada casa guarda de quién es (propietarioId): así el socio de rentas ve solo las suyas.
// Si la casa es de otro asesor, Firestore no deja tocarla y se sigue con las demás.
function vincularCasas(id, ahora = [], antes = []) {
	const quitadas = antes.filter((p) => !ahora.includes(p));
	const cambios = [...ahora.map((p) => [p, id]), ...quitadas.map((p) => [p, ''])];
	return Promise.all([
		...cambios.map(([p, propietarioId]) => updateDoc(doc(db, 'properties', p), { propietarioId }).catch(() => {})),
		// El acuerdo era con este dueño: una casa que deja de ser suya no se lo lleva al siguiente.
		...quitadas.map((p) => deleteDoc(doc(db, 'properties', p, 'privado', 'acuerdo')).catch(() => {}))
	]);
}

// Ficha corta de una casa (foto, título, zona, datos y precio), con las mismas piezas del listado de Propiedades.
// Devuelve las piezas; quien la usa pone el contenedor (el botón que la elige o el que la cambia).
function fichaCasa(p, avisos = []) {
	const chips = datosDe(p);
	const operacion = OPERACIONES.find(([v]) => v === p.operacion)?.[1] || '';
	return [
		p.fotos?.[0]?.url ? h('img', { class: 'thumb flex-shrink-0', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia flex-shrink-0', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' })),
		// En celular el precio baja a su propia línea; el título no se aprieta.
		h('span', { class: 'flex-grow-1', style: 'flex-basis: 12rem; min-width: 0' },
			h('span', { class: 'd-block fw-semibold prop-titulo' }, p.titulo || '(sin título)', ' ', p.publicado ? null : badge('Sin publicar', 'light'), avisos),
			h('span', { class: 'd-block small text-muted prop-zona' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${[operacion, p.zona, p.ciudad].filter(Boolean).join(' · ')}`),
			chips.length ? h('span', { class: 'd-block prop-datos' }, chips) : null),
		h('span', { class: 'text-nowrap fw-semibold ms-auto' }, formatPrice(p.precio, p.moneda, p.operacion))];
}
const FILA_CASA = 'd-flex flex-wrap align-items-center gap-2 text-start';

// «Nueva propiedad» desde la ficha del dueño: lo mínimo para que la casa exista, sin publicar y ya enlazada a él.
// Lo demás (fotos, descripción, dirección) se completa en Propiedades; «Faltan» avisa qué le falta.
function nuevaPropiedad(dueno, operacion, alCrear) {
	const V = window.EQVacacional;
	const porNoche = (d) => d.operacion === 'vacacional';
	const form = renderForm([
		{ name: 'titulo', label: 'Título', required: true, placeholder: 'Casa de playa en Monterrico' },
		{ name: 'operacion', label: 'Operación', type: 'select', cols: 6, options: OPERACIONES },
		{ name: 'tipo', label: 'Tipo', type: 'select', cols: 6, options: TIPOS },
		{ name: 'zona', label: 'Zona', cols: 6 },
		{ name: 'ciudad', label: 'Ciudad', cols: 6 },
		{ name: 'precio', label: 'Precio', type: 'number', min: 0, step: 1, cols: 6, when: (d) => !porNoche(d), help: 'Vacío = «Precio a consultar».' },
		{ name: 'precioSocio', label: 'Precio por noche del socio', type: 'number', min: 0, step: 0.01, cols: 6, when: porNoche, help: 'Lo que recibe el socio. Privado.' },
		{ name: 'moneda', label: 'Moneda', type: 'select', cols: 6, options: MONEDAS }
	], { operacion, tipo: 'casa', ciudad: 'Guatemala', moneda: 'USD' });
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

// Qué tiene un dueño con nosotros: la operación de cada una de sus casas. Una misma persona puede tener casas por
// noche y otras en venta o renta, en una sola ficha. De eso depende lo poco que se le pide a la persona:
//  - con casas por noche es socio de renta vacacional: datos de pago (y su correo recibe las solicitudes);
//  - con venta o renta: el asesor que la atiende.
// La exclusiva, la comisión y los impuestos no son de la persona: son de cada inmueble (admin/js/acuerdo.js).
// Sin casas todavía no se le pide nada de eso: primero se agregan sus propiedades.
export const esSocio = (d) => Boolean(d.porNoche) || d.tipo === 'socio'; // «tipo: socio» = fichas de antes
function operacionesDe(d, propiedades) {
	const ops = (d.propiedades || []).map((x) => propiedades.find((p) => p.id === x.propertyId)?.operacion).filter(Boolean);
	if (ops.length) return ops;
	return [...(esSocio(d) ? ['vacacional'] : []), ...(d.comisionPct || d.exclusiva || d.impuestoVenta || d.contrato ? ['venta', 'renta'] : [])];
}

// Estado de la exclusiva de un inmueble, a partir de su acuerdo (admin/js/acuerdo.js).
export function estadoExclusiva(acuerdo) {
	const d = diasExclusiva(acuerdo);
	if (d === null) return acuerdo?.exclusiva ? badge('Exclusiva sin fecha', 'secondary') : badge('Sin exclusiva', 'light');
	if (d < 0) return badge(`Vencida hace ${-d} días`, 'danger');
	if (d <= 30) return badge(`Vence en ${d} días`, 'warning');
	return badge(`Exclusiva · ${d} días`, 'success');
}
const casasDe = (p, propiedades) => propiedades.filter((c) => c.propietarioId === p.id || (p.propiedades || []).some((x) => x.propertyId === c.id));

// El acuerdo (exclusiva, comisión, impuestos) se guardaba una sola vez en la persona; ahora es de cada inmueble.
// Lo que quedó en la persona se copia a cada inmueble suyo que todavía no tiene acuerdo propio y que yo puedo
// escribir; nunca se escribe encima de uno que ya existe ni de uno que no se pudo leer. De la persona se borra
// solo lo que ya quedó en todos los inmuebles donde aplica, y solo si veo todas sus casas.
async function migrarAcuerdos(lista, propiedades, acuerdos) {
	for (const p of lista) {
		if (!CAMPOS_ACUERDO.some((k) => p[k] !== undefined)) continue;
		try {
			const casas = casasDe(p, propiedades);
			for (const c of casas) {
				if (acuerdos[c.id] !== null || !(session.isAdmin || (c.agentId && c.agentId === session.agentId))) continue;
				const heredado = acuerdoHeredado(p, c.operacion);
				const destino = doc(db, 'properties', c.id, 'privado', 'acuerdo');
				// Se vuelve a mirar justo antes: si alguien lo guardó mientras tanto, se respeta.
				const ya = await getDoc(destino);
				if (ya.exists()) { acuerdos[c.id] = ya.data(); continue; }
				await setDoc(destino, { ...heredado, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
				acuerdos[c.id] = heredado;
			}
			const veoTodas = (p.propiedades || []).every((x) => propiedades.some((c) => c.id === x.propertyId));
			const sobrante = veoTodas ? legadoSobrante(p, casas, casas.filter((c) => acuerdos[c.id]).map((c) => c.id)) : [];
			if (sobrante.length) {
				await updateDoc(doc(db, 'propietarios', p.id), Object.fromEntries(sobrante.map((k) => [k, deleteField()])));
				sobrante.forEach((k) => delete p[k]);
			}
		} catch (err) { console.warn('Acuerdo sin pasar al inmueble', p.id, err); }
	}
}

async function renderLista(container) {
	const [lista, propiedades, agentes, reglas] = await Promise.all([loadPropietarios(), loadPropiedades(), loadAgents(), loadReglas()]);
	const acuerdos = await loadAcuerdos(propiedades.filter((c) => lista.some((p) => casasDe(p, [c]).length)));
	await migrarAcuerdos(lista, propiedades, acuerdos);
	const tituloProp = Object.fromEntries(propiedades.map((p) => [p.id, p.titulo]));
	const nombreAsesor = Object.fromEntries(agentes.map((a) => [a.id, a.nombre]));
	// La exclusiva es de cada inmueble: de cada persona se muestra la más urgente de las suyas.
	const acuerdosDe = (p) => casasDe(p, propiedades).map((c) => acuerdoDe(acuerdos[c.id], p, c.operacion));
	const masUrgente = (p) => acuerdosDe(p).filter((a) => a.exclusiva).sort((a, b) => (diasExclusiva(a) ?? 9999) - (diasExclusiva(b) ?? 9999))[0] || null;
	const porVencer = exclusivasPorVencer(propiedades, acuerdos, lista);
	lista.sort((a, b) => (diasExclusiva(masUrgente(a)) ?? 9999) - (diasExclusiva(masUrgente(b)) ?? 9999));
	const faltanDe = (p) => revisar('propietarios', p);
	const solo = h('input', { type: 'checkbox', class: 'form-check-input', id: 'solo-incompletos', checked: /\/incompletos$/.test(location.hash) });
	const tabla = h('div');
	// Lo que gana la empresa con cada quien, según lo que tiene: venta (%), renta (meses) y por noche (margen de la casa).
	const comisionDe = (p) => {
		const ops = operacionesDe(p, propiedades);
		const acordado = (campo, op) => [...new Set(casasDe(p, propiedades).filter((c) => c.operacion === op).map((c) => acuerdoDe(acuerdos[c.id], p, op)[campo]).filter((v) => v !== undefined && v !== '').map(Number))];
		const pct = acordado('comisionPct', 'venta'), meses = acordado('comisionRentaMeses', 'renta');
		return [
			ops.includes('venta') ? `Venta ${pct.length ? pct.join(' y ') : reglas.comisionVentaPct} %` : '',
			ops.includes('renta') ? `Renta ${meses.length ? meses.join(' y ') : reglas.comisionRentaMeses} ${String(meses.length ? meses.at(-1) : reglas.comisionRentaMeses) === '1' ? 'mes' : 'meses'}` : '',
			ops.includes('vacacional') ? 'Por noche: margen' : ''
		].filter(Boolean).join(' · ') || '—';
	};
	const fila = (p) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/propietarios/${p.id}`; } },
		h('td', {}, h('div', { class: 'fw-semibold' }, p.nombre || '(sin nombre)', p.tipo === 'colaborador' ? [' ', badge('Colaborador', 'info')] : null, esSocio(p) ? [' ', badge('Socio', 'primary')] : null), h('div', { class: 'small text-muted' }, [p.empresa, p.telefono || p.email].filter(Boolean).join(' · ')), chipFaltan(faltanDe(p))),
		h('td', { class: 'small' }, (p.propiedades || []).map((x) => tituloProp[x.propertyId]).filter(Boolean).join(', ') || '—'),
		h('td', {}, estadoExclusiva(masUrgente(p))),
		h('td', { class: 'small' }, comisionDe(p)),
		session.isAdmin ? h('td', { class: 'small' }, nombreAsesor[p.agentId] || (operacionesDe(p, propiedades).some((o) => o !== 'vacacional') ? 'Sin asignar' : '—')) : null);
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
		h('p', { class: 'text-muted' }, 'Dueños de los inmuebles que manejan: contacto y propiedades. La exclusiva y la comisión se acuerdan en cada inmueble.'),
		porVencer.length ? h('div', { class: 'alert alert-warning' }, h('strong', {}, `${porVencer.length === 1 ? 'Una exclusiva vencida o por vencer' : `${porVencer.length} exclusivas vencidas o por vencer`} en 30 días. `),
			porVencer.slice(0, 5).map((x, k) => [k ? ' · ' : '', h('a', { href: `#/propiedades/${x.casa.id}`, class: 'alert-link' }, x.casa.titulo || 'Inmueble'), ` (${x.dueno?.nombre || 'sin dueño'}, ${x.dias < 0 ? `venció hace ${-x.dias} días` : `en ${x.dias} días`})`]),
			porVencer.length > 5 ? ` y ${porVencer.length - 5} más.` : '') : null,
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
	const data = nuevo ? { agentId: session.isAdmin ? '' : session.agentId, propiedades: [] } : snap.data();
	const acuerdos = await loadAcuerdos(casasDe({ id: ref.id, ...data }, propiedades));
	// Ficha de antes con «tipo: socio»: pasa a propietario; lo de socio lo dicen sus casas.
	if (data.tipo === 'socio') Object.assign(data, { tipo: 'propietario', porNoche: true });
	const conComision = (d) => operacionesDe(d, propiedades).some((o) => o !== 'vacacional');
	const conNoche = (d) => operacionesDe(d, propiedades).includes('vacacional');
	const conCasas = (d) => operacionesDe(d, propiedades).length > 0;
	// Lo que todavía queda en la persona del acuerdo de antes (se pasa a sus inmuebles; ver migrarAcuerdos).
	const legado = (d) => [
		d.exclusiva ? `exclusiva${d.exclusivaFin ? ` hasta ${String(d.exclusivaFin).split('-').reverse().join('/')}` : ''}` : '',
		d.comisionPct ? `comisión de venta ${d.comisionPct} %` : '',
		d.comisionRentaMeses ? `comisión de renta ${d.comisionRentaMeses} meses` : '',
		d.impuestoVenta ? `impuesto del traspaso: ${d.impuestoVenta === 'iva' ? 'IVA' : 'timbres'}` : '',
		d.contrato ? 'enlace al contrato' : ''
	].filter(Boolean);
	const form = renderForm([
		// Quién nos dio el inmueble: su dueño, o un asesor de otra oficina que lo comparte con nosotros.
		// Ser socio de renta vacacional no se elige: lo es quien tiene al menos una casa por noche.
		{ name: 'tipo', label: 'Es', type: 'select', default: 'propietario', cols: 6, options: [
			['propietario', 'Propietario (dueño del inmueble)'], ['colaborador', 'Asesor colaborador (nos pasó el inmueble)']],
			help: 'Colaborador: su comisión acordada es la parte que comparte con nosotros.' },
		{ name: 'empresa', label: 'Empresa o inmobiliaria', cols: 6, when: (d) => d.tipo === 'colaborador' },
		{ name: 'nombre', label: 'Nombre', required: true, cols: 6 },
		{ name: 'telefono', label: 'Teléfono / WhatsApp', type: 'telefono', cols: 6 },
		{ name: 'email', label: 'Correo', type: 'email', cols: 6 },
		// Primero, qué tiene con nosotros. De ahí en adelante cada bloque sale solo si le aplica (ver «operacionesDe»);
		// a quien todavía no tiene casas no se le pide asesor, comisión, datos de pago ni impuestos.
		{ type: 'section', label: 'Propiedades', when: conCasas },
		{ type: 'section', label: 'Propiedades', when: (d) => !conCasas(d), help: 'Agrega sus propiedades: según lo que tenga (por noche, renta o venta), abajo se pide solo lo que le corresponde.' },
		{ name: 'propiedades', label: 'Propiedades de este propietario', type: 'list', itemLabel: 'Propiedad', onAdd: (item, quitar) => elegirCasa(item, quitar), fields: [
			{ type: 'custom', update: (el, _, item) => pintarCasa(el, item) }
		] },
		// Venta, renta y renta por noche no son lo mismo: cada una con su bloque y lo que se le pide.
		{ type: 'section', label: 'Renta por noche', when: conNoche, help: 'Es socio de renta vacacional: a su correo le llegan las solicitudes de reserva y atiende él mismo sus casas. La empresa gana el margen de cada casa (se pone en la ficha de la casa).' },
		{ name: 'datosPago', label: 'Datos de pago para las reservas', type: 'textarea', rows: 2, maxlength: 1000, when: conNoche, placeholder: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de…', help: 'Se le envían al cliente por el chat al confirmar su reserva.' },
		// La exclusiva, la comisión y los impuestos son de cada inmueble: se ponen en la ficha del inmueble
		// («Acuerdo con el dueño»). Aquí queda solo quién atiende a esta persona, que decide qué asesor la ve.
		session.isAdmin ? { type: 'section', label: 'Asesor', when: conComision, help: 'El asesor que atiende a esta persona por lo que tiene en venta o renta: es quien la ve en su panel. Sus casas por noche no llevan asesor.' } : null,
		session.isAdmin ? { name: 'agentId', label: 'Asesor que lo atiende', type: 'select', options: agentes, cols: 6, when: conComision } : null,
		{ type: 'custom', when: (d) => legado(d).length > 0, update: (el, d) => {
			el.className = 'alert alert-info small mb-0';
			el.textContent = `Acuerdo anotado antes en esta ficha: ${legado(d).join(' · ')}. Ahora es de cada inmueble: se pasa solo al inmueble cuando se abre Propietarios, o al guardar la ficha del inmueble.`;
		} },
		{ type: 'section', label: 'Notas' },
		{ name: 'notas', label: 'Notas', type: 'textarea', rows: 3 }
	].filter(Boolean), data, { folder: `propietarios/${ref.id}` });

	// Guarda la ficha. Devuelve false si falta algo o falló (ya avisó).
	const persistir = async () => {
		if (!form.validate()) return false;
		const d = form.getData();
		d.telefonoNorm = telNorm(d.telefono);
		// Solo el enlace a la casa (antes se guardaba también un «precio mínimo aceptado»: aquí no se regatea).
		d.propiedades = (d.propiedades || []).filter((x) => x.propertyId).map((x) => ({ propertyId: x.propertyId }));
		d.propertyIds = d.propiedades.map((x) => x.propertyId);
		d.porNoche = d.propiedades.length ? conNoche(d) : Boolean(data.porNoche);
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
	// La casa de cada renglón: su ficha corta, que al tocarla abre el selector para elegirla o cambiarla.
	// La exclusiva de cada casa, de su acuerdo (o de lo que quedó en la persona, mientras no se pase).
	function exclusivaDe(p) {
		const acuerdo = acuerdoDe(acuerdos[p.id], data, p.operacion);
		return [acuerdo.exclusiva ? [' ', estadoExclusiva(acuerdo)] : null, acuerdo.contrato ? [' ', badge('Con contrato', 'light')] : null];
	}
	// (Declarada con «function»: el formulario la llama al armarse, antes de llegar a esta línea.)
	function pintarCasa(el, item) {
		const p = propiedades.find((x) => x.id === item.propertyId);
		el.replaceChildren(h('button', { type: 'button', class: `btn btn-light border w-100 ${FILA_CASA}`, title: p ? 'Cambiar la propiedad' : '', onclick: () => elegirCasa(item) },
			p ? fichaCasa(p, exclusivaDe(p)) : [h('span', { class: 'icon-search', 'aria-hidden': 'true' }), ' Elegir propiedad…']));
	}
	// Selector: buscador y una ficha por inmueble, para ver qué se elige. Arriba, «Nueva propiedad».
	// Desde «Agregar propiedad» llega «quitar»: si se cierra sin elegir, el renglón vacío no se queda.
	const elegirCasa = (item, quitar) => {
		let creando = false;
		const enOtroRenglon = new Set((form.state.propiedades || []).map((x) => x.propertyId).filter((x) => x && x !== item.propertyId));
		const elegir = (casaId) => { item.propertyId = casaId; form.refresh(); ventana.close(); };
		const buscar = h('input', { class: 'form-control mb-2', type: 'search', 'aria-label': 'Buscar propiedad', placeholder: 'Buscar título, código o zona…' });
		const lista = h('div', { class: 'list-group' });
		// Tres categorías, una a la vez: abre en la del renglón (o en la primera que esta persona ya tiene) y se cambia arriba.
		const CATEGORIAS = [['venta', 'Venta', 'icon-home'], ['renta', 'Renta', 'icon-key'], ['vacacional', 'Por noche', 'icon-moon-o']];
		const actual = propiedades.find((p) => p.id === item.propertyId);
		const tiene = operacionesDe(form.state, propiedades);
		let categoria = actual?.operacion || CATEGORIAS.map(([v]) => v).find((v) => tiene.includes(v)) || 'venta';
		const pestanas = CATEGORIAS.map(([valor, texto, icono]) => h('button', { type: 'button', class: 'btn btn-outline-primary', dataset: { categoria: valor }, onclick: () => { categoria = valor; dibujar(); } }, h('span', { class: icono, 'aria-hidden': 'true' }), ` ${texto}`));
		const dibujar = () => {
			const q = sinTildes(buscar.value.trim());
			pestanas.forEach((b) => { const on = b.dataset.categoria === categoria; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
			const visibles = propiedades.filter((p) => !enOtroRenglon.has(p.id) && p.operacion === categoria).filter((p) => !q || sinTildes(`${p.titulo} ${p.codigo || ''} ${p.zona || ''} ${p.ciudad || ''}`).includes(q));
			lista.replaceChildren(
				h('button', { type: 'button', class: 'list-group-item list-group-item-action fw-semibold', onclick: () => { creando = true; ventana.close(); crearPropiedad(categoria, (casaId) => { item.propertyId = casaId; form.refresh(); }); } },
					h('span', { class: 'icon-plus', 'aria-hidden': 'true' }), ' Nueva propiedad'),
				...visibles.map((p) => h('button', { type: 'button', class: `list-group-item list-group-item-action ${FILA_CASA}${p.id === item.propertyId ? ' active' : ''}`, onclick: () => elegir(p.id) },
					fichaCasa(p, p.propietarioId && p.propietarioId !== ref.id ? [' ', badge('Ya tiene dueño', 'warning')] : []))),
				visibles.length ? null : h('div', { class: 'list-group-item text-muted small' }, `No hay ${{ venta: 'propiedades en venta', renta: 'propiedades en renta', vacacional: 'casas por noche' }[categoria]} que coincidan. Puedes crearla con «Nueva propiedad».`));
		};
		buscar.addEventListener('input', dibujar);
		dibujar();
		const ventana = modal({ title: 'Elegir propiedad', size: 'modal-lg', body: h('div', {}, h('div', { class: 'btn-group w-100 mb-2', role: 'group', 'aria-label': 'Categoría' }, pestanas), buscar, lista),
			onClose: () => { if (quitar && !creando && !item.propertyId) quitar(); } });
	};
	// Casa que todavía no existe: se crea aquí mismo y queda elegida. La ficha del dueño se guarda antes y
	// después, para que la casa nunca apunte a un dueño sin guardar ni quede fuera de su lista.
	const crearPropiedad = async (operacion, elegir) => {
		if (!(await persistir())) return;
		nuevaPropiedad({ id: ref.id, ...form.getData() }, operacion, async (casa) => {
			propiedades.push(casa);
			elegir(casa.id);
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
		!nuevo ? h('div', { class: 'd-flex flex-wrap gap-2 mb-3 align-items-center' },
			data.telefono ? h('a', { href: whatsappUrl(data.telefono, `Hola ${String(data.nombre || '').split(' ')[0]}, te escribo de Equipo Inmobiliario.`), target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-success' }, 'WhatsApp') : null,
			data.telefono ? h('a', { href: `tel:${data.telefono}`, class: 'btn btn-sm btn-outline-primary' }, 'Llamar') : null,
			null) : null,
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
