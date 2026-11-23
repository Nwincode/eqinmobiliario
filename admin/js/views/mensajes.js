// Mensajes: las conversaciones de las reservas por noche (#/mensajes y #/mensajes/{código}). La ven quienes ven
// Solicitudes (el socio con casas por noche, sus chats; el administrador, todos): la misma lectura, los mismos cálculos
// y las mismas acciones (admin/js/solicitudes-base.js). El hilo es la pieza compartida con la página del cliente
// (admin/js/hilo.js, css/hilo.css).
// Celular: la lista y, al tocar una, el hilo a pantalla completa con su flecha para volver. Computadora (≥ 992 px): la
// lista y el hilo lado a lado; con espacio (≥ 1280 px), además la ficha de la reserva a la derecha.
// Lo que se escribe pasa el mismo filtro de contacto que el del cliente y las reglas (V.tipoDeContacto), mientras se
// escribe. Las notas internas (chats/{token}/notas) no las lee el cliente: las reglas no se las dejan leer con su enlace.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from '../firebase.js';
import { h, ahoraYa, showError } from '../ui.js';
import { avisarChat } from '../reservas.js';
import { comprobanteVigente, llegadaPasada } from '../reservas-calculo.js';
import { cargarSolicitudes, estado, rapidasDe } from '../solicitudes-base.js';
import { armarHilo, pintarHilo, citaDe, resumenDe, tarjetaComprobante, eventoPanel, TEXTOS_PANEL, enMs } from '../hilo.js';
import { dinero, rangoDias, diaConSemana, diaLargo, cuandoCorto, horaChat, diaDeChat, nNoches } from '../formato.js';
import { PARECE } from '../mi-casa.js';
import { avisarAvisos } from '../avisos.js';
import { estadoIA, sugerirRespuesta } from '../ia.js';

const V = window.EQVacacional;
const t = TEXTOS_PANEL;
// La foto de la casa que guardó la solicitud (la de su ficha): https o del mismo sitio.
const fotoValida = (u) => /^(https:\/\/|\/[^/])/.test(u || '');
const PRIMERO = (n) => String(n || '').trim().split(/\s+/)[0] || '';
// Lo que se queda entre una pantalla y otra (el router vuelve a pintar en cada cambio de dirección): los datos leídos,
// el filtro, la búsqueda y dónde iba la lista. Así elegir una conversación no relee todo ni pierde la lista.
const memo = { S: null, leido: 0, filtro: '', busca: '', abierta: false, scroll: 0, apagar: () => {}, borradores: {}, rapidasTodas: false };
// ¿Las reglas publicadas ya conocen citar y las notas? (reglas/r7 solo lo dejan leer las nuevas).
let reglasR7 = null;
const reglasNuevas = () => (reglasR7 ||= getDoc(doc(db, 'reglas', 'r7')).then(() => true, () => { reglasR7 = null; return false; }));

// Una conversación de la lista: la solicitud (l), su chat y su último mensaje.
function filaDe(S, l) {
	const cod = l.reserva.codigo;
	const chat = S.datosChat[cod] || {};
	const ultimo = S.ultimos[cod] || null;
	const yo = S.admin ? 'equipo' : 'socio';
	const visto = enMs(chat[S.admin ? 'vistoEquipo' : 'vistoSocio']);
	// Sin responder: lo último lo escribió el cliente, en una reserva abierta que no terminó hace más de 7 días (lo mismo
	// que cuenta la campana y el número del menú: admin/js/avisos.js sinResponder).
	const abierta = !['no', 'cancelada'].includes(chat.estado || '') && String(chat.salida || '') >= V.sumarDias(V.hoy(), -7);
	const sinResponder = abierta && S.porResponder.has(cod);
	// El plazo para responder, o «Subió comprobante».
	const p = estado(l) === 'pendiente' && !chat.estado ? S.plazoDe(l) : null;
	const queda = p?.vence ? p.vence - ahoraYa() : Infinity;
	return { l, cod, chat, ultimo, yo, sinResponder, nuevo: ultimo?.de === 'cliente' && enMs(ultimo.createdAt) > visto, queda,
		cuando: enMs(ultimo?.createdAt) || enMs(chat.createdAt), comprobante: chat.estado === 'confirmada' && comprobanteVigente(chat) };
}
const textoQueda = (q) => (q <= 0 ? 'Venció' : q < 3600000 ? `Responde en ${Math.max(1, Math.round(q / 60000))} min` : `Responde en ${Math.round(q / 3600000)} h`);

