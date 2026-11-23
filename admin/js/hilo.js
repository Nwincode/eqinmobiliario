// El hilo de una conversación de reserva: una sola pieza para Mensajes del panel (admin/js/views/mensajes.js) y la página
// «Tu reserva» del cliente (js/reserva-chat.js, que la recibe como window.EQHilo: scripts/lib/assets.mjs). Recibe los
// datos y los textos y devuelve el DOM; no lee ni escribe la base ni sabe quién entró (eso lo dice quien la llama).
// Su estilo vive en css/hilo.css (el mismo en los dos lados).
// - Separadores de día («hoy», «ayer», «sábado 21 nov»: admin/js/formato.js).
// - Burbujas: las mías a la derecha; el autor solo cuando cambia y hace falta (`etiqueta`); hora y «Visto».
// - Lo que pasó con la reserva, en líneas finas centradas (`eventosDe`): salen del chat y de sus mensajes con tipo.
// - El comprobante como tarjeta (foto + revisión de la IA); la cita de un mensaje dentro de la burbuja; la traducción
//   debajo del texto; «No se envió · Reintentar» bajo la burbuja que falló.
import { horaChat, diaDeChat, enMs } from './formato.js';

const ms = enMs;
export { enMs };

function el(tag, clase, ...hijos) {
	const e = document.createElement(tag);
	if (clase) e.className = clase;
	for (const x of hijos.flat()) if (x != null && x !== false && x !== '') e.append(x.nodeType ? x : String(x));
	return e;
}
const icono = (i) => { const s = el('span', `icon-${i}`); s.setAttribute('aria-hidden', 'true'); return s; };
const boton = (clase, etiqueta, ...hijos) => { const b = el('button', clase, ...hijos); b.type = 'button'; if (etiqueta) { b.setAttribute('aria-label', etiqueta); b.title = etiqueta; } return b; };

// Lo que pasó con la reserva, en orden: [{ id, cuando, clave, icono, por }]. De lo guardado:
//  pidio: el chat nació (createdAt); confirmo y datosPago: el mensaje de pago (o estadoEn.confirmada en uno sin él);
//  pagoRecibido: el de llegada (o estadoEn.pagada); no y cancelada: estadoEn (lo escribe quien cambia el estado, en el
//  mismo cambio: admin/js/reservas.js y el servidor). Un chat de antes sin estadoEn muestra menos.
export function eventosDe(chat = {}, mensajes = []) {
	const out = [];
	const en = chat.estadoEn || {};
	const pago = mensajes.find((m) => m.tipo === 'pago');
	const llegada = mensajes.find((m) => m.tipo === 'llegada');
	if (ms(chat.createdAt)) out.push({ id: 'ev-pidio', cuando: ms(chat.createdAt), clave: 'pidio', icono: 'calendar-plus-o' });
	const confirmo = ms(pago?.createdAt) || ms(en.confirmada);
	if (confirmo) out.push({ id: 'ev-confirmo', cuando: confirmo, clave: 'confirmo', icono: 'check-circle', por: pago?.de || '' });
	if (ms(pago?.createdAt)) out.push({ id: 'ev-datos', cuando: ms(pago.createdAt), clave: 'datosPago', icono: 'money', por: pago.de, mensaje: pago });
	const pagada = ms(llegada?.createdAt) || ms(en.pagada);
	if (pagada) out.push({ id: 'ev-pagada', cuando: pagada, clave: 'pagoRecibido', icono: 'check-circle', por: llegada?.de || '', mensaje: llegada || null });
	if (ms(en.no)) out.push({ id: 'ev-no', cuando: ms(en.no), clave: 'no', icono: 'ban' });
	if (ms(en.cancelada)) out.push({ id: 'ev-cancelada', cuando: ms(en.cancelada), clave: 'cancelada', icono: 'ban' });
	return out;
}

// El texto corto de un mensaje para una cita o la lista: el de un mensaje con tipo es su nombre (nunca su contenido:
// datos de pago o una dirección no se repiten).
export function resumenDe(m, t) {
	if (!m) return '';
	if (m.tipo === 'foto') return t.comprobante;
	if (m.tipo === 'pago') return t.datosDePago;
	if (m.tipo === 'llegada') return t.datosDeLlegada;
	return String(m.texto || '');
}
// Lo que se guarda en `responde` al citar un mensaje: su id y quién lo escribió (las reglas revisan que exista y sea
// suyo). El texto de la cita se toma del mensaje citado al mostrarla: no se guarda otra copia.
export const citaDe = (m) => ({ id: String(m.id || ''), de: m.de });
const corto = (texto) => String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 120);

