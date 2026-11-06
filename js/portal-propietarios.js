// Portal del propietario. Dos formas de entrar, ninguna con contraseña:
//  1. Enlace privado que manda el asesor por WhatsApp: /propietarios/#t=<token>.
//     El token (43 caracteres al azar) es el id del documento portalPropietarios/{token}.
//  2. Enlace al correo (Firebase «Correo electrónico sin contraseña»). Con la sesión iniciada
//     se buscan los portales cuyo campo email coincide con el correo verificado.
// Los datos ya vienen resumidos por el panel: sin nombres ni teléfonos de clientes
// (los interesados llegan como «Cliente 1, 2…» con canal, fechas, visitas y etapa).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
	getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
	getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const raiz = document.getElementById('pp');
const T = JSON.parse(raiz.dataset.t || '{}');
const EN = raiz.dataset.lang === 'en';
const LOCALE = EN ? 'en-US' : 'es-GT';
const CLAVE_CORREO = 'ppCorreo';
const DIA = 86400000;

const ESTADOS = {
	disponible: { es: 'Disponible', en: 'Available', clase: '' },
	proximamente: { es: 'Próximamente', en: 'Coming soon', clase: 'pp-badge-proximamente' },
	reservada: { es: 'Reservada', en: 'Under contract', clase: 'pp-badge-reservada' },
	vendida: { es: 'Vendida', en: 'Sold', clase: 'pp-badge-cerrada' },
	rentada: { es: 'Rentada', en: 'Rented', clase: 'pp-badge-cerrada' },
	pausada: { es: 'Pausada', en: 'Paused', clase: 'pp-badge-oculta' },
	retirada: { es: 'Retirada', en: 'Withdrawn', clase: 'pp-badge-oculta' }
};
const TIPOS = {
	foto: { es: 'Fotos nuevas', en: 'New photos' },
	precio: { es: 'Cambio de precio', en: 'Price change' },
	oferta: { es: 'Oferta', en: 'Offer' },
	visita: { es: 'Visita', en: 'Showing' },
	paso: { es: 'Próximo paso', en: 'Next step' },
	nota: { es: 'Nota', en: 'Note' },
	publicado: { es: 'Publicación', en: 'Listing' },
	portal: { es: 'Publicación', en: 'Listing' }
};
const PREFIJO = { USD: 'US$', GTQ: 'Q' };

const $ = (id) => document.getElementById(id);
const SECCIONES = ['pp-cargando', 'pp-acceso', 'pp-confirmar', 'pp-error', 'pp-vacio', 'pp-panel'];
function mostrar(id) {
	for (const s of SECCIONES) $(s).hidden = s !== id;
	if (id !== 'pp-cargando') {
		const foco = $(id).querySelector('h2');
		if (foco && document.activeElement === document.body) { foco.tabIndex = -1; foco.focus({ preventScroll: true }); }
	}
}

// ——— Formatos ———
const fecha = (v, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => {
	const d = aFecha(v);
	return d ? d.toLocaleDateString(LOCALE, opts) : '';
};
function aFecha(v) {
	if (!v) return null;
	let d;
	if (typeof v.toDate === 'function') d = v.toDate();
	else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(`${v}T12:00:00`);
	else d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
}
const precio = (n, moneda, operacion) => {
	if (!n) return EN ? 'Price on request' : 'Precio a consultar';
	const s = `${PREFIJO[moneda] || moneda || 'US$'} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
	return operacion === 'renta' ? `${s}${EN ? ' /mo' : ' /mes'}` : s;
};
const soloDigitos = (s) => String(s || '').replace(/[^\d]/g, '');
const urlSegura = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

// ——— Firebase ———
let auth = null;
let db = null;
async function iniciarFirebase() {
	const res = await fetch('/site.config.json', { cache: 'no-store' });
	if (!res.ok) throw new Error('config');
	const cfg = (await res.json()).firebase || {};
	if (!cfg.apiKey || !cfg.projectId) throw new Error('config');
	// App con nombre propio: no comparte sesión con el panel del equipo en el mismo navegador.
	const app = initializeApp(cfg, 'portal');
	auth = getAuth(app);
	auth.languageCode = EN ? 'en' : 'es';
	db = getFirestore(app);
}

// ——— Token del enlace privado ———
function leerToken() {
	const hash = new URLSearchParams(location.hash.slice(1)).get('t');
	if (hash) return hash;
	// Compatibilidad con ?t=: se pasa al # para que el token no viaje al servidor en otras visitas.
	const q = new URLSearchParams(location.search);
	const t = q.get('t');
	if (t) {
		q.delete('t');
		const resto = q.toString();
		history.replaceState(null, '', `${location.pathname}${resto ? `?${resto}` : ''}#t=${encodeURIComponent(t)}`);
	}
	return t || '';
}
const tokenValido = (t) => /^[A-Za-z0-9_-]{32,128}$/.test(t);

