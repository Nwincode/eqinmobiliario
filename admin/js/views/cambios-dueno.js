// «Cambios de un dueño» (administrador y asesor): lo que un dueño cambió él solo de su casa por noche, ya publicado
// (netlify/functions/mi-casa.mjs). Cada cambio con lo de antes y lo de ahora; se deshace uno o todos (vuelve lo de
// antes donde sigue lo del dueño), se abre la ficha para corregir o se marca «Listo». Llega desde la campana.
// También la casa nueva que subió un socio (netlify/functions/mi-casa-nueva.mjs, `nueva`): ya publicada; se abre la
// ficha para corregirla, se elimina o se marca «Listo» (no hay «lo de antes» que deshacer).
// Al marcar «Listo» (o deshacer) con textos cambiados, el inglés se rehace con el traductor del panel.
// Y los pedidos del dueño de una casa en venta o renta (admin/js/pedido-dueno.js, comentariosPropietarios): «Pedir un
// cambio» (texto y fotos: «Listo» cuando ya se hizo) y «Ya se vendió» / «Ya se rentó» («Aplicar»: la casa pasa a vendida o
// rentada y su fecha y precio final quedan en privado/cierre, admin/js/cierre-casa.js). Los atiende el administrador o el
// asesor del dueño (las reglas solo le dejan leer los de sus dueños); cada tarjeta lleva la ficha, WhatsApp al dueño,
// «Descartar» y su acción principal. Los de la casa por noche (el servidor) solo los ve el administrador.
import { db, doc, getDoc, writeBatch, serverTimestamp, storage, ref, getDownloadURL } from '../firebase.js';
import { h, toast, showError, errorMessage, fallaDelServidor, pageHeader, emptyState, mount, iconoBtn, formatDate, spinner, confirmDialog, nombreYDatos, badge, formatPrice } from '../ui.js';
import { session, markPending } from '../session.js';
import { operacionDe, estadoDe } from '../estados.js';
import { textoValor } from '../mi-casa.js';
import { avisarAvisos, pedidosDeDuenos, atenderPedido } from '../avisos.js';
import { dinero, fechaCorta, whatsappUrl } from '../formato.js';
import { estadoDeCierre, estaCerrada, cierreDePedido } from '../cierre-casa.js';
import { claveListo } from '../avisos-reglas.js';

const ic = (clase) => h('span', { class: `${clase} me-1`, 'aria-hidden': 'true' });