// Arma el hilo. `items`: los mensajes (y las notas internas, con `nota: true`) con su id y createdAt; los que se
// están mandando llevan `_estado` ('enviando' | 'fallo'). Opciones:
//  yo: 'cliente' | 'socio' | 'equipo' (las de ese lado van a la derecha; el socio y el equipo son «la casa» para el cliente)
//  idioma: el del que lee ('es' | 'en'); t: los textos (ver TEXTOS_PANEL); ahora: la hora
//  chat: el documento del chat (eventos y «Visto»); vistoOtros: hasta cuándo leyó el otro lado (ms)
//  etiqueta(m): quién lo escribió, cuando hace falta decirlo ('' = nada); nombreDe(de): el nombre en una cita
//  textoEvento(ev): el texto de un evento; tarjeta(m): la tarjeta de un mensaje con tipo (null: burbuja; 'omitir': ya
//  lo dice un evento)
//  alResponder(m): si se pueden citar mensajes; alReintentar(m): «Reintentar» de uno que falló
//  cualquierTraduccion: mostrar la traducción que haya aunque no sea al idioma de la página (la página del cliente)
export function armarHilo(items, o) {
	const { yo, idioma = 'es', t, ahora = Date.now(), chat = {}, vistoOtros = 0, etiqueta = () => '', nombreDe = () => '', textoEvento, tarjeta = () => null, alResponder = null, alReintentar = null, cualquierTraduccion = false } = o;
	const lado = (de) => (yo === 'cliente' ? (de === 'cliente' ? 'yo' : 'otro') : de === 'cliente' ? 'otro' : de === yo ? 'yo' : 'otro');
	const todos = [...items.map((m) => ({ ...m, cuando: ms(m.createdAt) || (m._estado ? ahora : 0) })),
		...eventosDe(chat, items).map((e) => ({ ...e, evento: true }))]
		.sort((a, b) => a.cuando - b.cuando || (a.evento ? -1 : 0) - (b.evento ? -1 : 0));
	const mios = todos.filter((m) => !m.evento && !m.nota && !m._estado && lado(m.de) === 'yo');
	const ultimoMio = mios.at(-1);
	const visto = ultimoMio && vistoOtros && ms(ultimoMio.createdAt) && vistoOtros >= ms(ultimoMio.createdAt);
	const out = [];
	let diaAntes = '', antes = null;
	for (const m of todos) {
		const d = m.cuando ? diaDeChat(m.cuando, ahora, idioma) : '';
		if (d && d !== diaAntes) { out.push(el('div', 'hilo-dia', d)); diaAntes = d; antes = null; }
		if (m.evento) {
			const texto = textoEvento(m);
			if (texto) out.push(el('div', 'hilo-ev', icono(m.icono), el('span', '', `${texto} · ${horaChat(m.cuando, idioma)}`)));
			antes = null;
			continue;
		}
		const propia = tarjeta(m);
		if (propia === 'omitir') continue;
		if (propia) { out.push(propia); antes = null; continue; }
		const l = m.nota ? 'nota' : lado(m.de);
		const caja = el('div', `hilo-m hilo-${l === 'yo' ? 'yo' : l === 'nota' ? 'nota' : 'otro'}${antes && (antes.de !== m.de || !!antes.nota !== !!m.nota || (antes.nombre || '') !== (m.nombre || '')) ? ' hilo-sep' : ''}`);
		caja.dataset.id = m.id || '';
		if (m.nota) caja.append(el('div', 'hilo-quien', icono('lock'), ` ${t.soloEquipo}`));
		else {
			const q = etiqueta(m);
			// Una vez por tanda: si el de arriba es el mismo autor con la misma etiqueta, no se repite.
			if (q && !(antes && antes.de === m.de && !antes.nota && etiqueta(antes) === q)) caja.append(el('div', 'hilo-quien', q));
		}
		const citado = m.responde?.id && items.find((x) => x.id === m.responde.id);
		if (citado) {
			const cita = boton('hilo-cita', t.irACita);
			const quien = nombreDe(m.responde.de);
			cita.append(el('b', '', quien ? `${quien}: ` : ''), corto(resumenDe(citado, t)));
			cita.addEventListener('click', (e) => { e.stopPropagation(); irA(caja.closest('.hilo'), m.responde.id); });
			caja.append(cita);
		}
		caja.append(el('span', 'hilo-txt', m.texto));
		// La traducción al idioma de quien lee (el cliente que escribe en inglés desde la página en español: cualquiera).
		const trad = !m.nota && lado(m.de) === 'otro' && (m.traduccion?.[idioma] || (cualquierTraduccion && Object.values(m.traduccion || {}).find(Boolean)));
		if (trad) caja.append(el('span', 'hilo-trad', trad));
		const pie = m._estado === 'enviando' ? t.enviando : `${m.cuando ? horaChat(m.cuando, idioma) : ''}${visto && m === ultimoMio ? ` · ${t.visto}` : ''}`;
		caja.append(el('div', 'hilo-pie', pie));
		if (alResponder && !m._estado && !m.nota) {
			const r = boton('hilo-resp', t.responder, icono('reply'));
			r.addEventListener('click', (e) => { e.stopPropagation(); alResponder(m); });
			caja.append(r);
			// En el celular, tocar el mensaje muestra la flecha (en la computadora sale al pasar el ratón).
			caja.addEventListener('click', () => { caja.closest('.hilo')?.querySelectorAll('.hilo-elegido').forEach((x) => x !== caja && x.classList.remove('hilo-elegido')); caja.classList.toggle('hilo-elegido'); });
		}
		out.push(caja);
		if (m._estado === 'fallo') {
			const b = boton('hilo-noenv', '', icono('exclamation-circle'), ` ${t.noSeEnvio}`);
			if (alReintentar) b.addEventListener('click', () => alReintentar(m));
			out.push(b);
		}
		antes = m;
	}
	return out;
}