// ——— Pintar el panel ———
function pintar(portales, { conSesion }) {
	const lista = $('pp-lista');
	lista.replaceChildren();
	const p0 = portales[0];
	const q = (sel, base = $('pp-panel')) => base.querySelector(`[data-pp="${sel}"]`);
	q('nombre').textContent = p0.nombre ? `, ${p0.nombre}` : '';
	const ultima = portales.map((p) => aFecha(p.updatedAt)).filter(Boolean).sort((a, b) => b - a)[0];
	q('actualizado').textContent = ultima ? fecha(ultima) : '';
	q('actualizado').dateTime = ultima ? ultima.toISOString() : '';
	q('actualizado').parentElement.hidden = !ultima;

	// Asesor
	const ag = p0.asesor || {};
	q('asesor').hidden = !ag.nombre && !ag.whatsapp && !ag.telefono;
	q('asesor-nombre').textContent = ag.nombre || (EN ? 'Equipo Inmobiliario' : 'Equipo Inmobiliario');
	const foto = urlSegura(ag.foto);
	q('asesor-foto').hidden = !foto;
	if (foto) q('asesor-foto').src = foto;
	q('asesor-inicial').hidden = Boolean(foto);
	q('asesor-inicial').textContent = (ag.nombre || 'E').trim().charAt(0).toUpperCase();
	const titulos = portales.flatMap((p) => p.propiedades || []).map((x) => x.titulo).filter(Boolean);
	const msg = EN
		? `Hi${ag.nombre ? ` ${ag.nombre.split(' ')[0]}` : ''}, I saw my owner portal${titulos[0] ? ` (${titulos[0]})` : ''} and I have a question.`
		: `Hola${ag.nombre ? ` ${ag.nombre.split(' ')[0]}` : ''}, vi mi portal de propietario${titulos[0] ? ` (${titulos[0]})` : ''} y tengo una consulta.`;
	const wa = soloDigitos(ag.whatsapp);
	q('asesor-wa').hidden = !wa;
	if (wa) q('asesor-wa').href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
	const tel = String(ag.telefono || '').replace(/[^\d+]/g, '');
	q('asesor-tel').hidden = !tel;
	if (tel) q('asesor-tel').href = `tel:${tel}`;
	if (ag.nombre) {
		q('asesor-wa').setAttribute('aria-label', `${T.whatsapp}: ${ag.nombre}`);
		q('asesor-tel').setAttribute('aria-label', `${T.llamar}: ${ag.nombre}`);
	}

	// Próximo paso y exclusiva (del primer portal que los tenga)
	const paso = portales.map((p) => p.proximoPaso).find(Boolean) || '';
	q('paso').textContent = paso;
	q('paso-caja').hidden = !paso;
	const excl = portales.map((p) => p.exclusivaFin).find(Boolean) || '';
	q('exclusiva').textContent = excl ? fecha(excl) : '';
	q('exclusiva-caja').hidden = !excl;
	q('datos').hidden = !paso && !excl;

	// Cada propiedad lleva el token y los ids de su portal: el comentario se valida contra ese portal.
	const props = portales.flatMap((p) => (p.propiedades || []).map((x) => ({
		...x, _portal: { token: p._token, propietarioId: p.propietarioId, agentId: p.agentId }
	})));
	resumen(props, q);
	graficaMeses(props, q);
	graficaCanales(props, q);
	for (const prop of props) lista.append(tarjeta(prop));
	document.querySelector('#pp-panel [data-pp-accion="salir"]').hidden = !conSesion;
	mostrar('pp-panel');
}

function iconoTipo(tipo) {
	const tpl = $('pp-tpl-iconos').content;
	const el = tpl.querySelector(`[data-tipo="${TIPOS[tipo] ? tipo : 'nota'}"]`);
	return el.cloneNode(true);
}

// Ícono de canal o etapa de un cliente interesado (las clases viven en #pp-tpl-iconos).
function iconoDe(attr, valor, porDefecto) {
	const tpl = $('pp-tpl-iconos').content;
	const el = tpl.querySelector(`[data-${attr}="${valor}"]`) || tpl.querySelector(`[data-${attr}="${porDefecto}"]`);
	return el ? el.cloneNode(true) : document.createTextNode('');
}
const llenar = (plantilla, datos) => String(plantilla || '').replace(/\{(\w+)\}/g, (_, k) => (datos[k] ?? ''));

// Texto de un evento automático (viene sin texto: se arma aquí para que salga en el idioma de la página).
function textoAuto(e, p) {
	const A = T.auto || {};
	const veces = Number(e.veces) || 1;
	switch (e.auto) {
		case 'web': return A.web;
		case 'portal': return llenar(A.portal, { p: e.portal || '' });
		case 'precio': return llenar(A.precio, { p: precio(e.precio, e.moneda, p.operacion) });
		case 'visita': return veces > 1 ? llenar(A.visitaN, { n: veces }) : A.visita;
		case 'oferta': return veces > 1 ? llenar(A.ofertaN, { n: veces }) : A.oferta;
		default: return '';
	}
}

