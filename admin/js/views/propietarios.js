// Propietarios: dueños de los inmuebles, exclusivas con vencimiento y comisión acordada.
import { auth, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, collection, query, where, serverTimestamp, sendPasswordResetEmail } from '../firebase.js';
import { h, toast, showError, errorMessage, confirmDialog, pageHeader, emptyState, mount, badge, formatDate, cajaTabla, modal, formatPrice, iconoBtn } from '../ui.js';
import { renderForm } from '../form.js';
import { session, agentOptions, loadAgents } from '../session.js';
import { whatsappUrl } from '../ia.js';
import { publicarPortal, borrarCopia, visitasDe, escucharComentarios, reglasNuevas, VERSION_RESUMEN, TIPOS_BITACORA } from '../portal.js';
import { correoDe, accesosDe, accesoDe, ponerAcceso, darAcceso } from '../acceso.js';
import { loadPropietarios, loadPropiedades, loadAcuerdos, telNorm, loadReglas } from '../crm.js';
import { sinTildes } from '../cotizacion.js';
import { abrirFicha } from './properties.js';
import { CAMPOS_ACUERDO, acuerdoDe, acuerdoHeredado, diasExclusiva, exclusivasPorVencer, legadoSobrante } from '../acuerdo.js';
import { fichaCasa, FILA_CASA, estadoExclusiva } from '../ficha-casa.js';
import { tieneCasasPorNoche, casasDe, etiquetaDueno } from '../duenos.js';
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