// Lleva la vista al mensaje citado y lo marca un momento.
export function irA(hilo, id) {
	const x = id && hilo?.querySelector(`[data-id="${CSS.escape(id)}"]`);
	if (!x) return;
	x.scrollIntoView({ block: 'center', behavior: 'smooth' });
	x.classList.add('hilo-marcado');
	setTimeout(() => x.classList.remove('hilo-marcado'), 1600);
}

// Pinta el hilo en su caja sin perder la posición: si estaba abajo (o es la primera vez, o `alFondo`: lo acabo de
// mandar yo), queda abajo.
export function pintarHilo(caja, nodos, alFondo = false) {
	const abajo = alFondo || !caja.childElementCount || caja.scrollHeight - caja.scrollTop - caja.clientHeight < 48;
	const arriba = caja.scrollTop;
	caja.replaceChildren(...nodos);
	caja.scrollTop = abajo ? caja.scrollHeight : arriba;
}

// La tarjeta del comprobante: miniatura, la revisión de la IA (si la hay) y banco · referencia.
// rv: { cuadra, texto, leido: { banco, referencia, monto, moneda } } de revisionesComprobante (solo el panel la lee).
// Con `foto` (estadoDeFoto, en el panel): `ver: false` → sin la imagen ni su enlace, con lo que dice `aviso`
// («Foto recibida · en revisión», «El equipo está revisando esta foto»); `marca` → una línea más (lo que vio la revisión:
// «Posible dato de contacto», «Sin revisar»); `accion` → un botón al final (el equipo: «Mostrar al socio»).
export function tarjetaComprobante(m, t, rv = null, monto = '', { ver = true, aviso = '', marca = '', accion = null } = {}) {
	let a;
	if (ver) {
		a = el('a', 'hilo-comp-foto');
		a.href = m.texto; a.target = '_blank'; a.rel = 'noopener';
		const img = el('img'); img.src = m.texto; img.alt = t.comprobante; img.loading = 'lazy'; img.width = 64; img.height = 64;
		a.append(img);
	} else a = el('span', 'hilo-comp-foto hilo-comp-sin', icono('camera'));
	const lineas = el('span', 'hilo-comp-txt', el('b', '', t.comprobante));
	if (!ver) lineas.append(el('span', 'hilo-comp-dato', aviso));
	if (ver && rv?.texto) lineas.append(el('span', `hilo-ia${rv.cuadra ? '' : ' hilo-ia-no'}`, icono(rv.cuadra ? 'check-circle' : 'exclamation-circle'), ` ${rv.cuadra ? `${t.cuadra}${monto ? `: ${monto}` : ''}` : rv.texto}`));
	if (marca) lineas.append(el('span', `hilo-ia${marca === 'Sin revisar' ? ' hilo-ia-gris' : ' hilo-ia-no'}`, icono(marca === 'Sin revisar' ? 'info-circle' : 'exclamation-circle'), ` ${marca}`));
	const datos = ver ? [rv?.leido?.banco, rv?.leido?.referencia && `ref. ${rv.leido.referencia}`].filter(Boolean).join(' · ') : '';
	if (datos) lineas.append(el('span', 'hilo-comp-dato', datos));
	const caja = el('div', 'hilo-tarj hilo-comp', a, lineas, accion);
	caja.dataset.id = m.id || '';
	return caja;
}