async function api(metodo, cuerpo) {
	const res = await fetch('/api/mi-casa', {
		method: metodo, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` },
		...(cuerpo ? { body: JSON.stringify(cuerpo) } : {})
	});
	const datos = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(datos.error || fallaDelServidor(res.status));
	return datos;
}

// El inglés de la casa al día (si un texto cambió y el inglés no se corrigió a mano). Si lo escribió, el sitio queda por
// publicar (como «Traducir al inglés» de la ficha): sin eso, la página en inglés no se rehacía.
async function inglesAlDia(propertyId) {
	const { faltaIngles, traducirEn, guardarCambios } = await import('./properties.js');
	const s = await getDoc(doc(db, 'properties', propertyId));
	if (!s.exists() || !faltaIngles(s.data())) return;
	await guardarCambios(propertyId, { en: await traducirEn(s.data()) });
	await markPending(`Traducción al inglés: ${s.data().titulo || propertyId}`);
}

// Fotos: las nuevas en miniatura y cuántas se quitaron.
function fotos(antes = [], ahora = []) {
	const tenia = new Set(antes.map((f) => f.path)), queda = new Set(ahora.map((f) => f.path));
	const nuevas = ahora.filter((f) => !tenia.has(f.path));
	const quitadas = antes.filter((f) => !queda.has(f.path)).length;
	const orden = !nuevas.length && !quitadas;
	return h('span', { class: 'd-flex align-items-center gap-1 flex-wrap' },
		nuevas.slice(0, 6).map((f) => h('img', { src: f.url, alt: '', width: 32, height: 32, class: 'rounded', style: 'object-fit: cover' })),
		[nuevas.length ? `${nuevas.length} ${nuevas.length === 1 ? 'nueva' : 'nuevas'}` : '', quitadas ? `${quitadas} ${quitadas === 1 ? 'quitada' : 'quitadas'}` : '', orden ? 'cambió el orden' : ''].filter(Boolean).join(' · '));
}

// Lo de antes tachado y lo de ahora: en una línea si los dos son cortos (4 → 6), si no, uno debajo del otro.
const antesAhora = (antes, ahora) => (antes.length + ahora.length <= 40
	? h('div', { class: 'small' }, h('span', { class: 'text-muted text-decoration-line-through' }, antes), ' → ', ahora)
	: [h('div', { class: 'small text-muted text-decoration-line-through text-truncate' }, antes), h('div', { class: 'small text-truncate' }, ahora)]);

// Lo que hace cada botón de la tarjeta: la acción, el aviso, la campana al día y la lista otra vez.
const accionDe = (alCambiar) => async (btn, trabajo, ok) => {
	btn.disabled = true;
	try {
		if ((await trabajo()) === false) { btn.disabled = false; return; }
		toast(ok);
		avisarAvisos();
		alCambiar();
	} catch (err) { showError(err); btn.disabled = false; }
};
const listo = (c) => async () => {
	if (c.ingles) await inglesAlDia(c.propertyId);
	await api('POST', { accion: 'listo', id: c.id });
};

// La casa nueva de un socio: ya publicada. Sus fotos, abrir la ficha, eliminarla o «Listo» (con el inglés hecho).
function tarjetaNueva(c, alCambiar) {
	const accion = accionDe(alCambiar);
	const eliminar = async () => {
		if (!(await confirmDialog(`¿Eliminar «${c.titulo || 'la casa'}»? Sale de la página y se borran sus fotos. No se puede deshacer.`, { okText: 'Eliminar' }))) return false;
		const { eliminarPropiedad } = await import('./properties.js');
		const s = await getDoc(doc(db, 'properties', c.propertyId));
		if (s.exists()) await eliminarPropiedad({ id: s.id, ...s.data() });
		await markPending(`Propiedad eliminada: ${c.titulo || c.propertyId}`);
		await api('POST', { accion: 'listo', id: c.id });
	};
	const fotos = c.fotos || [];
	return h('div', { class: 'card mb-2' },
		h('div', { class: 'card-header' },
			h('div', { class: 'fw-semibold' }, `${c.nombre || 'El dueño'} subió «${c.titulo || 'su casa'}»`),
			h('div', { class: 'small text-success' }, [operacionDe(c), c.cuando ? formatDate(new Date(c.cuando)) : '', 'ya está publicada'].filter(Boolean).join(' · '))),
		fotos.length ? h('div', { class: 'card-body d-flex gap-1 flex-wrap' }, fotos.map((f) => h('img', { src: f.url, alt: '', width: 56, height: 56, class: 'rounded', style: 'object-fit: cover' }))) : null,
		h('div', { class: 'card-footer d-flex align-items-center gap-2' },
			iconoBtn('icon-pencil', 'Abrir la ficha', { href: `#/propiedades/${encodeURIComponent(c.propertyId)}` }),
			iconoBtn('icon-trash-o', 'Eliminar la casa', { class: 'btn-toque btn-icono btn btn-sm btn-outline-danger', onclick: (e) => accion(e.currentTarget, eliminar, 'Casa eliminada; sale de la página al publicarse.') }),
			h('span', { class: 'flex-grow-1' }),
			// Con «Listo», el resumen del socio (su panel) la trae con su asesor.
			h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => accion(e.currentTarget, async () => {
				await listo(c)();
				(await import('../portal.js')).refrescarPortalesDe([c.propertyId]);
			}, 'Listo: la casa se queda publicada.') }, 'Listo')));
}

function tarjeta(c, alCambiar) {
	if (c.nueva) return tarjetaNueva(c, alCambiar);
	const deshechos = new Set(c.deshechos || []);
	const accion = accionDe(alCambiar);
	const deshacer = (campos) => async () => {
		const r = await api('POST', { accion: 'deshacer', id: c.id, campos });
		if (r.saltados?.length) toast(`No se deshizo ${r.saltados.join(', ')}: alguien lo cambió después.`, 'warning');
		if (c.ingles) await inglesAlDia(c.propertyId).catch((err) => console.warn('Inglés', err));
	};
	const fila = (x) => h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
		h('div', { class: 'flex-grow-1', style: 'min-width: 0' },
			h('div', { class: 'fw-semibold' }, x.etiqueta),
			x.campo === 'fotos' ? fotos(x.antes, x.ahora) : antesAhora(textoValor(x.campo, x.antes), textoValor(x.campo, x.ahora))),
		deshechos.has(x.campo) ? h('span', { class: 'small text-muted' }, 'Deshecho')
			: iconoBtn('icon-undo', `Deshacer: ${x.etiqueta}`, { onclick: (e) => accion(e.currentTarget, deshacer([x.campo]), 'Deshecho y publicado en unos minutos.') }));
	return h('div', { class: 'card mb-2' },
		h('div', { class: 'card-header' },
			h('div', { class: 'fw-semibold' }, `${c.nombre || 'El dueño'} cambió «${c.titulo || 'su casa'}»`),
			h('div', { class: 'small text-success' }, `${c.cuando ? formatDate(new Date(c.cuando)) : ''} · ya está publicado`)),
		h('ul', { class: 'list-group list-group-flush' }, (c.cambios || []).map(fila)),
		h('div', { class: 'card-footer d-flex align-items-center gap-2' },
			iconoBtn('icon-undo', 'Deshacer todo', { onclick: (e) => accion(e.currentTarget, deshacer(null), 'Todo deshecho; se publica en unos minutos.') }),
			iconoBtn('icon-pencil', 'Abrir la ficha', { href: `#/propiedades/${encodeURIComponent(c.propertyId)}` }),
			h('span', { class: 'flex-grow-1' }),
			h('button', { type: 'button', class: 'btn btn-primary btn-toque', onclick: (e) => accion(e.currentTarget, listo(c), 'Listo: el cambio se queda.') }, ic('icon-check'), 'Listo')));
}