// Qué tiene un dueño con nosotros: la operación de cada una de sus casas. Una misma persona puede tener casas por
// noche y otras en venta o renta, en una sola ficha. De eso depende lo poco que se le pide a la persona:
//  - con casas por noche es socio de renta vacacional: datos de pago (y su correo recibe las solicitudes);
//  - con venta o renta: el asesor que la atiende.
// La exclusiva, la comisión y los impuestos no son de la persona: son de cada inmueble (admin/js/acuerdo.js).
// Sin casas todavía no se le pide nada de eso: primero se agregan sus propiedades. (tieneCasasPorNoche: admin/js/duenos.js)
function operacionesDe(d, propiedades) {
	const ops = (d.propiedades || []).map((x) => propiedades.find((p) => p.id === x.propertyId)?.operacion).filter(Boolean);
	if (ops.length) return ops;
	return [...(tieneCasasPorNoche(d) ? ['vacacional'] : []), ...(d.comisionPct || d.exclusiva || d.impuestoVenta || d.contrato ? ['venta', 'renta'] : [])];
}

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
	// Con las reglas de antes, aviso de qué falta y en qué orden (se va solo cuando estén publicadas).
	const avisoReglas = session.isAdmin && !(await reglasNuevas()) ? h('div', { class: 'alert alert-warning small', id: 'aviso-reglas' },
		h('strong', {}, 'Falta publicar las reglas nuevas de la base. '),
		'1) Esta pantalla ya está rehaciendo lo que ve cada dueño en su panel (espera unos segundos). 2) Publicá las reglas: firebase deploy --only firestore:rules --project eqinmobiliariobd. 3) Después dale acceso a los dueños de venta o renta y a los colaboradores: el botón se habilita solo.') : null;
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
		h('td', {}, h('div', { class: 'fw-semibold' }, p.nombre || '(sin nombre)', p.tipo === 'colaborador' ? [' ', badge('Colaborador', 'info')] : null, tieneCasasPorNoche(p) ? [' ', badge('Socio', 'primary')] : null), h('div', { class: 'small text-muted' }, [p.empresa, p.telefono || p.email].filter(Boolean).join(' · ')), chipFaltan(faltanDe(p))),
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
		avisoReglas,
		h('p', { class: 'text-muted' }, 'Dueños de los inmuebles que manejan: contacto y propiedades. La exclusiva y la comisión se acuerdan en cada inmueble.'),
		porVencer.length ? h('div', { class: 'alert alert-warning' }, h('strong', {}, `${porVencer.length === 1 ? 'Una exclusiva vencida o por vencer' : `${porVencer.length} exclusivas vencidas o por vencer`} en 30 días. `),
			porVencer.slice(0, 5).map((x, k) => [k ? ' · ' : '', h('a', { href: `#/propiedades/${x.casa.id}`, class: 'alert-link' }, x.casa.titulo || 'Inmueble'), ` (${x.dueno?.nombre || 'sin dueño'}, ${x.dias < 0 ? `venció hace ${-x.dias} días` : `en ${x.dias} días`})`]),
			porVencer.length > 5 ? ` y ${porVencer.length - 5} más.` : '') : null,
		lista.length ? [h('div', { class: 'form-check mb-3' }, solo, h('label', { class: 'form-check-label', for: 'solo-incompletos' }, 'Solo con datos por completar')), tabla]
			: emptyState('Aún no hay propietarios registrados.', h('a', { href: '#/propietarios/nuevo', class: 'btn btn-primary' }, 'Registrar propietario')));
	// Quien entra al panel necesita su resumen: se arma aparte, sin esperar (ver asegurarResumenes).
	if (session.isAdmin) asegurarResumenes(lista).catch((err) => console.warn('Resúmenes de dueños', err));
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
		try {
			// setDoc reemplaza el documento: se conservan la bitácora, el resumen del dueño y su acceso, tal como están
			// guardados AHORA (mientras la ficha estaba abierta, otra pantalla pudo rehacer el resumen o cambiar el acceso).
			const ahora = nuevo ? {} : (await getDoc(ref)).data() || {};
			for (const k of ['bitacora', 'portalToken', 'portalVersion', 'proximoPaso', 'portalActualizado', 'portalPrivado', 'acceso']) {
				if (ahora[k] !== undefined) d[k] = data[k] = ahora[k];
				else delete data[k];
			}
			await setDoc(ref, d);
			await vincularCasas(ref.id, d.propertyIds, data.propertyIds);
			data.propertyIds = d.propertyIds;
			// Su resumen (lo que lee en su panel, con sus datos de pago): se arma o se actualiza con cada guardado.
			const conId = { ...d, id: ref.id };
			// Si no se pudo, se dice en pantalla: lo que ve en su panel (sus datos de pago incluidos) quedaría viejo.
			await publicarPortal(conId).catch((err) => { console.warn('Resumen del dueño sin actualizar', err); toast(`La ficha se guardó, pero no se pudo poner al día lo que ve en su panel (datos de pago incluidos): ${errorMessage(err)} Volvé a guardar.`, 'warning'); });
			if (conId.portalToken) Object.assign(data, { portalToken: conId.portalToken, portalVersion: conId.portalVersion, portalPrivado: conId.portalPrivado });
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
		el.replaceChildren(h('div', { class: 'd-flex align-items-stretch gap-2' },
			h('button', { type: 'button', class: `btn btn-light border flex-grow-1 ${FILA_CASA}`, style: 'min-width: 0', title: p ? 'Cambiar por otra propiedad' : '', onclick: () => elegirCasa(item) },
				p ? fichaCasa(p, exclusivaDe(p)) : [h('span', { class: 'icon-search', 'aria-hidden': 'true' }), ' Elegir propiedad…']),
			// Fotos, datos, acuerdo o eliminarla: todo en su ficha, que se abre aquí mismo.
			p ? iconoBtn('icon-pencil', 'Editar la propiedad (datos, fotos, acuerdo)', { class: 'cot-btn cot-btn-icono btn btn-outline-primary', onclick: () => editarPropiedad(item) }) : null));
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
	// Crear o corregir una casa sin salir de aquí: se abre la ficha del inmueble (la misma de Propiedades) en una
	// ventana. La ficha de la persona se guarda antes y después, para que la casa nunca apunte a un dueño sin
	// guardar ni quede fuera de su lista.
	const crearPropiedad = async (operacion, elegir) => {
		if (!(await persistir())) return;
		abrirFicha('nuevo', { titulo: `Nueva propiedad de ${form.state.nombre}`, inicial: { propietarioId: ref.id, operacion }, alGuardar: async (casa) => {
			propiedades.push(casa);
			elegir(casa.id);
			await persistir();
		} });
	};
	const editarPropiedad = async (item) => {
		if (!(await persistir())) return;
		abrirFicha(item.propertyId, {
			alGuardar: async (casa) => {
				propiedades.splice(propiedades.findIndex((p) => p.id === casa.id), 1, casa);
				Object.assign(acuerdos, await loadAcuerdos([casa]));
				form.refresh();
			},
			// La casa ya no existe: sale de la lista de esta persona y la ficha se vuelve a armar.
			alEliminar: async (casaId) => {
				form.state.propiedades = (form.state.propiedades || []).filter((x) => x.propertyId !== casaId);
				// (mount agrega: primero se vacía, o la ficha quedaría dos veces.)
				if (await persistir()) { container.replaceChildren(); await renderEditor(container, ref.id); }
			}
		});
	};
	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar a ${data.nombre}?`, { okText: 'Eliminar' }))) return;
		try {
			// Primero su acceso y su resumen: sin ficha no hay a quién mostrarle nada.
			for (const u of await accesosDe(ref.id)) if (u.activo !== false) await updateDoc(doc(db, 'users', u.uid), { activo: false, updatedAt: serverTimestamp() });
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
		!nuevo ? seccionPortal(Object.assign(data, { id: ref.id }), propiedades, {
			persistir, correo: () => form.state.email, nombre: () => form.state.nombre,
			enfocarCorreo: () => { const c = container.querySelector('[data-campo="email"] input'); c?.scrollIntoView({ block: 'center' }); c?.focus(); }
		}) : null,
		h('div', { class: 'sticky-actions' },
			h('button', { class: 'btn btn-primary', onclick: (e) => guardar(e.currentTarget) }, 'Guardar'),
			h('a', { href: '#/propietarios', class: 'btn btn-light' }, 'Cancelar'),
			!nuevo && session.isAdmin ? h('button', { class: 'btn btn-outline-danger ms-auto', onclick: eliminar }, 'Eliminar') : null));
}

// Quien ya tiene acceso (o es socio de renta por noche) necesita su resumen: lo que lee en su panel, con sus datos
// de pago. Al abrir Propietarios se arma el de quien todavía no lo tiene o lo tiene de una versión anterior (el portal
// de antes, sin datos de pago): una vez; después se actualiza solo.
async function asegurarResumenes(lista) {
	const conAcceso = new Set((await getDocs(query(collection(db, 'users'), where('rol', '==', 'socio'))).catch(() => ({ docs: [] }))).docs.map((d) => d.data().propietarioId));
	for (const p of lista.filter((x) => x.portalVersion !== VERSION_RESUMEN && (x.portalToken || tieneCasasPorNoche(x) || conAcceso.has(x.id)))) {
		try { await publicarPortal(p); } catch (err) { console.warn('Resumen del dueño sin armar', p.id, err); }
	}
}

// ——— Lo que ve el dueño en su panel ———
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nombreTipo = (t) => (TIPOS_BITACORA.find(([k]) => k === t) || TIPOS_BITACORA[5])[1];

function seccionPortal(prop, propiedades, ficha) {
	const ids = [...new Set([...casasDe(prop, propiedades).map((c) => c.id), ...(prop.propiedades || []).map((x) => x.propertyId).filter(Boolean)])];
	const titulo = Object.fromEntries(propiedades.map((p) => [p.id, p.titulo]));
	const misProps = ids.map((id) => [id, titulo[id] || 'Propiedad']);
	const quien = etiquetaDueno(prop.tipo).toLowerCase();
	const acceso = h('div', { class: 'd-grid gap-2', id: 'acceso-panel' });
	const listaBit = h('div', { class: 'list-group list-group-flush border rounded' });
	const listaVis = h('div', { class: 'd-grid gap-2' });

	const ocupado = async (btn, fn) => {
		if (btn) btn.disabled = true;
		try { await fn(); } catch (err) { showError(err); } finally { if (btn) btn.disabled = false; }
	};
	const refrescar = async () => {
		if (prop.portalToken) await publicarPortal(prop);
	};

	// Acceso al panel: estado y botones (solo el administrador da o quita acceso).
	// Mientras las reglas nuevas no estén publicadas, con las de antes un dueño sin casas por noche podría leer su ficha
	// entera y cambiar el precio de su casa en venta: a esa persona todavía no se le abre la entrada.
	const porNoche = tieneCasasPorNoche(prop) || casasDe(prop, propiedades).some((c) => c.operacion === 'vacacional');
	async function pintarAcceso() {
		const [u, nuevas] = await Promise.all([session.isAdmin ? accesoDe(prop.id).catch(() => null) : null, reglasNuevas()]);
		const estado = session.isAdmin ? (u ? { email: u.email, activo: u.activo !== false } : null) : prop.acceso || null;
		const esperaReglas = !nuevas && !porNoche;
		const correoFicha = correoDe(ficha.correo());
		const boton = (icono, texto, fn, cls = 'btn-outline-primary', bloqueado = false) => h('button', { type: 'button', class: `btn btn-sm ${cls}`, disabled: bloqueado, onclick: (e) => ocupado(e.currentTarget, fn) },
			h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }), texto);
		acceso.replaceChildren(
			h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
				estado ? badge(estado.activo ? 'Entra al panel' : 'Acceso quitado', estado.activo ? 'success' : 'secondary') : badge('Sin acceso al panel', 'light'),
				estado ? h('span', { class: 'small' }, h('span', { class: 'icon-envelope-o me-1 text-muted', 'aria-hidden': 'true' }), `Entra con ${estado.email}`) : null,
				...(!session.isAdmin ? [] : !u ? [boton('icon-key', 'Dar acceso', async () => {
					// El correo de ahora (aunque se haya cambiado arriba sin guardar): la ficha se guarda con él antes.
					const correo = correoDe(ficha.correo());
					if (!correo) { ficha.enfocarCorreo(); return toast(`Escribí el correo de ${prop.nombre || `este ${quien}`} arriba: con ese entra al panel.`, 'warning'); }
					if (!(await ficha.persistir())) return;
					const r = await darAcceso(prop, correo, ficha.nombre() || prop.nombre);
					toast(r);
					pintarAcceso();
				}, 'btn-primary', esperaReglas)] : [
					u.activo !== false ? boton('icon-envelope-o', 'Reenviar correo para poner contraseña', async () => { await sendPasswordResetEmail(auth, u.email); toast(`Le enviamos a ${u.email} el correo para poner su contraseña.`); }) : null,
					u.activo !== false
						? boton('icon-ban', 'Quitar acceso', async () => { if (await confirmDialog(`${prop.nombre || 'Esta persona'} ya no podrá entrar al panel.`, { okText: 'Quitar acceso' })) { await ponerAcceso(prop, u, false); toast('Acceso quitado.'); pintarAcceso(); } }, 'btn-outline-danger')
						: boton('icon-check', 'Devolver acceso', async () => { await ponerAcceso(prop, u, true); toast(`Ya puede entrar otra vez con ${u.email}.`); pintarAcceso(); }, 'btn-outline-primary', esperaReglas)
				])),
			session.isAdmin && esperaReglas && !(u && u.activo !== false) ? h('p', { class: 'small text-muted mb-0' }, h('span', { class: 'icon-lock me-1', 'aria-hidden': 'true' }), 'Primero hay que publicar las reglas nuevas de la base (ver el aviso en Propietarios).') : null,
			estado && correoFicha && correoFicha !== correoDe(estado.email)
				? h('div', { class: 'alert alert-warning small mb-0' }, `Los avisos le llegan a ${correoFicha}, pero entra al panel con ${estado.email}. Para cambiar el correo de entrada: quitá el acceso y dalo de nuevo.`) : null,
			session.isAdmin ? null : h('p', { class: 'small text-muted mb-0' }, 'Para darle acceso al panel o quitárselo, pedíselo al administrador.'));
	}

	// Bitácora: privada en el propietario; al portal solo van las entradas visibles.
	const guardarBitacora = async (lista) => {
		await updateDoc(doc(db, 'propietarios', prop.id), { bitacora: lista, updatedAt: serverTimestamp() });
		prop.bitacora = lista;
		pintarBitacora();
		await refrescar();
	};
	function pintarBitacora() {
		const lista = (prop.bitacora || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
		listaBit.replaceChildren(...(lista.length ? lista.map((b) => h('div', { class: 'list-group-item d-flex flex-wrap gap-2 align-items-start' },
			h('div', { class: 'flex-grow-1', style: 'min-width: 12rem' },
				h('div', { class: 'small text-muted' }, `${formatDate(`${b.fecha}T12:00:00`, false)} · ${nombreTipo(b.tipo)}${b.propertyId && misProps.length > 1 ? ` · ${titulo[b.propertyId] || ''}` : ''}`),
				h('div', { style: 'white-space: pre-line' }, b.texto)),
			h('div', { class: 'form-check form-switch mb-0 align-self-center' },
				h('input', { class: 'form-check-input', type: 'checkbox', id: `vis-${b.id}`, checked: Boolean(b.visible), onchange: (e) => ocupado(null, () => guardarBitacora((prop.bitacora || []).map((x) => (x.id === b.id ? { ...x, visible: e.target.checked } : x)))) }),
				h('label', { class: 'form-check-label small', for: `vis-${b.id}` }, `Visible para el ${quien}`)),
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
		ocupado(e.submitter, async () => { await guardarBitacora([...(prop.bitacora || []), entrada]); fTexto.value = ''; toast('Agregado a la bitácora.'); });
	} },
		h('div', { class: 'col-6 col-md-3' }, h('label', { class: 'form-label small', for: 'bit-fecha' }, 'Fecha'), fFecha),
		h('div', { class: 'col-6 col-md-3' }, h('label', { class: 'form-label small', for: 'bit-tipo' }, 'Tipo'), fTipo),
		fProp ? h('div', { class: 'col-12 col-md-6' }, h('label', { class: 'form-label small', for: 'bit-prop' }, 'Propiedad'), fProp) : null,
		h('div', { class: 'col-12' }, h('label', { class: 'form-label small', for: 'bit-texto' }, 'Qué pasó'), fTexto,
			h('div', { class: 'form-text' }, 'No escribas nombres ni teléfonos de clientes.')),
		h('div', { class: 'col-12 d-flex flex-wrap gap-3 align-items-center justify-content-between' },
			h('div', { class: 'form-check mb-0' }, fVisible, h('label', { class: 'form-check-label', for: 'bit-visible' }, `Visible para el ${quien}`)),
			h('button', { class: 'btn btn-primary', type: 'submit' }, 'Agregar a la bitácora')));

	// Próximo paso.
	const fPaso = h('input', { class: 'form-control', id: 'portal-paso', maxlength: 400, value: prop.proximoPaso || '', placeholder: 'Ej.: Open house el sábado 10 a las 10:00' });
	const formPaso = h('form', { class: 'd-flex flex-wrap gap-2 align-items-end', onsubmit: (e) => {
		e.preventDefault();
		ocupado(e.submitter, async () => {
			prop.proximoPaso = fPaso.value.trim();
			await updateDoc(doc(db, 'propietarios', prop.id), { proximoPaso: prop.proximoPaso, updatedAt: serverTimestamp() });
			await refrescar();
			toast('Próximo paso guardado.');
		});
	} }, h('div', { class: 'flex-grow-1', style: 'min-width: 14rem' }, h('label', { class: 'form-label small', for: 'portal-paso' }, `Próximo paso (lo ve el ${quien})`), fPaso),
	h('button', { class: 'btn btn-outline-primary', type: 'submit' }, 'Guardar paso'));

	// Comentarios de visitas (de la agenda): texto aparte, sin datos del cliente.
	async function pintarVisitas() {
		listaVis.replaceChildren(h('div', { class: 'small text-muted' }, 'Cargando visitas…'));
		try {
			const vis = (await visitasDe(ids)).sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)).slice(0, 20);
			if (!vis.length) { listaVis.replaceChildren(h('div', { class: 'small text-muted' }, 'No hay visitas en la agenda para estas propiedades. Las visitas se registran desde la ficha del cliente (tipo «Visita»).')); return; }
			listaVis.replaceChildren(...vis.map((a) => {
				const txt = h('textarea', { class: 'form-control form-control-sm', rows: 2, maxlength: 600, id: `vc-${a.id}`, placeholder: 'Ej.: Les gustó la cocina; preguntaron por el parqueo de visitas.' }, a.comentarioPropietario || '');
				const chk = h('input', { class: 'form-check-input', type: 'checkbox', id: `vv-${a.id}`, checked: Boolean(a.visiblePropietario) });
				return h('form', { class: 'border rounded p-2', onsubmit: (e) => {
					e.preventDefault();
					ocupado(e.submitter, async () => {
						await updateDoc(doc(db, 'actividades', a.id), { comentarioPropietario: txt.value.trim(), visiblePropietario: chk.checked });
						await refrescar();
						toast('Comentario guardado.');
					});
				} },
				h('div', { class: 'small text-muted mb-1' }, `${formatDate(a.fecha)} · ${titulo[a.pid] || ''}${a.hecha ? ' · hecha' : ''}`),
				h('label', { class: 'visually-hidden', for: `vc-${a.id}` }, `Comentario para el ${quien}`), txt,
				h('div', { class: 'd-flex flex-wrap gap-2 align-items-center justify-content-between mt-2' },
					h('div', { class: 'form-check mb-0' }, chk, h('label', { class: 'form-check-label small', for: `vv-${a.id}` }, `Visible para el ${quien}`)),
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
				: [h('div', { class: 'list-group-item text-muted small' }, `El ${quien} todavía no ha respondido sobre el anuncio.`)]));
		}, (err) => { listaCom.replaceChildren(h('div', { class: 'list-group-item small text-danger' }, `No se pudieron cargar los comentarios (${err?.code || err?.message || 'error'}).`)); console.error(err); });
	}

	pintarAcceso();
	pintarBitacora();
	pintarVisitas();
	pintarComentarios();
	return h('div', { class: 'card mt-4', id: 'portal-propietario' },
		h('div', { class: 'card-header bg-white' }, h('h2', { class: 'h5 mb-0' }, 'Su panel')),
		h('div', { class: 'card-body d-grid gap-4' },
			h('div', { class: 'd-grid gap-2' },
				h('p', { class: 'text-muted small mb-0' }, `Con su correo y su contraseña, el ${quien} entra al panel a «Mis propiedades». De cada casa en venta o renta ve el estado, los días en el mercado, las consultas, visitas y ofertas, cómo se anuncia (y lo aprueba o pide cambios), el historial de precio, lo que marques como visible y los clientes interesados como «Cliente 1, 2…» (nunca nombres, teléfonos ni correos). Sus casas por noche las atiende ahí mismo. Se actualiza solo cuando cambias la propiedad, una visita o la etapa de un cliente.`),
				acceso),
			formPaso,
			h('div', {}, h('h3', { class: 'h6' }, 'Respuesta al anuncio'), h('p', { class: 'small text-muted' }, 'Si aprobó cómo se anuncia o los cambios que pidió desde su panel. Lo más nuevo arriba.'), listaCom),
			h('div', {}, h('h3', { class: 'h6' }, 'Bitácora del asesor'), formBit, listaBit),
			h('div', {}, h('h3', { class: 'h6' }, 'Comentarios de visitas'), h('p', { class: 'small text-muted' }, 'Escribí un comentario para el dueño y marcalo como visible. No escribas el nombre del cliente.'), listaVis)));
}

export async function render(container, [id]) {
	if (id && id !== 'incompletos') return renderEditor(container, id);
	return renderLista(container);
}