const ETAPAS_CLIENTE = ['interesado', 'visito', 'negociando', 'oferto', 'cerro', 'perdido'];
const CANALES_CLIENTE = ['web', 'whatsapp', 'portal', 'anuncio', 'redes', 'referido', 'llamada', 'otro'];

function clientesDe(p, q) {
	const lista = (Array.isArray(p.clientes) ? p.clientes : []).filter((c) => c && Number(c.n));
	const filas = q('clientes-filas');
	const tpl = $('pp-tpl-cliente').content.firstElementChild;
	// Lo más reciente arriba, como en la línea de tiempo.
	for (const c of lista.slice().sort((a, b) => b.n - a.n)) {
		const tr = tpl.cloneNode(true);
		const r = (sel) => tr.querySelector(`[data-pp="${sel}"]`);
		r('n').textContent = `${T.cliente} ${c.n}`;
		const canal = CANALES_CLIENTE.includes(c.canal) ? c.canal : 'otro';
		r('canal').append(iconoDe('canal', canal, 'otro'), document.createTextNode((T.canales || {})[canal] || ''));
		const desde = r('desde');
		desde.textContent = c.desde ? fecha(c.desde, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
		if (c.desde) desde.dateTime = c.desde;
		const nv = Number(c.visitas) || 0;
		let tv = nv === 0 ? T.sinVisitas : nv === 1 ? T.unaVisita : llenar(T.nVisitas, { n: nv });
		if (nv && c.ultimaVisita) tv += ` · ${llenar(T.ultima, { f: fecha(c.ultimaVisita, { day: 'numeric', month: 'short' }) })}`;
		if (c.visitaProxima) tv += ` · ${T.agendada}`;
		r('visitas').textContent = tv;
		if (!nv && !c.visitaProxima) r('visitas').classList.add('pp-apagado');
		const etapa = ETAPAS_CLIENTE.includes(c.etapa) ? c.etapa : 'interesado';
		const chip = r('etapa');
		chip.classList.add(`pp-etapa-${etapa}`);
		chip.append(iconoDe('etapa', etapa, 'interesado'), document.createTextNode((T.etapas || {})[etapa] || ''));
		filas.append(tr);
	}
	const hay = lista.length > 0;
	q('clientes').hidden = !hay;
	q('sin-clientes').hidden = hay;
	const total = lista.reduce((m, c) => Math.max(m, Number(c.n) || 0), 0);
	q('clientes-mas').hidden = total <= lista.length;
	q('clientes-mas').textContent = llenar(T.clientesMas, { n: total });
	const visitaron = lista.filter((c) => Number(c.visitas) > 0).length;
	q('clientes-resumen').textContent = hay
		? [total === 1 ? T.resumenUno : llenar(T.resumenClientes, { n: total }),
			visitaron ? (visitaron === 1 ? T.resumenVisitoUno : llenar(T.resumenVisitaron, { n: visitaron })) : ''].filter(Boolean).join(' · ')
		: '';
}

// ——— Resumen y gráficas (solo con los datos que ya trae el portal) ———
const el = (tag, clase, texto) => {
	const n = document.createElement(tag);
	if (clase) n.className = clase;
	if (texto !== undefined) n.textContent = texto;
	return n;
};
const oculto = (texto) => el('span', 'visually-hidden', texto);
const sub30 = (n) => (n ? llenar(T.mas30, { n }) : T.sin30);

function resumen(props, q) {
	const activas = props.filter((p) => ['disponible', 'reservada'].includes(p.estado || 'disponible')).length;
	q('r-propiedades').textContent = String(props.length);
	q('r-propiedades-sub').textContent = activas === 1 ? T.propsSubUno : llenar(T.propsSub, { n: activas });
	for (const clave of ['consultas', 'visitas', 'ofertas']) {
		const total = props.reduce((m, p) => m + (Number(p.kpis?.[clave]?.total) || 0), 0);
		const d30 = props.reduce((m, p) => m + (Number(p.kpis?.[clave]?.d30) || 0), 0);
		q(`r-${clave}`).textContent = String(total);
		q(`r-${clave}-sub`).textContent = sub30(d30);
		q(`r-${clave}-sub`).classList.toggle('pp-apagado', !d30);
	}
}

// Últimos 6 meses: nuevos interesados (fecha del primer contacto) y visitas (eventos de visita).
function graficaMeses(props, q) {
	const hoy = new Date();
	const meses = Array.from({ length: 6 }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1));
	const clave = (d) => `${d.getFullYear()}-${d.getMonth()}`;
	const datos = new Map(meses.map((m) => [clave(m), { a: 0, b: 0 }]));
	for (const p of props) {
		for (const c of p.clientes || []) {
			const d = aFecha(c?.desde);
			if (d && datos.has(clave(d))) datos.get(clave(d)).a += 1;
		}
		for (const e of p.eventos || []) {
			const d = e?.tipo === 'visita' ? aFecha(e.fecha) : null;
			if (d && datos.has(clave(d))) datos.get(clave(d)).b += Number(e.veces) || 1;
		}
	}
	const valores = [...datos.values()];
	const max = Math.max(...valores.flatMap((v) => [v.a, v.b]));
	const ol = q('g-meses');
	ol.replaceChildren();
	meses.forEach((m) => {
		const v = datos.get(clave(m));
		const nombre = m.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
		const li = el('li', 'pp-mes');
		const barras = el('div', 'pp-mes-barras');
		barras.setAttribute('aria-hidden', 'true');
		for (const [serie, n] of [['a', v.a], ['b', v.b]]) {
			const col = el('span', `pp-barra pp-serie-${serie}${n ? '' : ' pp-barra-cero'}`);
			col.style.setProperty('--v', `${max ? (n / max) * 100 : 0}%`);
			col.append(el('span', 'pp-barra-valor', String(n)));
			barras.append(col);
		}
		const etiqueta = el('span', 'pp-mes-nombre', nombre);
		etiqueta.setAttribute('aria-hidden', 'true');
		li.append(barras, etiqueta, oculto(llenar(T.mesResumen, { m: m.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }), a: v.a, b: v.b })));
		ol.append(li);
	});
	const hay = max > 0;
	ol.hidden = !hay;
	q('g-meses-leyenda').hidden = !hay;
	q('g-meses-vacio').hidden = hay;
}