// «Aplicar» un cierre: en un solo lote, la casa pasa a vendida o rentada (con su fecha e historial de estado, la misma
// pieza que el cambio de estado de Propiedades), su cierre queda en privado/cierre y el pedido, atendido. Si la casa ya
// estaba cerrada, no se toca: solo se guarda el cierre (si no tenía) y se atiende. El estado, la moneda y la operación
// salen de la casa, nunca del pedido.
async function aplicarCierre(c) {
	const refCasa = doc(db, 'properties', c.propiedadId);
	const s = await getDoc(refCasa);
	if (!s.exists()) throw new Error('La casa ya no existe.');
	const casa = { id: s.id, ...s.data() };
	if (casa.operacion === 'vacacional') throw new Error('Esta casa es por noche: no se vende ni se renta desde aquí.');
	const refCierre = doc(db, 'properties', casa.id, 'privado', 'cierre');
	const yaCerrada = estaCerrada(casa);
	const tenia = yaCerrada && (await getDoc(refCierre).catch(() => null))?.exists();
	const lote = writeBatch(db);
	if (!tenia) lote.set(refCierre, { ...cierreDePedido(c, casa), por: session.user.uid, updatedAt: serverTimestamp() });
	if (!yaCerrada) {
		const { cambioDeEstado } = await import('./properties.js');
		lote.update(refCasa, { ...cambioDeEstado(estadoDeCierre(casa.operacion)), updatedAt: serverTimestamp(), updatedBy: session.user.uid });
	}
	lote.set(doc(db, 'avisosAtendidos', claveListo({ tipo: 'cambios', objeto: c.id })), { tipo: 'cambios', objeto: c.id, agentId: c.agentId || '', por: session.user.uid, fecha: serverTimestamp() });
	await lote.commit();
	if (!yaCerrada) {
		(await import('../portal.js')).refrescarPortalesDe([casa.id]);
		await markPending(`Estado de ${casa.titulo || casa.id}: ${estadoDe({ estado: estadoDeCierre(casa.operacion) }).label}`);
	}
}

// Las fotos de un pedido, por su ruta en nuestro almacenamiento (las reglas solo dejan rutas de la carpeta del pedido).
async function fotosDelPedido(paths = []) {
	if (!storage) return [];
	return (await Promise.all(paths.slice(0, 6).map((p) => getDownloadURL(ref(storage, p)).catch(() => '')))).filter(Boolean);
}