export async function render(container, [codigo = ''] = []) {
	memo.apagar();
	const fresco = memo.S && Date.now() - memo.leido < 60_000;
	if (!fresco) { memo.S = await cargarSolicitudes({ mensajes: 'ultimo', recargar: recargarDatos }); memo.leido = Date.now(); }
	const S = memo.S;
	const conR7 = await reglasNuevas();
	const filas = S.leads.filter((l) => S.chats[l.reserva.codigo]).map((l) => filaDe(S, l));
	const fila = filas.find((f) => f.cod === codigo) || null;
	if (!memo.filtro) memo.filtro = filas.some((f) => f.sinResponder) ? 'sin' : 'todas';
	const raiz = h('div', { class: `msj hilo-app${fila ? ' msj-en-hilo' : ''}` });
	raiz.append(lista(S, filas, fila), ...(fila ? hiloDe(S, fila, conR7) : [h('section', { class: 'msj-hilo msj-hilo-vacio' }, h('p', { class: 'hilo-vacio' }, filas.length ? 'Elige una conversación.' : 'Todavía no hay conversaciones.'))]));
	container.append(raiz);
	// La lista vuelve a donde iba.
	requestAnimationFrame(() => { const l = raiz.querySelector('.msj-filas'); if (l) l.scrollTop = memo.scroll; });
}