function graficaCanales(props, q) {
	const cuenta = new Map();
	for (const p of props) for (const c of p.clientes || []) {
		if (!c || !Number(c.n)) continue;
		const canal = CANALES_CLIENTE.includes(c.canal) ? c.canal : 'otro';
		cuenta.set(canal, (cuenta.get(canal) || 0) + 1);
	}
	const filas = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
	const total = filas.reduce((m, [, n]) => m + n, 0);
	const max = filas.length ? filas[0][1] : 0;
	const ul = q('g-canales');
	ul.replaceChildren();
	for (const [canal, n] of filas) {
		const nombre = (T.canales || {})[canal] || '';
		const li = el('li', 'pp-hbarra');
		const etiqueta = el('span', 'pp-hbarra-nombre');
		etiqueta.append(iconoDe('canal', canal, 'otro'), document.createTextNode(nombre));
		etiqueta.setAttribute('aria-hidden', 'true');
		const pista = el('span', 'pp-pista');
		pista.setAttribute('aria-hidden', 'true');
		const relleno = el('span', 'pp-relleno');
		relleno.style.setProperty('--v', `${(n / max) * 100}%`);
		pista.append(relleno);
		const num = el('span', 'pp-hbarra-numero', String(n));
		num.setAttribute('aria-hidden', 'true');
		li.append(etiqueta, pista, num, oculto(llenar(T.canalResumen, { c: nombre, n, t: total })));
		ul.append(li);
	}
	ul.hidden = !filas.length;
	q('g-canales-vacio').hidden = Boolean(filas.length);
}

// Avance de la propiedad: Próximamente → En el mercado → Reservada → Vendida/Rentada.
const PASO = { proximamente: 0, disponible: 1, reservada: 2, vendida: 3, rentada: 3 };
function avance(p, q) {
	const ol = q('avance');
	const estado = p.estado || 'disponible';
	if (!(estado in PASO)) {
		ol.hidden = true;
		q('avance-nota').hidden = false;
		q('avance-nota-texto').textContent = estado === 'retirada' ? T.notaRetirada : T.notaPausada;
		return;
	}
	const actual = PASO[estado];
	const nombres = (p.operacion === 'renta' || estado === 'rentada') ? T.pasosRenta : T.pasos;
	(nombres || []).forEach((nombre, i) => {
		const hecho = i < actual || (i === actual && i === 3);
		const li = el('li', `pp-paso${hecho ? ' pp-paso-hecho' : ''}${i === actual ? ' pp-paso-actual' : ''}`);
		const marca = el('span', 'pp-paso-marca');
		marca.setAttribute('aria-hidden', 'true');
		if (hecho) marca.append($('pp-tpl-iconos').content.querySelector('[data-tipo="hecho"]').cloneNode(true));
		li.append(marca, el('span', 'pp-paso-nombre', nombre));
		if (i === actual) { li.setAttribute('aria-current', 'step'); li.append(oculto(` (${T.pasoActual})`)); }
		else if (hecho) li.append(oculto(` (${T.pasoHecho})`));
		ol.append(li);
	});
}