// ¿Se le muestra al socio la foto `m` que mandó el cliente? Lo decide la revisión del servidor (netlify/lib/comprobantes.mjs:
// revisionesComprobante `fotos.f{id}` y el de ahora en `mensaje`/`oculta`), lo que el equipo decidió (`chat.fotosVisibles`)
// y si hay IA (`ia`). Sin IA, o si la revisión falló o tarda más de ESPERA_REVISION: como siempre (se ve). Devuelve
// { ver, enRevision, oculta, marca } — `marca` es lo que ve el equipo junto a la foto.
export const ESPERA_REVISION = 20 * 60_000;
export function estadoDeFoto(m, { chat = {}, rv = null, ia = false, ahora = Date.now() } = {}) {
	if ((chat.fotosVisibles || []).includes(m.id)) return { ver: true, marca: '' };
	if (!ia) return { ver: true, marca: 'Sin revisar' };
	const suya = rv?.fotos?.[`f${m.id}`] || (rv?.mensaje === m.id && rv.texto ? { oculta: Boolean(rv.oculta), motivo: rv.motivoOculta || '' } : null);
	if (suya) return suya.oculta ? { ver: false, oculta: true, marca: suya.motivo || 'Posible dato de contacto' } : { ver: true, marca: '' };
	// Sin veredicto: la de ahora espera su revisión un rato; si falló (3 veces) o tarda, se ve como siempre.
	const actual = m.id === chat.comprobanteMensaje;
	const fallo = rv?.mensaje === m.id && Number(rv.fallos) >= 3;
	if (actual && !fallo && ahora - ms(m.createdAt) < ESPERA_REVISION) return { ver: false, enRevision: true, marca: 'Sin revisar' };
	if (actual) return { ver: true, marca: 'Sin revisar' };
	// Una foto que no es el comprobante de la reserva (nadie la revisó): el equipo la ve y decide.
	return { ver: false, oculta: true, marca: 'Sin revisar' };
}

// Los pasos de la reserva en una línea (página del cliente): [{ texto, estado: 'ok' | 'ya' | '' }].
export function pasosEnLinea(pasos) {
	const caja = el('div', 'hilo-pasos');
	pasos.forEach((p, i) => {
		if (i) caja.append(el('hr'));
		caja.append(el('span', p.estado ? `hilo-paso-${p.estado}` : '', el('i'), p.texto));
	});
	return caja;
}

// Textos del panel (en español; el cliente trae los suyos de scripts/lib/i18n.mjs).
export const TEXTOS_PANEL = {
	visto: 'Visto', enviando: 'Enviando…', noSeEnvio: 'No se envió · Reintentar', responder: 'Responder a este mensaje', irACita: 'Ir al mensaje citado',
	comprobante: 'Comprobante de pago', datosDePago: 'Datos de pago', datosDeLlegada: 'Datos de llegada', cuadra: 'Cuadra', soloEquipo: 'Solo tú y el equipo', idioma: 'es'
};
// El texto de un evento para el socio o el equipo (`yo`), con el primer nombre del cliente.
export function eventoPanel(ev, yo, nombre) {
	const quien = (por) => (por === yo ? '' : por === 'socio' ? 'El socio ' : 'El equipo ');
	switch (ev.clave) {
		case 'pidio': return `${nombre || 'El cliente'} pidió reservar`;
		case 'confirmo': return !ev.por ? 'Se confirmó la reserva' : ev.por !== yo ? `${quien(ev.por)}confirmó la reserva` : 'Confirmaste la reserva';
		case 'datosPago': return yo === 'socio' ? 'Se le mostraron tus datos de pago' : 'Se le mostraron los datos de pago del socio';
		case 'pagoRecibido': return !ev.por ? 'Se marcó «Pago recibido»' : ev.por !== yo ? `${quien(ev.por)}marcó «Pago recibido»` : 'Marcaste «Pago recibido»';
		case 'no': return 'No se dio';
		case 'cancelada': return 'Reserva cancelada';
		default: return '';
	}
}