// Un pedido del dueño de una casa en venta o renta, con la misma forma que las demás tarjetas: encabezado, lo que pide y
// el pie (ficha, WhatsApp al dueño, Descartar y la acción principal con su ícono).
function tarjetaPedido(c, { casa, dueno, fotos }, alCambiar) {
	const accion = accionDe(alCambiar);
	const cierre = c.tipo === 'cierre';
	const renta = casa?.operacion === 'renta';
	const nombre = dueno?.nombre || 'El dueño';
	const titulo = casa?.titulo || 'su casa';
	const tachado = (a) => h('span', { class: 'text-muted text-decoration-line-through' }, a);
	const fila = (et, ...v) => h('li', { class: 'list-group-item small' }, h('span', { class: 'fw-semibold me-2' }, et), ...v);
	const cuerpo = cierre
		? h('ul', { class: 'list-group list-group-flush' },
			fila('Estado', tachado(estadoDe(casa || {}).label), ` → ${renta ? 'Rentada' : 'Vendida'} el ${fechaCorta(c.fechaCierre)}`),
			Number(c.precioFinal) > 0 ? fila(renta ? 'Renta final' : 'Precio final', casa?.precio ? tachado(formatPrice(casa.precio, casa.moneda, casa.operacion)) : null,
				` → ${dinero(Number(c.precioFinal), casa?.moneda || 'USD')}`) : null)
		: h('div', { class: 'card-body' }, h('p', { class: 'mb-0', style: 'white-space: pre-line' }, c.texto),
			fotos.length ? h('div', { class: 'd-flex gap-1 flex-wrap mt-2' }, fotos.map((u, i) => h('a', { href: u, target: '_blank', rel: 'noopener', 'aria-label': `Ver la foto ${i + 1}` },
				h('img', { src: u, alt: '', width: 56, height: 56, class: 'rounded', style: 'object-fit: cover' })))) : null);
	const descartar = async () => {
		if (!(await confirmDialog(cierre ? `¿Descartar el aviso? «${titulo}» sigue como está.` : '¿Descartar el pedido? No se cambia nada.', { okText: 'Descartar' }))) return false;
		await atenderPedido(c);
	};
	return h('div', { class: 'card mb-2' },
		h('div', { class: 'card-header' }, nombreYDatos(cierre ? `${nombre}: «${titulo}» ${renta ? 'ya se rentó' : 'ya se vendió'}` : `${nombre} pidió un cambio en «${titulo}»`,
			c.fecha ? formatDate(new Date(c.fecha)) : '', [badge('Por revisar', 'warning')])),
		cuerpo,
		h('div', { class: 'card-footer d-flex align-items-center gap-2' },
			iconoBtn('icon-pencil', 'Abrir la ficha', { href: `#/propiedades/${encodeURIComponent(c.propiedadId)}` }),
			dueno?.telefono ? iconoBtn('icon-whatsapp', `Escribirle a ${nombre}`, { href: whatsappUrl(dueno.telefono, `Hola ${nombre.split(' ')[0]}, te escribo por «${titulo}».`), target: '_blank', rel: 'noopener' }) : null,
			iconoBtn('icon-times', 'Descartar', { class: 'btn-toque btn-icono btn btn-sm btn-outline-danger', onclick: (e) => accion(e.currentTarget, descartar, 'Descartado.') }),
			h('span', { class: 'flex-grow-1' }),
			h('button', { type: 'button', class: 'btn btn-primary btn-toque', onclick: (e) => accion(e.currentTarget, cierre ? () => aplicarCierre(c) : () => atenderPedido(c),
				cierre ? `Listo: «${titulo}» quedó ${renta ? 'rentada' : 'vendida'}.` : 'Listo: el pedido quedó atendido.') }, ic('icon-check'), cierre ? 'Aplicar' : 'Listo')));
}

// Los pedidos con su casa, su dueño y sus fotos (lo que el panel de esta persona puede leer).
async function pedidosConDatos() {
	const { loadPropiedades, loadPropietarios } = await import('../crm.js');
	const [pedidos, casas, duenos] = await Promise.all([pedidosDeDuenos(), loadPropiedades(), loadPropietarios()]);
	return Promise.all(pedidos.map(async (c) => ({ c, datos: {
		casa: casas.find((x) => x.id === c.propiedadId), dueno: duenos.find((x) => x.id === c.propietarioId), fotos: await fotosDelPedido(c.fotos || []) } })));
}

export async function render(container, [id] = []) {
	mount(container, spinner());
	const pintar = async () => {
		try {
			// Lo del servidor (casas por noche: solo el administrador) y los pedidos de los dueños, en una lista, lo más nuevo arriba.
			const [{ cambios }, pedidos] = await Promise.all([session.isAdmin ? api('GET') : { cambios: [] }, pedidosConDatos()]);
			const todos = [...cambios.map((c) => ({ id: c.id, cuando: c.cuando || 0, pintar: () => tarjeta(c, pintar) })),
				...pedidos.map(({ c, datos }) => ({ id: c.id, cuando: c.fecha || 0, pintar: () => tarjetaPedido(c, datos, pintar) }))];
			const lista = (id ? todos.filter((c) => c.id === id) : todos).sort((a, b) => b.cuando - a.cuando);
			container.replaceChildren();
			mount(container, pageHeader('Cambios de los dueños'),
				lista.length ? lista.map((c) => c.pintar())
					: emptyState(id ? 'Este cambio ya se atendió.' : 'No hay cambios de los dueños por revisar.', id ? h('a', { class: 'btn btn-primary', href: '#/cambios-dueno' }, ic('icon-list'), 'Ver los demás') : null));
		} catch (err) {
			container.replaceChildren();
			mount(container, pageHeader('Cambios de los dueños'), emptyState(`No se pudieron leer: ${errorMessage(err)}`));
		}
	};
	await pintar();
}