// Línea de precio (SVG propio) cuando hay dos o más precios.
function lineaPrecio(hp, p, caja) {
	const orden = hp.slice().reverse();
	if (orden.length < 2) return;
	const vals = orden.map((x) => Number(x.precio));
	const min = Math.min(...vals), max = Math.max(...vals);
	const W = 240, H = 56, M = 6;
	const pts = vals.map((v, i) => [M + (i * (W - 2 * M)) / (vals.length - 1), max === min ? H / 2 : M + ((max - v) * (H - 2 * M)) / (max - min)]);
	const NS = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.setAttribute('class', 'pp-precio-svg');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', llenar(T.preciosGrafica, { a: precio(vals[0], orden[0].moneda, p.operacion), b: precio(vals[vals.length - 1], orden[orden.length - 1].moneda, p.operacion) }));
	const area = document.createElementNS(NS, 'path');
	area.setAttribute('class', 'pp-precio-area');
	area.setAttribute('d', `M${pts[0][0]},${H} ${pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${pts[pts.length - 1][0]},${H} Z`);
	const linea = document.createElementNS(NS, 'polyline');
	linea.setAttribute('class', 'pp-precio-linea');
	linea.setAttribute('points', pts.map(([x, y]) => `${x},${y}`).join(' '));
	svg.append(area, linea);
	pts.forEach(([x, y], i) => {
		// Punto como línea de largo cero con punta redonda: sigue redondo aunque el SVG se estire a lo ancho.
		const c = document.createElementNS(NS, 'line');
		c.setAttribute('x1', x); c.setAttribute('x2', x); c.setAttribute('y1', y); c.setAttribute('y2', y);
		c.setAttribute('class', i === pts.length - 1 ? 'pp-precio-punto pp-precio-punto-actual' : 'pp-precio-punto');
		svg.append(c);
	});
	caja.append(svg);
	caja.hidden = false;
}

function tarjeta(p) {
	const nodo = $('pp-tpl-prop').content.firstElementChild.cloneNode(true);
	const q = (sel) => nodo.querySelector(`[data-pp="${sel}"]`);
	const est = ESTADOS[p.estado] || ESTADOS.disponible;

	const img = q('foto');
	const foto = urlSegura(p.foto);
	if (foto) { img.src = foto; img.alt = p.titulo || ''; } else { img.remove(); q('sin-foto').hidden = false; }
	q('estado').textContent = EN ? est.en : est.es;
	if (est.clase) q('estado').classList.add(est.clase);
	q('titulo').textContent = p.titulo || '';
	q('precio').textContent = precio(p.precio, p.moneda, p.operacion);

	const desde = aFecha(p.enMercadoDesde);
	const hasta = aFecha(p.enMercadoHasta) || new Date();
	const dias = desde ? Math.max(0, Math.floor((hasta - desde) / DIA)) : null;
	q('dias').textContent = dias === null ? '—' : String(dias);
	if (dias === 1) q('dias-texto').textContent = EN ? 'day on the market' : 'día en el mercado';
	anuncio(p, q);
	respuesta(p, q);
	avance(p, q);

	// Embudo: consultas → visitas → ofertas, barras relativas a la mayor.
	const k = p.kpis || {};
	const tope = Math.max(1, ...['consultas', 'visitas', 'ofertas'].map((c) => Number(k[c]?.total) || 0));
	for (const clave of ['consultas', 'visitas', 'ofertas']) {
		const total = Number(k[clave]?.total) || 0;
		const d30 = Number(k[clave]?.d30) || 0;
		q(clave).textContent = String(total);
		q(`${clave}30`).textContent = d30 ? llenar(T.del30, { n: d30 }) : '';
		q(`${clave}-barra`).style.setProperty('--v', `${(total / tope) * 100}%`);
	}
	const prox = Number(k.visitasProximas) || 0;
	q('proximas').hidden = !prox;
	q('proximas-texto').textContent = EN
		? `${prox} showing${prox === 1 ? '' : 's'} scheduled`
		: `${prox} visita${prox === 1 ? '' : 's'} agendada${prox === 1 ? '' : 's'}`;

	// Línea de tiempo
	const eventos = (p.eventos || []).filter((e) => e && (e.texto || e.auto));
	const ol = q('eventos');
	for (const e of eventos) {
		const li = document.createElement('li');
		li.className = 'pp-evento';
		const cuerpo = document.createElement('div');
		const f = document.createElement('p');
		f.className = 'pp-evento-fecha';
		const tipo = document.createElement('span');
		tipo.className = 'pp-evento-tipo';
		tipo.textContent = (TIPOS[e.tipo] || TIPOS.nota)[EN ? 'en' : 'es'];
		f.append(tipo, document.createTextNode(e.fecha ? ` · ${fecha(e.fecha)}` : ''));
		const tx = document.createElement('p');
		tx.className = 'pp-evento-texto';
		tx.textContent = e.auto ? textoAuto(e, p) : e.texto;
		if (e.auto) li.classList.add('pp-evento-auto');
		cuerpo.append(f, tx);
		li.append(iconoTipo(e.tipo), cuerpo);
		ol.append(li);
	}
	ol.hidden = !eventos.length;
	q('sin-eventos').hidden = Boolean(eventos.length);

	// Historial de precio (el más reciente arriba)
	const hp = (p.historialPrecio || []).filter((x) => x && x.precio).slice()
		.sort((a, b) => (aFecha(b.fecha) || 0) - (aFecha(a.fecha) || 0));
	const op = q('precios');
	hp.forEach((x, i) => {
		const li = document.createElement('li');
		li.className = `pp-precio${i > 0 ? ' pp-precio-anterior' : ''}`;
		const v = document.createElement('span');
		v.className = 'pp-precio-valor';
		v.textContent = precio(x.precio, x.moneda, p.operacion);
		const f = document.createElement('span');
		f.className = 'pp-precio-fecha';
		f.textContent = fecha(x.fecha, { day: 'numeric', month: 'short', year: 'numeric' });
		li.append(v, f);
		op.append(li);
	});
	lineaPrecio(hp, p, q('precios-grafica'));
	op.closest('.pp-bloque').hidden = !hp.length;

	// Portales
	const portales = p.portales || [];
	const ul = q('portales');
	for (const po of portales) {
		const li = document.createElement('li');
		const u = urlSegura(po.url);
		const el = document.createElement(u ? 'a' : 'span');
		el.className = 'pp-portal';
		el.textContent = po.nombre || '';
		if (u) {
			el.href = u; el.target = '_blank'; el.rel = 'noopener';
			el.append($('pp-tpl-iconos').content.querySelector('[data-tipo="externo"]').cloneNode(true));
		}
		li.append(el);
		ul.append(li);
	}
	ul.hidden = !portales.length;
	q('sin-portales').hidden = Boolean(portales.length);

	clientesDe(p, q);
	return nodo;
}