// Después de confirmar, «No se dio», pago…: se vuelve a leer y se repinta la pantalla de ahora.
async function recargarDatos() {
	memo.leido = 0;
	window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function lista(S, filas, actual) {
	const sin = filas.filter((f) => f.sinResponder);
	const hoyIso = V.hoy();
	const caja = h('section', { class: 'msj-lista', 'aria-label': 'Conversaciones' });
	const filasEl = h('div', { class: 'msj-filas', onscroll: (e) => { memo.scroll = e.target.scrollTop; } });
	const pintar = () => {
		const q = memo.busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
		const coincide = (f) => !q || `${f.l.nombre} ${f.l.propertyTitulo} ${f.cod}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q);
		let ver = filas.filter(coincide);
		if (memo.filtro === 'sin') ver = ver.filter((f) => f.sinResponder);
		if (memo.filtro === 'llegar') ver = ver.filter((f) => ['confirmada', 'pagada'].includes(f.chat.estado) && f.l.reserva.salida >= hoyIso).sort((a, b) => a.l.reserva.llegada.localeCompare(b.l.reserva.llegada));
		// Sin responder primero (la que vence antes arriba); después lo más reciente.
		else ver.sort((a, b) => (b.sinResponder - a.sinResponder) || (a.sinResponder && b.sinResponder ? a.queda - b.queda : 0) || b.cuando - a.cuando);
		filasEl.replaceChildren(...(ver.length ? ver.map((f) => filaEl(S, f, f === actual)) : [h('p', { class: 'hilo-vacio msj-nada' }, q ? 'Nada coincide con esa búsqueda.' : memo.filtro === 'sin' ? 'Nada sin responder.' : 'Nada por aquí.')]));
	};
	const chip = (k, texto) => h('button', { type: 'button', class: `msj-chip${memo.filtro === k ? ' msj-chip-on' : ''}`, 'aria-pressed': String(memo.filtro === k), onclick: (e) => { memo.filtro = k; chips.querySelectorAll('.msj-chip').forEach((c) => { const on = c === e.currentTarget; c.classList.toggle('msj-chip-on', on); c.setAttribute('aria-pressed', String(on)); }); pintar(); } }, texto);
	const chips = h('div', { class: 'msj-chips' }, chip('sin', `Sin responder · ${sin.length}`), chip('todas', 'Todas'), chip('llegar', 'Por llegar'));
	// Buscar: el campo toma el lugar de los filtros (la fila no crece).
	const campo = h('input', { type: 'search', class: 'msj-buscar', placeholder: 'Cliente, casa o código', 'aria-label': 'Buscar por cliente, casa o código', value: memo.busca,
		oninput: (e) => { memo.busca = e.target.value; pintar(); } });
	const lupa = h('button', { type: 'button', class: 'hilo-ib', 'aria-label': 'Buscar', title: 'Buscar', onclick: () => {
		const abrir = !barra.classList.contains('msj-buscando');
		barra.classList.toggle('msj-buscando', abrir);
		lupa.firstChild.className = abrir ? 'icon-times' : 'icon-search';
		lupa.setAttribute('aria-label', abrir ? 'Cerrar la búsqueda' : 'Buscar');
		if (abrir) campo.focus(); else { memo.busca = ''; campo.value = ''; pintar(); }
	} }, h('span', { class: memo.busca ? 'icon-times' : 'icon-search', 'aria-hidden': 'true' }));
	const barra = h('div', { class: `msj-filtros${memo.busca ? ' msj-buscando' : ''}` }, chips, campo, lupa);
	caja.append(h('div', { class: 'msj-titulo' }, h('h1', {}, 'Mensajes')), barra, filasEl);
	pintar();
	return caja;
}

function filaEl(S, f, elegida) {
	const { l, chat, ultimo } = f;
	const nombre = S.admin ? l.nombre : PRIMERO(l.nombre);
	const mio = ultimo && ultimo.de !== 'cliente';
	const ult = !ultimo ? '' : ultimo.tipo === 'foto' ? [h('span', { class: 'icon-camera', 'aria-hidden': 'true' }), ` ${t.comprobante}`]
		: `${mio && !ultimo.tipo ? 'Tú: ' : ''}${resumenDe(ultimo, t)}`;
	const plazo = f.comprobante ? h('span', { class: 'hilo-plazo hilo-plazo-ok' }, 'Subió comprobante')
		: f.sinResponder && Number.isFinite(f.queda) ? h('span', { class: 'hilo-plazo' }, textoQueda(f.queda)) : null;
	return h('a', { class: `msj-fila${f.nuevo || f.sinResponder ? ' msj-nuevo' : ''}${elegida ? ' msj-sel' : ''}`, href: `#/mensajes/${encodeURIComponent(f.cod)}`, 'aria-current': elegida ? 'true' : null },
		fotoValida(chat.foto) ? h('img', { class: 'msj-foto', src: chat.foto, alt: '', loading: 'lazy', width: 52, height: 52 }) : h('span', { class: 'msj-foto icon-home2', 'aria-hidden': 'true' }),
		h('span', { class: 'msj-t' },
			h('span', { class: 'msj-l1' }, h('span', { class: 'msj-nom' }, nombre), h('span', { class: 'msj-hora' }, f.cuando ? cuandoCorto(f.cuando, ahoraYa()) : '')),
			h('span', { class: 'msj-l2' }, `${l.propertyTitulo || ''} · ${rangoDias(l.reserva.llegada, l.reserva.salida)}`),
			h('span', { class: 'msj-l3' }, h('span', { class: 'msj-ult' }, ult), plazo, f.nuevo ? h('span', { class: 'msj-punto', title: 'Sin leer' }, h('span', { class: 'visually-hidden' }, 'Sin leer')) : null)));
}

// ------------------------------------------------------------ El hilo de una conversación
function hiloDe(S, f, conR7) {
	const { l, cod } = f;
	const token = S.chats[cod];
	const yo = f.yo;
	let chat = { ...S.datosChat[cod] };
	const caja = h('section', { class: 'msj-hilo', 'aria-label': `Conversación con ${PRIMERO(l.nombre)}` });
	const lineas = h('div', { class: 'hilo', role: 'log', 'aria-live': 'polite' });
	let mensajes = [], notas = [], citando = null, enNota = false, alFondo = false;
	const fallidos = new Map();
	const rv = () => { const r = S.revisiones[l.id]; return r && r.mensaje === chat.comprobanteMensaje ? r : null; };
	const dueno = S.admin ? S.propietarios.find((p) => p.id === chat.propietarioId) : null;
	const etiqueta = (m) => (m.de === 'cliente' || m.de === yo ? '' : m.de === 'socio' ? `Socio${dueno?.nombre ? ` · ${PRIMERO(dueno.nombre)}` : ''}` : 'Equipo');
	const nombreDe = (de) => (de === 'cliente' ? PRIMERO(l.nombre) || 'Cliente' : de === yo ? 'Tú' : de === 'socio' ? 'Socio' : 'Equipo');
	const tarjeta = (m) => (m.tipo === 'foto' ? tarjetaComprobante(m, t, rv(), rv()?.cuadra ? dinero(chat.total, chat.moneda) : '') : m.tipo === 'pago' || m.tipo === 'llegada' ? 'omitir' : null);
	const repintar = () => {
		const items = [...mensajes, ...notas.map((n) => ({ ...n, nota: true })), ...fallidos.values()];
		const nodos = armarHilo(items, { yo, t, ahora: ahoraYa(), chat, vistoOtros: enMs(chat.vistoCliente), etiqueta, nombreDe, tarjeta,
			textoEvento: (ev) => eventoPanel(ev, yo, PRIMERO(l.nombre)), alResponder: conR7 ? citar : null, alReintentar: reintentar });
		pintarHilo(lineas, nodos.length ? nodos : [h('p', { class: 'hilo-vacio' }, 'Todavía no hay mensajes.')], alFondo);
		alFondo = false;
	};

	// Escribir
	const campo = h('textarea', { class: 'hilo-campo', rows: 1, maxlength: 1000, placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje' });
	campo.value = memo.borradores[cod] || '';
	const enviar = h('button', { type: 'submit', class: 'hilo-ib hilo-ib-pri', 'aria-label': 'Enviar', title: 'Enviar' }, h('span', { class: 'icon-paper-plane', 'aria-hidden': 'true' }));
	const REGLA = 'Aquí no se comparten teléfonos ni correos.';
	const regla = h('p', { class: 'hilo-regla', role: 'status' }, h('span', { class: 'icon-info-circle', 'aria-hidden': 'true' }), ` ${REGLA}`);
	const decir = (texto, mal = false) => { regla.className = `hilo-regla${mal ? ' hilo-alerta' : ''}`; regla.replaceChildren(h('span', { class: mal ? 'icon-exclamation-circle' : 'icon-info-circle', 'aria-hidden': 'true' }), ` ${texto}`); };
	// El aviso de contacto mientras se escribe: el campo en rojo, «Enviar» apagado y una línea que dice qué parece.
	const revisar = () => {
		const tipo = V.tipoDeContacto(campo.value);
		campo.classList.toggle('hilo-mal', Boolean(tipo));
		enviar.disabled = Boolean(tipo);
		if (tipo) decir(`${(PARECE[tipo] || 'parece un contacto').replace(/^./, (x) => x.toUpperCase())}: aquí no se comparten contactos.`, true);
		else decir(enNota ? 'Nota interna: el cliente no la ve.' : REGLA);
		return !tipo;
	};
	const crecer = () => { campo.style.height = 'auto'; campo.style.height = `${Math.min(campo.scrollHeight + 2, 132)}px`; };
	campo.addEventListener('input', () => { memo.borradores[cod] = campo.value; crecer(); revisar(); });
	campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); } });
	const citandoEl = h('div', { class: 'hilo-citando', hidden: true });
	function citar(m) {
		if (enNota) candado.click();
		citando = citaDe(m);
		citandoEl.replaceChildren(h('span', {}, h('b', {}, `${nombreDe(m.de)}:`), ` ${resumenDe(m, t)}`),
			h('button', { type: 'button', class: 'hilo-ib', 'aria-label': 'Quitar la cita', title: 'Quitar la cita', onclick: () => { citando = null; citandoEl.hidden = true; campo.focus(); } }, h('span', { class: 'icon-times-circle', 'aria-hidden': 'true' })));
		citandoEl.hidden = false;
		lineas.querySelectorAll('.hilo-elegido').forEach((x) => x.classList.remove('hilo-elegido'));
		campo.focus();
	}
	// Un intento = un id: «Reintentar» lo vuelve a mandar con el mismo (nunca sale dos veces).
	async function mandar(ref, datos, alFallar) {
		try {
			await setDoc(ref, datos);
			fallidos.delete(ref.id);
			if (ref.parent.id === 'mensajes') { avisarChat(token); avisarAvisos(); }
		} catch (err) {
			console.warn('No se envió', err);
			fallidos.set(ref.id, { ...datos, id: ref.id, createdAt: Date.now(), _estado: 'fallo', _ref: ref, nota: ref.parent.id === 'notas' });
			alFallar?.(err);
		}
		repintar();
	}
	const reintentar = (m) => { const { _ref: ref, _estado, nota, id, ...datos } = m; fallidos.delete(id); repintar(); mandar(ref, { ...datos, createdAt: serverTimestamp() }); };
	const form = h('form', { class: `hilo-escribir${enNota ? ' hilo-en-nota' : ''}`, onsubmit: (e) => {
		e.preventDefault();
		const texto = campo.value.trim();
		if (!texto || !revisar()) return;
		const ref = doc(collection(db, 'chats', token, enNota ? 'notas' : 'mensajes'));
		const datos = { de: yo, texto, createdAt: serverTimestamp(), ...(citando && !enNota ? { responde: citando } : {}) };
		campo.value = ''; memo.borradores[cod] = ''; crecer();
		citando = null; citandoEl.hidden = true;
		alFondo = true;
		revisar();
		mandar(ref, datos, (err) => { if (err?.code === 'permission-denied' && V.tipoDeContacto(texto)) decir('Parece un contacto: aquí no se comparten contactos.', true); });
	} }, campo, enviar);
	// Nota interna: el botón del candado cambia el campo a nota (el cliente no la ve).
	const candado = h('button', { type: 'button', class: 'hilo-ib', 'aria-pressed': 'false', 'aria-label': 'Escribir una nota interna (el cliente no la ve)', title: 'Nota interna', onclick: () => {
		enNota = !enNota;
		if (enNota) { citando = null; citandoEl.hidden = true; }
		candado.classList.toggle('hilo-activo', enNota);
		candado.setAttribute('aria-pressed', String(enNota));
		form.classList.toggle('hilo-en-nota', enNota);
		campo.placeholder = enNota ? 'Nota para ti y el equipo…' : 'Escribe un mensaje…';
		revisar();
		campo.focus();
	} }, h('span', { class: 'icon-lock', 'aria-hidden': 'true' }));
	if (conR7) form.prepend(candado);
	// Respuestas rápidas del momento: una fila; «⋯» muestra todas.
	const rapidas = h('div', { class: `hilo-rapidas${memo.rapidasTodas ? ' hilo-todas' : ''}` },
		h('span', { class: 'hilo-rapidas-r' }, rapidasDe(l, chat).map((r) => h('button', { type: 'button', class: 'hilo-chip', title: r, onclick: () => { campo.value = r; memo.borradores[cod] = r; crecer(); revisar(); campo.focus(); } }, r))),
		h('button', { type: 'button', class: 'hilo-chip hilo-chip-mas', 'aria-label': 'Ver todas las respuestas rápidas', title: 'Más respuestas', 'aria-expanded': String(memo.rapidasTodas), onclick: (e) => {
			memo.rapidasTodas = !memo.rapidasTodas; rapidas.classList.toggle('hilo-todas', memo.rapidasTodas); e.currentTarget.setAttribute('aria-expanded', String(memo.rapidasTodas));
		} }, '⋯'));
	// «Sugerir respuesta» (con la IA encendida): el borrador va al campo, para revisarlo y mandarlo (nunca sale solo).
	estadoIA().then((activa) => {
		if (!activa) return;
		const chip = h('button', { type: 'button', class: 'hilo-chip hilo-chip-ia', title: 'Sugerir una respuesta (la revisas antes de mandarla)', onclick: async () => {
			chip.disabled = true;
			const antes = chip.lastChild.textContent;
			chip.lastChild.textContent = ' Pensando…';
			try {
				const texto = await sugerirRespuesta(token);
				if (texto) { campo.value = texto; memo.borradores[cod] = texto; crecer(); revisar(); campo.focus(); }
			} catch (err) { showError(err); }
			chip.lastChild.textContent = antes;
			chip.disabled = false;
		} }, h('span', { class: 'icon-bolt', 'aria-hidden': 'true' }), ' Sugerir respuesta');
		rapidas.firstChild.prepend(chip);
	});
	const cerrada = ['no', 'cancelada'].includes(chat.estado || '');
	// El socio ya no escribe en una reserva que no se dio o se canceló (las reglas tampoco lo dejan); el equipo sí.
	const pie = !S.admin && cerrada ? h('div', { class: 'hilo-pie-chat' }, h('p', { class: 'hilo-regla m-0' }, h('span', { class: 'icon-info-circle', 'aria-hidden': 'true' }), ' Esta reserva ya terminó: aquí ya no se escribe.'))
		: h('div', { class: 'hilo-pie-chat' }, cerrada ? null : rapidas, citandoEl, form, regla,
			!conR7 && S.admin ? h('p', { class: 'hilo-regla' }, h('span', { class: 'icon-exclamation-triangle', 'aria-hidden': 'true' }), ' Citar y las notas internas se activan al publicar las reglas nuevas de la base.') : null);

	const { arriba, lado } = cabeza(S, f);
	caja.append(...arriba, lineas, pie);
	revisar(); crecer();

	// En vivo: los mensajes, las notas y el chat (estado, vistos). Lo escrito aquí se ve al instante («Enviando…» mientras
	// la base no lo guarda: sin conexión se queda así y sale solo al volver).
	const cols = collection(db, 'chats', token, 'mensajes');
	const marcarVisto = () => {
		const ultimo = mensajes.at(-1);
		if (!ultimo || ultimo.de === yo || document.hidden || enMs(chat[S.admin ? 'vistoEquipo' : 'vistoSocio']) >= enMs(ultimo.createdAt)) return;
		updateDoc(doc(db, 'chats', token), { [S.admin ? 'vistoEquipo' : 'vistoSocio']: serverTimestamp() }).then(avisarAvisos, () => {});
	};
	const quitar = [
		onSnapshot(query(cols, orderBy('createdAt')), { includeMetadataChanges: true }, (s) => {
			mensajes = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), ...(d.metadata.hasPendingWrites ? { _estado: 'enviando' } : {}) }));
			// Con todos los mensajes a la vista se sabe si ya salieron los datos de llegada.
			if (mensajes.some((m) => m.tipo === 'llegada')) S.conLlegada.add(cod); else S.conLlegada.delete(cod);
			repintar(); marcarVisto();
		}, (err) => { console.warn('Mensajes', err); pintarHilo(lineas, [h('p', { class: 'hilo-vacio' }, 'No se pudieron leer los mensajes. Revisa tu conexión.')]); }),
		onSnapshot(doc(db, 'chats', token), (s) => {
			const nuevo = { ...s.data(), id: s.id };
			const cambio = (nuevo.estado || '') !== (chat.estado || '') || enMs(nuevo.comprobanteCliente) !== enMs(chat.comprobanteCliente) || Number(nuevo.pagoReabierto || 0) !== Number(chat.pagoReabierto || 0);
			chat = nuevo;
			S.datosChat[cod] = nuevo;
			// Otra pestaña (u otra persona) cambió la reserva: se vuelve a leer todo para que los botones digan lo de ahora.
			if (cambio) return recargarDatos();
			repintar();
		}, () => {}),
		conR7 ? onSnapshot(query(collection(db, 'chats', token, 'notas'), orderBy('createdAt')), { includeMetadataChanges: true }, (s) => {
			notas = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), ...(d.metadata.hasPendingWrites ? { _estado: 'enviando' } : {}) }));
			repintar();
		}, (err) => console.warn('Notas', err)) : () => {}
	];
	const alVolver = () => { if (!document.hidden) marcarVisto(); };
	document.addEventListener('visibilitychange', alVolver);
	memo.apagar = () => { quitar.forEach((q) => q()); document.removeEventListener('visibilitychange', alVolver); memo.apagar = () => {}; };
	repintar();
	return [caja, lado];
}

