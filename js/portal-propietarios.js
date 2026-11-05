// Portal del propietario. Dos formas de entrar, ninguna con contraseña:
//  1. Enlace privado que manda el asesor por WhatsApp: /propietarios/#t=<token>.
//     El token (43 caracteres al azar) es el id del documento portalPropietarios/{token}.
//  2. Enlace al correo (Firebase «Correo electrónico sin contraseña»). Con la sesión iniciada
//     se buscan los portales cuyo campo email coincide con el correo verificado.
// Los datos ya vienen resumidos por el panel: sin nombres ni teléfonos de clientes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
	getAuth, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
	getFirestore, doc, getDoc, getDocs, collection, query, where
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
	nota: { es: 'Nota', en: 'Note' }
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

	for (const portal of portales) for (const prop of portal.propiedades || []) lista.append(tarjeta(prop));
	document.querySelector('#pp-panel [data-pp-accion="salir"]').hidden = !conSesion;
	mostrar('pp-panel');
}

function iconoTipo(tipo) {
	const tpl = $('pp-tpl-iconos').content;
	const el = tpl.querySelector(`[data-tipo="${TIPOS[tipo] ? tipo : 'nota'}"]`);
	return el.cloneNode(true);
}

function tarjeta(p) {
	const nodo = $('pp-tpl-prop').content.firstElementChild.cloneNode(true);
	const q = (sel) => nodo.querySelector(`[data-pp="${sel}"]`);
	const est = ESTADOS[p.estado] || ESTADOS.disponible;

	const img = q('foto');
	const foto = urlSegura(p.foto);
	if (foto) { img.src = foto; img.alt = p.titulo || ''; } else img.remove();
	q('estado').textContent = EN ? est.en : est.es;
	if (est.clase) q('estado').classList.add(est.clase);
	q('titulo').textContent = p.titulo || '';
	q('precio').textContent = precio(p.precio, p.moneda, p.operacion);

	const desde = aFecha(p.enMercadoDesde);
	const hasta = aFecha(p.enMercadoHasta) || new Date();
	const dias = desde ? Math.max(0, Math.floor((hasta - desde) / DIA)) : null;
	q('dias').textContent = dias === null ? '—' : String(dias);
	if (dias === 1) q('dias-texto').textContent = EN ? 'day on the market' : 'día en el mercado';
	const url = urlSegura(p.url);
	q('url').hidden = !url;
	if (url) q('url').href = url;

	const k = p.kpis || {};
	for (const clave of ['consultas', 'visitas', 'ofertas']) {
		q(clave).textContent = String(k[clave]?.total ?? 0);
		q(`${clave}30`).textContent = String(k[clave]?.d30 ?? 0);
	}
	const prox = Number(k.visitasProximas) || 0;
	q('proximas').hidden = !prox;
	q('proximas-texto').textContent = EN
		? `${prox} showing${prox === 1 ? '' : 's'} scheduled`
		: `${prox} visita${prox === 1 ? '' : 's'} agendada${prox === 1 ? '' : 's'}`;

	// Línea de tiempo
	const eventos = (p.eventos || []).filter((e) => e && e.texto);
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
		tx.textContent = e.texto;
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
	return nodo;
}

// ——— Cargar datos ———
async function porToken(token) {
	const s = await getDoc(doc(db, 'portalPropietarios', token));
	return s.exists() ? [s.data()] : [];
}
async function porCorreo(email) {
	const s = await getDocs(query(collection(db, 'portalPropietarios'), where('email', '==', email.toLowerCase())));
	return s.docs.map((d) => d.data());
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