// ——— Cómo se anuncia ———
// Descripción del anuncio sin innerHTML: párrafos, saltos de línea, listas «- » y **negritas**.
function textoAnuncio(texto) {
	const frag = document.createDocumentFragment();
	for (const bloque of String(texto || '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
		let ul = null, par = null;
		for (const linea of bloque.split('\n').filter((x) => x.trim())) {
			const m = /^\s*[-*•]\s+(.*)$/.exec(linea);
			if (m) {
				if (!ul) { ul = el('ul', 'pp-anuncio-lista'); frag.append(ul); }
				par = null;
				const li = el('li');
				conNegritas(li, m[1]);
				ul.append(li);
			} else {
				ul = null;
				if (par) par.append(document.createElement('br'));
				else { par = el('p'); frag.append(par); }
				conNegritas(par, linea.trim().replace(/^#+\s*/, ''));
			}
		}
	}
	return frag;
}
function conNegritas(nodo, s) {
	s.split(/\*\*(.+?)\*\*/g).forEach((x, i) => {
		if (x) nodo.append(i % 2 ? el('strong', '', x) : document.createTextNode(x.replace(/\*\*/g, '')));
	});
}
const area = (m2) => (EN
	? `${Math.round(m2 * 10.7639).toLocaleString('en-US')} sq ft`
	: `${Number(m2).toLocaleString('es-GT')} m²`);
function dato(q, sel, texto) {
	const li = q(sel);
	li.hidden = !texto;
	if (texto) li.querySelector('span:last-child').textContent = texto;
}
function anuncio(p, q) {
	const a = p.anuncio || {};
	const en = EN && a.en ? a.en : null;
	const titulo = (en && en.titulo) || p.titulo || '';
	q('a-titulo').textContent = titulo;
	q('a-precio').textContent = precio(p.precio, p.moneda, p.operacion);
	const op = (T.operaciones || {})[p.operacion] || '';
	q('a-operacion').textContent = op ? ` · ${op}` : '';
	dato(q, 'a-tipo', (T.tipos || {})[a.tipo] || '');
	dato(q, 'a-ubicacion', [a.zona, a.ciudad].filter(Boolean).join(', '));
	const n = (v) => Number(v) || 0;
	dato(q, 'a-hab', n(a.habitaciones) ? (n(a.habitaciones) === 1 ? T.habUno : llenar(T.hab, { n: n(a.habitaciones) })) : '');
	dato(q, 'a-banos', n(a.banos) ? (n(a.banos) === 1 ? T.banosUno : llenar(T.banos, { n: n(a.banos) })) : '');
	dato(q, 'a-construccion', n(a.m2Construccion) ? llenar(T.construccion, { a: area(n(a.m2Construccion)) }) : '');
	dato(q, 'a-terreno', n(a.m2Terreno) ? llenar(T.terreno, { a: area(n(a.m2Terreno)) }) : '');
	const datos = q('a-tipo').parentElement;
	datos.hidden = ![...datos.children].some((li) => !li.hidden);

	const fotos = (Array.isArray(a.fotos) ? a.fotos : []).map(urlSegura).filter(Boolean).slice(0, 6);
	const ul = q('a-fotos');
	fotos.forEach((u, i) => {
		const li = el('li');
		const im = el('img');
		im.src = u; im.loading = 'lazy'; im.decoding = 'async';
		im.alt = llenar(T.fotoN, { n: i + 1 });
		li.append(im);
		ul.append(li);
	});
	ul.hidden = !fotos.length;

	const desc = (en && en.descripcion) || a.descripcion || '';
	q('a-desc').append(textoAnuncio(desc));
	q('a-desc-caja').hidden = !desc.trim();

	const url = urlSegura((en && en.url) || p.url);
	q('url').hidden = !url;
	if (url) q('url').href = url;
}

// ——— Respuesta del propietario: «Estoy de acuerdo» o «Quiero cambios» ———
let idCaja = 0;
function respuesta(p, q) {
	const n = ++idCaja;
	const form = q('c-form');
	const texto = q('c-texto');
	const btnCambios = q('r-cambios');
	const btnOk = q('r-ok');
	form.id = `pp-comentar-${n}`;
	texto.id = `pp-comentario-${n}`;
	q('c-label').htmlFor = texto.id;
	q('c-ayuda').id = `pp-comentario-ayuda-${n}`;
	texto.setAttribute('aria-describedby', q('c-ayuda').id);
	btnCambios.setAttribute('aria-controls', form.id);
	const okMsg = q('r-ok-msg'), err = q('r-error'), vivo = q('r-vivo');
	const ptl = p._portal || {};
	const puede = Boolean(ptl.token && p.id);
	if (!puede) { q('respuesta').hidden = true; return; }

	const avisar = (tipo, msg) => {
		okMsg.hidden = tipo !== 'ok';
		err.hidden = tipo !== 'error';
		q(tipo === 'ok' ? 'r-ok-texto' : 'r-error-texto').textContent = msg;
		vivo.textContent = msg;
	};
	const limpiar = () => { okMsg.hidden = true; err.hidden = true; vivo.textContent = ''; };
	const enviar = (tipo, txt) => addDoc(collection(db, 'comentariosPropietarios'), {
		token: ptl.token, propietarioId: ptl.propietarioId || '', agentId: ptl.agentId || '',
		propiedadId: String(p.id), tipo, texto: txt, fecha: serverTimestamp(),
		origen: 'propietario', idioma: EN ? 'en' : 'es'
	});

	btnCambios.addEventListener('click', () => {
		const abrir = form.hidden;
		form.hidden = !abrir;
		btnCambios.setAttribute('aria-expanded', String(abrir));
		limpiar();
		if (abrir) texto.focus();
	});
	btnOk.addEventListener('click', async () => {
		limpiar();
		btnOk.disabled = true;
		try {
			await enviar('aprobado', '');
			form.hidden = true;
			btnCambios.setAttribute('aria-expanded', 'false');
			avisar('ok', T.aprobadoOk);
		} catch (e) {
			console.warn('Portal: aprobación', e && e.code);
			avisar('error', T.comentarError);
		}
		btnOk.disabled = false;
	});
	form.addEventListener('submit', async (ev) => {
		ev.preventDefault();
		limpiar();
		const txt = texto.value.trim().slice(0, 2000);
		if (!txt) {
			texto.setAttribute('aria-invalid', 'true');
			avisar('error', T.comentarVacio);
			texto.focus();
			return;
		}
		texto.setAttribute('aria-invalid', 'false');
		const b = form.querySelector('button[type="submit"]');
		b.disabled = true;
		try {
			await enviar('cambios', txt);
			texto.value = '';
			form.hidden = true;
			btnCambios.setAttribute('aria-expanded', 'false');
			avisar('ok', T.comentarOk);
			btnCambios.focus();
		} catch (e) {
			console.warn('Portal: comentario', e && e.code);
			avisar('error', T.comentarError);
		}
		b.disabled = false;
	});
}

// ——— Cargar datos ———
async function porToken(token) {
	const s = await getDoc(doc(db, 'portalPropietarios', token));
	return s.exists() ? [{ ...s.data(), _token: token }] : [];
}
async function porCorreo(email) {
	const s = await getDocs(query(collection(db, 'portalPropietarios'), where('email', '==', email.toLowerCase())));
	return s.docs.map((d) => ({ ...d.data(), _token: d.id }));
}

let reintento = null;
async function cargar(fn, opts) {
	mostrar('pp-cargando');
	reintento = () => cargar(fn, opts);
	try {
		const datos = (await fn()).filter((d) => (d.propiedades || []).length);
		if (!datos.length) { mostrar('pp-vacio'); return; }
		pintar(datos, opts);
	} catch (e) {
		console.warn('Portal:', e);
		$('pp-error-texto').textContent = e && e.code === 'permission-denied'
			? (EN ? 'This link is no longer valid. Ask your agent for a new one or sign in with your email.' : 'Este enlace ya no es válido. Pide uno nuevo a tu asesor o entra con tu correo.')
			: T.errorTexto;
		mostrar('pp-error');
	}
}

// ——— Acceso por correo ———
function correoOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function marcarInvalido(input, invalido) {
	input.setAttribute('aria-invalid', invalido ? 'true' : 'false');
	const msg = document.getElementById(`${input.id}-error`);
	if (msg) msg.hidden = !invalido;
	if (invalido) input.focus();
}

$('pp-form-correo').addEventListener('submit', async (ev) => {
	ev.preventDefault();
	const input = $('pp-correo');
	const email = input.value.trim().toLowerCase();
	if (!correoOk(email)) { marcarInvalido(input, true); return; }
	marcarInvalido(input, false);
	const btn = ev.submitter || ev.target.querySelector('button');
	btn.disabled = true;
	try {
		await sendSignInLinkToEmail(auth, email, { url: `${location.origin}${location.pathname}`, handleCodeInApp: true });
		try { localStorage.setItem(CLAVE_CORREO, email); } catch { /* sin almacenamiento: se pedirá el correo al volver */ }
	} catch (e) {
		// No se dice si el correo existe o no: el mensaje es siempre el mismo.
		console.warn('Portal: envío del enlace', e && e.code);
	}
	$('pp-enviado').hidden = false;
	btn.disabled = false;
});

$('pp-form-confirmar').addEventListener('submit', async (ev) => {
	ev.preventDefault();
	const input = $('pp-correo2');
	const email = input.value.trim().toLowerCase();
	if (!correoOk(email)) { marcarInvalido(input, true); return; }
	marcarInvalido(input, false);
	await completarEnlace(email);
});

async function completarEnlace(email) {
	mostrar('pp-cargando');
	try {
		await signInWithEmailLink(auth, email, location.href);
		try { localStorage.removeItem(CLAVE_CORREO); } catch { /* nada */ }
		history.replaceState(null, '', location.pathname);
		// onAuthStateChanged carga el panel.
	} catch (e) {
		console.warn('Portal: enlace del correo', e && e.code);
		history.replaceState(null, '', location.pathname);
		$('pp-error-texto').textContent = EN
			? 'This sign-in link expired or was already used. Request a new one with your email.'
			: 'Este enlace de acceso venció o ya se usó. Pide uno nuevo con tu correo.';
		reintento = () => mostrar('pp-acceso');
		mostrar('pp-error');
	}
}

// ——— Botones generales ———
$('pp-reintentar').addEventListener('click', () => (reintento ? reintento() : location.reload()));
raiz.addEventListener('click', async (ev) => {
	const b = ev.target.closest('[data-pp-accion]');
	if (!b) return;
	if (b.dataset.ppAccion === 'salir') {
		if (auth && auth.currentUser) await signOut(auth).catch(() => {});
		history.replaceState(null, '', location.pathname);
		$('pp-enviado').hidden = true;
		$('pp-correo').value = '';
		mostrar('pp-acceso');
	} else if (b.dataset.ppAccion === 'correo') {
		history.replaceState(null, '', location.pathname);
		mostrar('pp-acceso');
	}
});

// ——— Arranque ———
async function iniciar() {
	try {
		await iniciarFirebase();
	} catch (e) {
		console.warn('Portal: Firebase', e);
		mostrar('pp-error');
		return;
	}
	const token = leerToken();
	if (token) {
		if (!tokenValido(token)) {
			$('pp-error-texto').textContent = EN ? 'This link is incomplete. Ask your agent to send it again.' : 'Este enlace está incompleto. Pide a tu asesor que te lo mande otra vez.';
			reintento = () => mostrar('pp-acceso');
			mostrar('pp-error');
			return;
		}
		await cargar(() => porToken(token), { conSesion: false });
		return;
	}
	if (isSignInWithEmailLink(auth, location.href)) {
		let email = '';
		try { email = localStorage.getItem(CLAVE_CORREO) || ''; } catch { /* nada */ }
		if (email) await completarEnlace(email);
		else mostrar('pp-confirmar');
	}
	let primera = true;
	onAuthStateChanged(auth, (user) => {
		if (user && user.email) {
			if (!user.emailVerified) { mostrar('pp-vacio'); return; }
			cargar(() => porCorreo(user.email), { conSesion: true });
		} else if (primera && $('pp-confirmar').hidden && $('pp-error').hidden) {
			mostrar('pp-acceso');
		}
		primera = false;
	});
}

iniciar();