// Cabecera del hilo, el resumen y «lo que sigue» (celular y tableta) y la ficha de la reserva (computadora ancha).
function cabeza(S, f) {
	const { l, chat } = f;
	const r = l.reserva;
	const est = estado(l);
	const fechasR = rangoDias(r.llegada, r.salida);
	const total = dinero(r.total, r.moneda || 'USD');
	const nombre = S.admin ? l.nombre : PRIMERO(l.nombre);
	const pendiente = est === 'pendiente' && !chat.estado;
	const icono = (i) => h('span', { class: `icon-${i}`, 'aria-hidden': 'true' });
	const boton = (texto, clase, onclick, i, etiqueta) => h('button', { type: 'button', class: `hilo-btn ${clase}`, onclick, ...(etiqueta ? { 'aria-label': etiqueta, title: etiqueta } : {}) }, icono(i), texto);
	const p = S.plazoDe(l);
	const queda = p?.vence ? p.vence - ahoraYa() : 0;
	const quedaTxt = queda > 0 ? (queda < 3600000 ? `Quedan ${Math.max(1, Math.round(queda / 60000))} min` : `Quedan ${Math.round(queda / 3600000)} h`) : '';
	const pildora = (() => {
		const [texto, color] = chat.estado === 'pagada' ? ['Pagada', 'hilo-verde'] : chat.estado === 'confirmada' ? ['Confirmada', 'hilo-verde'] : chat.estado === 'no' ? ['No se dio', 'hilo-gris'] : chat.estado === 'cancelada' ? ['Cancelada', 'hilo-rojo'] : ['Pendiente', ''];
		return h('span', { class: `hilo-pildora ${color}` }, h('i'), texto);
	})();
	// Las acciones del momento (las mismas funciones de Solicitudes).
	const acciones = (ancho) => {
		if (pendiente && S.puedeConfirmar(l)) return [boton('Confirmar', `hilo-btn-pri${ancho ? ' msj-crece' : ''}`, () => S.confirmar(l), 'check'), boton('No se dio', 'hilo-btn-sec', () => S.noSeDio(l), 'times-circle')];
		if (pendiente && S.puedeNoSeDio(l)) return [boton('No se dio', 'hilo-btn-pri', () => S.noSeDio(l, S.ocupada(l) ? 'Fechas no disponibles' : ''), 'times-circle')];
		const out = [];
		if (S.puedePagoRecibido(l)) out.push(boton('Pago recibido', 'hilo-btn-pri', () => S.pagoRecibido(l), 'check'));
		if (!S.admin && est === 'confirmada' && S.puedeNoMeLlego(l)) out.push(boton('', 'hilo-btn-sec msj-solo-icono', () => S.noMeLlego(l), 'times-circle', 'No me llegó'));
		return out;
	};
	// Lo que sigue, en dos líneas: qué toca y por qué.
	const sigue = (() => {
		if (pendiente && !S.puedeConfirmar(l)) return S.puedeNoSeDio(l) ? ['No se puede confirmar', S.sinConfirmar(l) || (S.ocupada(l) ? 'Esas fechas ya tienen otra reserva' : S.pasada(l) ? 'La fecha de llegada ya pasó' : '')] : null;
		if (chat.estado === 'confirmada') {
			if (comprobanteVigente(chat)) return ['Revisa el pago', 'Subió su comprobante'];
			if (chat.pagoReabierto) return ['Le pediste otro comprobante', p?.vence ? `Vence ${diaDeChat(p.vence, ahoraYa())} ${horaChat(p.vence)}` : 'Si no paga, avísale al equipo'];
			return ['Esperando el pago', p?.vence ? `Vence ${diaDeChat(p.vence, ahoraYa())} ${horaChat(p.vence)}` : p?.sinPlazo ? 'Sin plazo automático: si no te paga, toca «No me llegó»' : 'Paga directo a ti y sube su comprobante'];
		}
		if (chat.estado === 'pagada') return llegadaPasada(r.llegada, ahoraYa()) ? [`Llegó el ${diaLargo(r.llegada)}`, 'Ya ve la dirección y cómo llegar'] : [`Llega el ${diaLargo(r.llegada)}`, 'Ya ve la dirección y cómo llegar'];
		if (chat.estado === 'no') return ['No se dio', 'La reserva no se concretó'];
		if (chat.estado === 'cancelada') return ['Reserva cancelada', 'Las fechas quedaron libres'];
		return null;
	})();
	const volver = h('a', { class: 'hilo-ib msj-volver', href: '#/mensajes', 'aria-label': 'Volver a Mensajes', title: 'Volver a Mensajes' }, icono('arrow-left'));
	const cab = h('header', { class: 'hilo-cab' }, volver,
		h('span', { class: 'hilo-cab-t' }, h('h2', { class: 'hilo-cab-nom' }, nombre),
			// Celular y tableta: lo que no dice la fila de abajo; computadora ancha: la casa y las fechas (lo demás va a la derecha).
			h('div', { class: 'hilo-cab-sub msj-angosto' }, pendiente ? l.propertyTitulo : chat.estado === 'confirmada' ? `${l.propertyTitulo} · ${fechasR} · ${total}` : `${l.propertyTitulo} · ${fechasR}`),
			h('div', { class: 'hilo-cab-sub msj-ancho' }, `${l.propertyTitulo} · ${fechasR}`)),
		h('span', { class: 'msj-ancho' }, pildora));
	const angosto = [];
	if (pendiente) {
		angosto.push(h('div', { class: 'hilo-resumen msj-angosto' }, h('span', { class: 'hilo-resumen-d' },
			h('span', {}, icono('calendar'), fechasR), h('span', { title: nNoches(r.noches) }, icono('moon-o'), String(r.noches)),
			h('span', { title: `${r.huespedes} personas` }, icono('users'), String(r.huespedes)), h('span', {}, icono('money'), total)), pildora.cloneNode(true)));
		const acc = acciones(true);
		if (acc.length && S.puedeConfirmar(l)) angosto.push(h('div', { class: 'hilo-resumen msj-angosto msj-acciones' }, acc, quedaTxt ? h('span', { class: 'hilo-plazo' }, quedaTxt) : null));
	}
	if (sigue) angosto.push(h('div', { class: 'hilo-sigue msj-angosto' }, h('span', { class: 'hilo-sigue-txt' }, h('b', {}, sigue[0]), sigue[1]),
		h('span', { class: 'hilo-sigue-acc' }, acciones(false).length ? acciones(false) : pildora.cloneNode(true))));
	// La ficha de la reserva (≥ 1280 px): foto, datos, lo que paga y a quién le toca qué, acciones y los pasos.
	const plata = S.plataDe(l);
	const mon = r.moneda || 'USD';
	const pasos = [
		{ texto: `Pidió reservar · ${chat.createdAt ? `${diaConSemana(V.hoy(enMs(chat.createdAt))).split(' ')[0]} ${horaChat(enMs(chat.createdAt))}` : ''}`, ok: true },
		pendiente ? { texto: `Falta confirmar${quedaTxt ? ` · ${quedaTxt.toLowerCase()}` : ''}`, ya: true }
			: { texto: chat.estado === 'no' ? 'No se dio' : chat.estado === 'cancelada' ? 'Cancelada' : 'Confirmada', ok: ['confirmada', 'pagada'].includes(chat.estado) },
		{ texto: chat.estado === 'pagada' ? 'Pago recibido' : chat.estado === 'confirmada' && comprobanteVigente(chat) ? 'Pago del cliente · subió comprobante' : 'Pago del cliente', ok: chat.estado === 'pagada', ya: chat.estado === 'confirmada' },
		{ texto: `Llegada · ${diaConSemana(r.llegada)}`, ok: chat.estado === 'pagada' && llegadaPasada(r.llegada, ahoraYa()) }];
	const lado = h('aside', { class: 'msj-lado', 'aria-label': 'La reserva' },
		fotoValida(chat.foto) ? h('img', { class: 'msj-lado-foto', src: chat.foto, alt: '', loading: 'lazy' }) : null,
		h('h2', {}, l.propertyTitulo || ''),
		h('dl', {},
			h('dt', {}, icono('calendar')), h('dd', {}, `${diaConSemana(r.llegada)} – ${diaConSemana(r.salida)} · ${nNoches(r.noches)}`),
			h('dt', {}, icono('users')), h('dd', {}, `${r.huespedes} ${r.huespedes === 1 ? 'persona' : 'personas'}`),
			h('dt', {}, icono('money')), h('dd', {}, `Cliente paga ${total}`),
			plata ? [h('dt', {}), h('dd', { class: 'msj-sec' }, `${S.admin ? 'Socio' : 'Tu parte'} ${dinero(plata.costoSocio, mon)}`),
				h('dt', {}), h('dd', { class: 'msj-sec' }, `${S.admin ? 'EQ' : 'Ganancia de EQ (se la pagas)'} ${dinero(plata.ganancia, mon)}`)] : null),
		acciones(false).length ? h('div', { class: 'msj-lado-acc' }, acciones(false)) : null,
		h('div', { class: 'msj-pasos' }, pasos.map((x) => h('div', { class: x.ok ? 'ok' : x.ya ? 'ya' : '' }, h('i'), x.texto))));
	return { arriba: [cab, ...angosto], lado };
}
