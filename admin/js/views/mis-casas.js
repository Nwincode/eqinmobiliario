// «Mis propiedades»: el panel del dueño (propietario o colaborador). Todas sus casas, de las tres categorías:
//  - por noche: las atiende él (precios, personas, días bloqueados y mínimos de noches; cada cambio queda en la
//    bitácora de la casa). Escribe SU precio; el del cliente (con el margen de EQ) lo calcula el sistema. Cada cambio
//    se guarda en una sola transacción sobre lo guardado AHORA (solo lo que cambió): su precio, el público y la
//    bitácora van juntos (las reglas exigen que el público cuadre con el suyo);
//    En «La casa» (#/mis-casas/{id}/casa) cambia lo que ve el huésped (fotos, textos, la casa, la estancia, su llegada,
//    sus calendarios y pausarla): lo guarda el servidor (netlify/functions/mi-casa.mjs), se publica solo y el
//    administrador recibe el aviso y lo puede deshacer (admin/js/mi-casa.js);
//  - en venta o renta: cómo va, solo lectura, desde su resumen (admin/js/resumen-casa.js).
// «Agregar casa» (con el permiso «Ingresar inmuebles»): sube una casa nueva de cualquier tipo con la ficha del inmueble
// (admin/js/views/properties.js en modo socio); la publica el servidor (netlify/functions/mi-casa-nueva.mjs).
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, collection, query, where, runTransaction, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, emptyState, mount, iconoBtn, flecha, dia, badge, formatPrice, elegirOpcion, confirmDialog, fallaDelServidor, botonNuevaCasa } from '../ui.js';
import { session, markPending, cargarMiResumen, misCasas } from '../session.js';
import { prefijoMoneda, decimales, nNoches, dineroPorMoneda, nombreMes, moverMes, dineroCorto } from '../formato.js';
import { filaCasa, publicUrl } from '../ficha-casa.js';
import { resumenCasa, cabeceraCasa, estadoCasa } from '../resumen-casa.js';
import { huespedesMaxDe } from '../cambios-casa.js';
import { guardarPrivadoVacacional, socioLimpio } from '../privado-casa.js';
import { anotar, bitacoraActiva } from '../bitacora-panel.js';
import { fotoCasa, igual } from '../bitacora.js';
// Los textos de la bitácora de la casa: solo los que dejan las reglas (texto-dueno.js).
import { rango, QUE_CADA, MOTIVOS_BLOQUEO, textoDueno, sinValores } from '../texto-dueno.js';
import { renderForm } from '../form.js';
import { CAMPOS_DUENO, HORAS, valoresDueno } from '../mi-casa.js';
import { permisosDelSocio, avisoSocio } from '../permisos-ui.js';
import { puede } from '../permisos-socio.js';
import { amenidadesPara } from '../estados.js';
import { apartaFechas } from '../reservas-calculo.js';
import { alDiaEnLaWeb, ocupacionDe } from '../reservas.js';
import { ms } from '../crm.js';
import { campoCalendarioEq } from '../calendario-eq.js';

const V = window.EQVacacional;
// Precio por noche más alto que se acepta (en quetzales cabe una casa grande; arriba es un cero de más).
const PRECIO_MAX = 50000;
const hoy = V.hoy; // la fecha de Guatemala, la misma del sitio y de las funciones
// «10 – 12 dic»; con el año cuando no es el de hoy (las temporadas que se repiten ya tienen varios años).
const mesTitulo = (mes) => { const t = nombreMes(mes); return t.charAt(0).toUpperCase() + t.slice(1); };
// Vuelve a pintar una caja: la vacía y le pone lo nuevo.
const repintar = (caja, ...hijos) => { caja.replaceChildren(); mount(caja, ...hijos); };
const porFecha = (a, b) => a.desde.localeCompare(b.desde);
// Precios especiales que cuentan: con fechas y precio válidos y que no han terminado (los que ya pasaron se quitan
// al guardar). Hasta 10 a la vez: las reglas revisan uno por uno que el público cuadre con el suyo, y más que eso pasa
// del límite de revisiones de Firestore por guardado (se probó: con 12 ya se rechaza). `cada` (si se repite) se conserva.
const MAX_TARIFAS = 10;
// Topes del calendario del dueño (los mismos de firestore.rules calendarioSano): personas 1 a 50 (huespedesMaxDe),
// mínimos de 1 a 30 noches, hasta 10 a la vez, y hasta 15 grupos de días bloqueados (lo que cabe en las reglas).
const MAX_MINIMOS = 10;
const MAX_BLOQUEOS = 15;
const vigentes = (lista) => (lista || []).filter((t) => t && V.esFecha(t.desde) && V.esFecha(t.hasta) && t.hasta >= t.desde && Number(t.precio) > 0 && t.hasta >= hoy())
	.map((t) => ({ desde: t.desde, hasta: t.hasta, precio: V.r2(Number(t.precio)), ...(t.cada ? { cada: t.cada, serie: t.serie } : {}) }));
// Temporadas que se repiten: se guardan este año y el siguiente (fechas de verdad, como cualquier otro precio); cada año
// de una misma temporada lleva la misma `serie`. Nada se escribe solo: si a una temporada le falta el año que viene, el
// panel lo avisa y el socio la pone con un toque (faltanTemporadas). Nunca encima de un precio o mínimo puesto aparte.
const ANIOS_ADELANTE = 1;
const nuevaSerie = () => Math.random().toString(36).slice(2, 10);
const seCruzan = (a, b) => a.desde <= b.hasta && b.desde <= a.hasta;
// Agrega las copias de los años siguientes donde no haya otra cosa puesta; devuelve { lista, saltadas }.
function agregarCopias(lista, copias) {
	const out = [...lista], saltadas = [];
	for (const c of copias) {
		if (out.some((x) => seCruzan(x, c))) saltadas.push(c);
		else out.push(c);
	}
	return { lista: out.sort((a, b) => a.desde.localeCompare(b.desde)), saltadas };
}
// La última de cada temporada que se repite y no llega al año que viene: [{ campo, ultima }].
function faltanTemporadas(e, hoyIso) {
	const meta = Number(hoyIso.slice(0, 4)) + ANIOS_ADELANTE;
	const out = [];
	for (const campo of ['tarifas', 'minimos']) {
		const ultimas = new Map();
		for (const x of e[campo].filter((r) => r.cada && r.serie)) if (!ultimas.has(x.serie) || x.desde > ultimas.get(x.serie).desde) ultimas.set(x.serie, x);
		for (const u of ultimas.values()) if (Number(u.desde.slice(0, 4)) < meta) out.push({ campo, ultima: u });
	}
	return out;
}
const mismoRango = (a, b) => a.desde === b.desde && a.hasta === b.hasta;
const enRango = (f, lista) => lista.some((r) => f >= r.desde && f < r.hasta);

// Casas en venta o renta que están en su resumen pero no dicen ser suyas (enlazadas solo desde su ficha): se
// muestran con lo que trae el resumen, en la misma ficha corta.
const desdeResumen = (x) => ({ id: x.id, titulo: x.titulo, operacion: x.operacion, precio: x.precio, moneda: x.moneda, publicado: Boolean(x.url),
	fotos: x.foto ? [{ url: x.foto }] : [], ...(x.anuncio || {}) });
const ORDEN = { venta: 0, renta: 1, vacacional: 2 };
const ic = (clase) => h('span', { class: `${clase} me-1`, 'aria-hidden': 'true' });
const volver = (texto) => iconoBtn('icon-arrow-left', texto, { href: '#/mis-casas', class: 'btn-toque btn-icono btn btn-link text-body' });

async function lista(container) {
	const [vivas, resumen, perm] = await Promise.all([misCasas(), cargarMiResumen(), permisosDelSocio(session.profile.propietarioId)]);
	const casas = [...vivas, ...(resumen?.propiedades || []).filter((x) => !vivas.some((c) => c.id === x.id)).map(desdeResumen)]
		.sort((a, b) => (ORDEN[a.operacion] ?? 3) - (ORDEN[b.operacion] ?? 3) || String(a.titulo).localeCompare(String(b.titulo)));
	const porNoche = casas.some((c) => c.operacion === 'vacacional');
	const filas = h('div', { class: 'lista-casas' });
	const pintar = (texto = '') => repintar(filas, casas
		.filter((c) => `${c.titulo} ${c.codigo || ''}`.toLowerCase().includes(texto.toLowerCase()))
		.map((c) => filaCasa(c, { href: `#/mis-casas/${c.id}`, marcas: [c.publicado ? null : badge('Sin publicar', 'light')] })));
	pintar();
	const ag = resumen?.asesor || {};
	// «Agregar casa»: la misma ficha del inmueble (admin/js/views/properties.js en modo socio), se publica al momento.
	const puedeAgregar = puede(perm, 'inmuebles');
	const agregar = puedeAgregar ? botonNuevaCasa('Agregar casa', { onclick: async () => {
		const { abrirFicha } = await import('./properties.js');
		abrirFicha('nuevo', { titulo: 'Agregar casa', alGuardar: () => { container.replaceChildren(); lista(container).catch(showError); } });
	} }) : null;
	mount(container,
		pageHeader('Mis propiedades', agregar),
		// Si algo está en pausa (p. ej. «Ingresar inmuebles» por atraso), por qué no está el botón.
		avisoSocio(perm),
		// Con casas por noche, sus datos de pago: se le mandan al cliente al confirmar una reserva.
		porNoche ? (resumen?.datosPago
			? h('p', { class: 'small text-muted' }, h('span', { class: 'icon-credit-card me-1', 'aria-hidden': 'true' }), 'Tus datos de pago (le llegan al cliente al confirmar): ', h('span', { class: 'text-body', style: 'white-space: pre-line' }, resumen.datosPago), '. ¿Cambiaron? Avísale al administrador.')
			: h('div', { class: 'alert alert-warning small' }, 'Faltan tus datos de pago: sin ellos no puedes confirmar reservas. Pídele al administrador que los guarde en tu ficha.')) : null,
		casas.some((c) => c.operacion !== 'vacacional') && ag.nombre ? h('p', { class: 'small text-muted' }, h('span', { class: 'icon-user me-1', 'aria-hidden': 'true' }), 'Tu asesor: ', h('strong', { class: 'text-body' }, ag.nombre)) : null,
		!casas.length ? emptyState(puedeAgregar ? 'Todavía no tienes propiedades. Sube la primera con «Agregar casa».' : 'Todavía no tienes propiedades asignadas. Escríbele a tu asesor y las activamos.') : [
			casas.length > 8 ? h('input', { class: 'form-control mb-3', type: 'search', placeholder: 'Buscar propiedad', 'aria-label': 'Buscar propiedad', oninput: (e) => pintar(e.target.value) }) : null,
			filas]);
}

// Una casa en venta o renta: cómo va, solo lectura, desde su resumen.
// «propia»: la casa dice ser suya; una enlazada solo desde su ficha se ve, pero su respuesta al anuncio la regla
// no la deja (la casa tiene que decir que es suya), así que no se ofrece.
async function enVenta(container, id, titulo, propia) {
	const resumen = await cargarMiResumen();
	const p = (resumen?.propiedades || []).find((x) => x.id === id);
	mount(container,
		h('div', { class: 'd-flex align-items-center gap-2 mb-3' }, volver('Volver a mis propiedades'), h('h1', { class: 'h4 mb-0' }, p?.titulo || titulo || 'Propiedad')),
		p ? resumenCasa(resumen, p, { responder: propia }) : emptyState('Tu asesor todavía está preparando el resumen de esta propiedad. Vuelve a entrar en un rato.'));
}

async function casa(container, id) {
	const refCasa = doc(db, 'properties', id);
	const refSocio = doc(db, 'properties', id, 'privado', 'socio');
	const mio = session.profile.propietarioId || '-';
	const sCasa = await getDoc(refCasa).catch(() => null);
	const suya = Boolean(sCasa?.exists()) && sCasa.data().propietarioId === mio;
	if (!sCasa?.exists() || sCasa.data().operacion !== 'vacacional') return enVenta(container, id, sCasa?.exists() ? sCasa.data().titulo : '', suya);
	if (!suya) return mount(container, emptyState('Esta casa no está a tu nombre.', h('a', { class: 'btn btn-primary', href: '#/mis-casas' }, 'Ver mis propiedades')));
	const [sSocio, sLeads, sReservas, perm, sMontos] = await Promise.all([getDoc(refSocio),
		// Solicitudes de sus casas: del chat de cada una (las solicitudes traen el contacto del cliente y el socio no las lee).
		getDocs(query(collection(db, 'chats'), where('propietarioId', '==', mio))),
		getDocs(query(collection(db, 'reservas'), where('propietarioId', '==', mio))).catch(() => null),
		// Lo que el administrador le apagó (o se apagó por atraso en la comisión): admin/js/permisos-socio.js.
		permisosDelSocio(mio),
		// Los montos que el servidor congeló (solo una solicitud cotizada a un precio válido aparta sus fechas: apartaFechas).
		getDocs(query(collection(db, 'montosSolicitud'), where('propietarioId', '==', mio))).catch(() => null)]);
	const montos = Object.fromEntries((sMontos?.docs || []).map((d) => [d.id, d.data()]));
	const puedePrecios = puede(perm, 'precios'), puedeFechas = puede(perm, 'fechas');
	const p = sCasa.data();
	// Lo que lleva esta casa: reservas confirmadas, noches y lo que le toca (la misma cuenta de Rentas vacacionales).
	const cuenta = V.resumenReservas((sReservas?.docs || []).map((d) => d.data()).filter((r) => r.propertyId === id));
	const s = sSocio.exists() ? sSocio.data() : {};
	const v = p.vacacional || {};
	const pre = prefijoMoneda(p.moneda || 'USD');
	const plata = (n) => `${pre}${decimales(n)}`;
	// En la casilla del día, el precio corto, como en el calendario del sitio (js/vacacional.js dineroCorto): el completo no cabe.
	const e = {
		base: Number(s.precioBase) || 0, finde: Number(s.precioFinde) || 0, tarifas: [...(s.tarifas || [])],
		bloqueos: V.unirRangos(v.bloqueos || []), minimos: [...(v.minimos || [])], reservadas: V.unirRangos(v.reservadas || []),
		huespedes: huespedesMaxDe(v.huespedesMax), mes: hoy().slice(0, 7), desde: '', hasta: '', pide: '',
		// Solicitudes de la web sin responder (todas: el aviso al bloquear y la cuenta de arriba) y, de ellas, las que
		// apartan sus fechas (dentro de sus 24 h: la misma regla de la página), las del ícono del calendario.
		abiertas: sLeads.docs.map((d) => d.data()).filter((c) => c.propertyId === id && c.llegada && !c.estado)
			.map((c) => ({ desde: c.llegada, hasta: c.salida, codigo: c.codigo, aparta: apartaFechas(c.estado, '', ms(c.createdAt), montos[c.leadId]) })),
		// Noches tomadas en Airbnb, Booking o VRBO (sus calendarios, leídos por /api/disponibilidad): llegan después.
		externas: []
	};
	ocupacionDe(id).then((o) => { if (o?.externas?.length) { e.externas = o.externas; calendario(); } });
	const plan = () => ({ base: e.base, finde: e.finde, tarifas: e.tarifas });
	const publico = (n) => plata(V.nochePublica(n, s.margen));

	// Un cambio del dueño: `cambio(actual)` dice qué campos quedan y cómo, calculado sobre lo guardado AHORA (otra
	// pestaña, el equipo o una reserva pudieron cambiar algo con esta pantalla abierta). Se escribe solo eso, en una
	// transacción: su precio (privado/socio), el público (con el margen vigente, que pone el equipo), lo demás de la
	// casa y la bitácora. `descripcion(antes, ahora)` da el texto de su renglón (texto-dueno.js) con los valores leídos aquí.
	// Si no cambia nada (el mismo precio otra vez, días ya bloqueados), no se escribe nada: ni la casa ni el renglón.
	// Devuelve true si quedó guardado (o ya estaba así); la pantalla se pone al día con lo que quedó. La casa nombra su
	// renglón en `bitacoraTexto` (las reglas solo dejan ese renglón en el lote). Con las reglas de antes se reintenta:
	// `intento` 1, sin nombrarlo (las reglas que aún no conocen el campo); 2, además sin los valores (sinValores).
	async function guardar(descripcion, cambio, intento = 0) {
		const conValores = intento < 2;
		let sinPrecioPropio = false, texto = '';
		try {
			const conBitacora = await bitacoraActiva();
			const r = await runTransaction(db, async (tx) => {
				const [c, so] = await Promise.all([tx.get(refCasa), tx.get(refSocio)]);
				sinPrecioPropio = !so.exists();
				const cv = c.data()?.vacacional || {}, sv = so.exists() ? so.data() : {};
				const actual = { base: Number(sv.precioBase) || 0, finde: Number(sv.precioFinde) || 0, tarifas: sv.tarifas || [],
					bloqueos: V.unirRangos(cv.bloqueos || []), minimos: cv.minimos || [], huespedes: huespedesMaxDe(cv.huespedesMax) };
				const nuevo = cambio(actual);
				// Lo de antes como lo ve el dueño (sin lo ya pasado), para saber si algo cambió.
				const previo = { ...actual, bloqueos: actual.bloqueos.filter((b) => b.hasta > hoy()), minimos: actual.minimos.filter((m) => m.hasta >= hoy()), tarifas: vigentes(actual.tarifas) };
				const casa = {};
				// Lo que ya pasó no se guarda, y cada lista tiene su tope (el mismo de firestore.rules calendarioSano). Con más
				// (de antes), solo se puede quitar: las reglas lo revisan así (más corta y con lo que ya tenía).
				const tope = (campo, lista, max, texto) => {
					const antes = campo === 'bloqueos' ? cv.bloqueos || [] : cv.minimos || [];
					const tenia = (x) => antes.some((a) => mismoRango(a, x) && (campo === 'bloqueos' || a.noches === x.noches));
					if (lista.length > max && !(lista.every(tenia) && lista.length < antes.length)) throw new Error(texto);
					return lista;
				};
				if ('bloqueos' in nuevo) casa['vacacional.bloqueos'] = nuevo.bloqueos = tope('bloqueos', nuevo.bloqueos.filter((b) => b.hasta > hoy()), MAX_BLOQUEOS,
					`Hasta ${MAX_BLOQUEOS} grupos de días bloqueados a la vez: habilita alguno antes de bloquear otro.`);
				if ('minimos' in nuevo) casa['vacacional.minimos'] = nuevo.minimos = tope('minimos', nuevo.minimos.filter((m) => m.hasta >= hoy()), MAX_MINIMOS,
					`Hasta ${MAX_MINIMOS} mínimos de noches a la vez: quita uno antes de poner otro.`);
				if ('huespedes' in nuevo) casa['vacacional.huespedesMax'] = nuevo.huespedes;
				// Con más de 10 (de antes) solo se puede quitar: se guardan las mismas listas sin las quitadas, tal como
				// estaban (las reglas lo revisan así: más cortas y con lo que ya tenían).
				let soloQuita = false;
				if ('tarifas' in nuevo) {
					nuevo.tarifas = vigentes(nuevo.tarifas);
					const tenia = (x) => actual.tarifas.some((t) => mismoRango(t, x));
					soloQuita = nuevo.tarifas.length > MAX_TARIFAS;
					if (soloQuita && !(nuevo.tarifas.every(tenia) && nuevo.tarifas.length < (sv.tarifas || []).length)) throw new Error(`Hasta ${MAX_TARIFAS} precios especiales a la vez: quita uno antes de poner otro.`);
				}
				// Nada cambió: se sale antes de escribir (la transacción no deja nada).
				if (Object.keys(nuevo).every((k) => igual(nuevo[k], previo[k]))) return { ...actual, margen: sv.margen, sinCambio: true };
				if (['base', 'finde', 'tarifas'].some((k) => k in nuevo)) {
					const plan = { base: actual.base, finde: actual.finde, tarifas: vigentes(actual.tarifas), ...nuevo };
					const pub = V.planPublico(plan, sv.margen);
					const suyo = {};
					if ('base' in nuevo) { suyo.precioBase = plan.base; casa['vacacional.base'] = pub.base; }
					if ('finde' in nuevo) { suyo.precioFinde = plan.finde; casa['vacacional.finde'] = pub.finde; }
					const queda = (t) => nuevo.tarifas.some((x) => mismoRango(t, x));
					if ('tarifas' in nuevo) {
						suyo.tarifas = soloQuita ? (sv.tarifas || []).filter(queda) : plan.tarifas;
						casa['vacacional.tarifas'] = soloQuita ? (cv.tarifas || []).filter(queda) : pub.tarifas;
					}
					casa.precio = V.precioDesde(pub, hoy()) || null;
					// Sus precios cambian: renglón en la bitácora de cambios sensibles, en esta misma transacción.
					const bitacoraId = anotar(tx, { tipo: 'casa', objeto: id, casa: id, antes: fotoCasa(c.data(), sv), despues: fotoCasa(c.data(), { ...sv, ...socioLimpio(suyo) }) }, conBitacora);
					await guardarPrivadoVacacional(id, suyo, null, tx, { bitacoraId });
				}
				texto = conValores ? descripcion(previo, nuevo) : sinValores(descripcion(previo, nuevo));
				const renglon = doc(collection(refCasa, 'bitacora'));
				tx.update(refCasa, { ...casa, ...(intento === 0 ? { bitacoraTexto: renglon.id } : {}), updatedAt: serverTimestamp() });
				tx.set(renglon, { que: texto, quien: session.user.uid, nombre: session.profile.nombre || '', cuando: serverTimestamp() });
				return { ...actual, ...nuevo, margen: sv.margen };
			});
			Object.assign(e, { base: r.base, finde: r.finde, tarifas: [...r.tarifas], bloqueos: r.bloqueos, minimos: [...r.minimos], huespedes: r.huespedes });
			s.margen = r.margen;
			if (r.sinCambio) { toast('Ya estaba así: no hubo nada que guardar.'); return true; }
			// Sin los valores: el aviso lo lee todo el equipo y el precio del dueño no (texto-dueno.js sinValores).
			markPending(`${p.titulo}: ${sinValores(texto)}`).catch((err) => console.warn('Aviso de cambios sin publicar', err));
			alDiaEnLaWeb(id);
			toast('Guardado.');
			return true;
		} catch (err) {
			// Las reglas de antes (el sitio se publica primero) niegan el renglón con valores: otra vez, sin ellos.
			if (err?.code === 'permission-denied' && intento === 0) return await guardar(descripcion, cambio, 1);
			if (err?.code === 'permission-denied' && intento === 1 && texto !== sinValores(texto)) return await guardar(descripcion, cambio, 2);
			// Casa por noche sin su precio guardado todavía: con las reglas de antes el dueño no puede crearlo.
			if (sinPrecioPropio && err?.code === 'permission-denied') toast('Esta casa todavía no tiene tu precio registrado. Pídele al administrador que lo ponga en la ficha de la casa; después ya puedes cambiarlo aquí.', 'warning');
			else showError(err);
			return false;
		}
		finally { e.guardando = false; pintar(); }
	}

	// ------------------------------------------------------------ Precios de siempre
	const precio = (campo, titulo, ayuda) => {
		const ve = h('div', { class: 'form-text' });
		const pinta = () => { ve.textContent = e[campo] ? `El cliente ve ${publico(e[campo])}` : ayuda; };
		pinta();
		return h('div', { class: 'col-6' },
			h('label', { class: 'form-label', for: `mc-${campo}` }, titulo),
			h('div', { class: 'input-group' }, h('span', { class: 'input-group-text' }, pre.trim()),
				h('input', {
					class: 'form-control', id: `mc-${campo}`, type: 'number', inputmode: 'decimal', min: '0', value: e[campo] || '', disabled: !puedePrecios,
					onchange: async (ev) => {
						const n = V.r2(Math.max(0, Number(ev.target.value) || 0));
						if (campo === 'base' && !n) { ev.target.value = e.base || ''; return toast('Escribe el precio por noche.', 'warning'); }
						if (n > PRECIO_MAX) { ev.target.value = e[campo] || ''; return toast(`Revisa el precio: ${plata(n)} por noche es demasiado.`, 'warning'); }
						// Un cero de más (de 120 a 1200): se pregunta antes de que el cliente lo vea.
						const antes = Number(e[campo]) || (campo === 'finde' ? Number(e.base) : 0);
						if (antes > 0 && n > 5 * antes && !(await confirmDialog(`${plata(n)} por noche es ${Math.round(n / antes)} veces lo que tenías (${plata(antes)}). ¿Es correcto?`, { okText: 'Sí, es correcto', danger: false }))) { ev.target.value = e[campo] || ''; return; }
						guardar((a, b) => textoDueno.precio(titulo, a[campo], b[campo], p.moneda), () => ({ [campo]: n })).then(() => { ev.target.value = e[campo] || ''; pinta(); });
					}
				})), ve);
	};

	// ------------------------------------------------------------ Calendario
	const cal = h('div', { class: 'card card-body mb-3' });
	// Sin permiso de precios, los precios especiales y mínimos se ven pero no se tocan.
	const listas = h('div', { class: puedePrecios ? '' : 'perm-off' });

	function tocar(f) {
		if (e.desde && e.desde === e.hasta && f > e.desde) e.hasta = f;
		else { e.desde = f; e.hasta = f; }
		e.pide = '';
		calendario();
	}
	const soltar = () => { e.desde = ''; e.hasta = ''; e.pide = ''; };

	// cada: '' (solo estas fechas), 'fecha' o 'semanaSanta' (se repite: este año y el siguiente).
	// Mientras se guarda, la barra no ofrece nada (un segundo toque no vuelve a guardar sin días elegidos).
	function aplicar(que, valor, cada = '') {
		const { desde, hasta } = e;
		if (!desde || !hasta || e.guardando) return;
		const fin = V.sumarDias(hasta, 1);
		const serie = cada ? nuevaSerie() : '';
		let saltadas = [];
		// Precio o mínimo en estas fechas, sobre lo que hubiera ahí; y, si se repite, el año siguiente donde no haya nada.
		const poner = (lista, dato) => {
			const base = { desde, hasta, ...dato, ...(cada ? { cada, serie } : {}) };
			const r = agregarCopias([...V.quitarRango(lista, desde, hasta), base], cada ? V.repetirRango(base, cada, ANIOS_ADELANTE) : []);
			saltadas = r.saltadas;
			return r.lista;
		};
		const cambio = {
			bloquear: (a) => ({ bloqueos: V.unirRangos([...a.bloqueos, { desde, hasta: fin }]) }),
			habilitar: (a) => ({ bloqueos: V.liberarNoches(a.bloqueos, desde, fin) }),
			precio: (a) => ({ tarifas: poner(a.tarifas, { precio: valor }) }),
			minimo: (a) => ({ minimos: poner(a.minimos, { noches: valor }) })
		}[que];
		soltar();
		e.guardando = true;
		calendario();
		guardar(() => textoDueno.calendario(que, { desde, hasta }, valor, cada, p.moneda), cambio)
			.then((ok) => { if (ok && saltadas.length) toast(`En ${saltadas.map((x) => rango(x)).join(', ')} ya tenías algo puesto: lo dejé como estaba.`, 'warning'); });
	}

	// Barra que aparece al elegir días: cuatro acciones de ícono y, si hace falta, un número.
	function barra() {
		if (!puedePrecios && !puedeFechas) return h('p', { class: 'vac-ayuda mb-0' }, ic('icon-lock'), 'Las fechas y los precios están en pausa.');
		if (e.guardando) return h('p', { class: 'vac-ayuda mb-0', role: 'status' }, ic('icon-refresh'), 'Guardando…');
		if (!e.desde) return h('p', { class: 'vac-ayuda mb-0' }, `Toca un día (y otro para marcar varios) para ${[puedeFechas ? 'bloquear, habilitar' : '', puedePrecios ? 'cambiar el precio' : ''].filter(Boolean).join(' o ')}.`);
		const cerrar = iconoBtn('icon-close', 'Cancelar', { onclick: () => { e.pide = ''; calendario(); } });
		// Bloquear pide el motivo: un toque. Si una solicitud sin responder pidió esos días, se dice (sigue esperando respuesta).
		const pedida = e.pide === 'motivo' && e.abiertas.find((x) => x.desde <= e.hasta && x.hasta > e.desde);
		if (e.pide === 'motivo') return h('div', { class: 'mc-barra' },
			h('strong', { class: 'd-block mb-1' }, `Bloquear · ${rango(e)}`),
			pedida ? h('p', { class: 'small text-danger mb-1' }, ic('icon-clock-o'), `${pedida.codigo || 'Una solicitud'} pidió estos días y sigue sin respuesta: respóndela en Solicitudes.`) : null,
			h('div', { class: 'd-flex flex-wrap gap-2' },
				MOTIVOS_BLOQUEO.map((t) => h('button', { type: 'button', class: 'btn-toque btn btn-sm btn-outline-secondary', onclick: () => aplicar('bloquear', t) }, t)),
				cerrar));
		if (e.pide) {
			const esPrecio = e.pide === 'precio';
			// Lo que ya tenían esos días (al volver a abrirlo, se ve y se cambia; no aparece vacío).
			const yaPuesto = (esPrecio ? e.tarifas : e.minimos).find((t) => t.desde <= e.desde && t.hasta >= e.hasta);
			const ve = h('div', { class: 'form-text' }, esPrecio ? 'Tu precio por noche en esos días.' : 'Noches mínimas si la estancia toca esos días.');
			const campo = h('input', {
				class: 'form-control', type: 'number', inputmode: esPrecio ? 'decimal' : 'numeric', min: '1', max: esPrecio ? String(PRECIO_MAX) : '30', 'aria-label': esPrecio ? 'Precio por noche' : 'Mínimo de noches',
				oninput: (ev) => { if (esPrecio) ve.textContent = Number(ev.target.value) > 0 ? `El cliente ve ${publico(ev.target.value)}` : 'Tu precio por noche en esos días.'; }
			});
			if (yaPuesto) { campo.value = String(esPrecio ? yaPuesto.precio : yaPuesto.noches); campo.dispatchEvent(new Event('input')); }
			// ¿Se repite cada año? En la misma barra (sin otra ventana). En Semana Santa, que cambia de fecha, se ofrece seguirla.
			const repite = h('select', { class: 'form-select form-select-sm mt-2', 'aria-label': '¿Se repite cada año?' },
				[['', 'Solo estas fechas'], ['fecha', 'Cada año en estas fechas'], ...(V.tocaSemanaSanta(e) ? [['semanaSanta', 'Cada año en Semana Santa (cambia de fecha sola)']] : [])]
					.map(([v, t]) => h('option', { value: v }, t)));
			if (yaPuesto?.cada) repite.value = yaPuesto.cada;
			const pide = e.pide;
			const listo = async () => {
				const n = esPrecio ? V.r2(Number(campo.value) || 0) : Math.floor(Number(campo.value) || 0);
				if (n < 1) return toast(esPrecio ? 'Escribe el precio.' : 'Escribe cuántas noches.', 'warning');
				if (!esPrecio && n > 30) return toast('El mínimo llega hasta 30 noches.', 'warning');
				if (esPrecio && n > PRECIO_MAX) return toast(`Revisa el precio: ${plata(n)} por noche es demasiado.`, 'warning');
				// Un cero de más pasa fácil: arriba de 5 veces el precio de siempre, se pregunta.
				if (esPrecio && e.base > 0 && n > 5 * e.base && !(await confirmDialog(`${plata(n)} por noche es ${Math.round(n / e.base)} veces tu precio de siempre (${plata(e.base)}). ¿Es correcto?`, { okText: 'Sí, es correcto', danger: false }))) return;
				// Tras la pregunta, la selección pudo cambiar (otro toque o «Cancelar»): solo se guarda si sigue la misma.
				if (e.pide !== pide) return;
				aplicar(pide, n, repite.value);
			};
			campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') listo(); });
			setTimeout(() => campo.focus());
			return h('div', { class: 'mc-barra' },
				h('strong', { class: 'd-block mb-1' }, `${esPrecio ? 'Precio especial' : 'Mínimo de noches'} · ${rango(e)}`),
				h('div', { class: 'd-flex gap-2' },
					h('div', { class: 'input-group' }, esPrecio ? h('span', { class: 'input-group-text' }, pre.trim()) : null, campo, esPrecio ? null : h('span', { class: 'input-group-text' }, 'noches')),
					iconoBtn('icon-check', 'Guardar', { class: 'btn-toque btn-icono btn btn-primary', onclick: listo }),
					cerrar),
				ve, repite);
		}
		// «Habilitar» solo si entre esos días hay alguno bloqueado (en días libres no hace nada).
		const hayBloqueo = e.bloqueos.some((b) => b.desde <= e.hasta && b.hasta > e.desde);
		return h('div', { class: 'mc-barra d-flex align-items-center gap-2' },
			h('strong', { class: 'flex-grow-1' }, rango(e)),
			puedeFechas ? iconoBtn('icon-lock', 'Bloquear estos días', { onclick: () => { e.pide = 'motivo'; calendario(); } }) : null,
			puedeFechas && hayBloqueo ? iconoBtn('icon-unlock', 'Habilitar estos días', { onclick: () => aplicar('habilitar') }) : null,
			puedePrecios ? iconoBtn('icon-tag', 'Precio especial', { onclick: () => { e.pide = 'precio'; calendario(); } }) : null,
			puedePrecios ? iconoBtn('icon-moon-o', 'Mínimo de noches', { onclick: () => { e.pide = 'minimo'; calendario(); } }) : null,
			iconoBtn('icon-close', 'Quitar la selección', { class: 'btn-toque btn-icono btn btn-link text-body', onclick: () => { soltar(); calendario(); } }));
	}

	function calendario() {
		const [a, m] = e.mes.split('-').map(Number);
		const dias = new Date(a, m, 0).getDate();
		const vacias = new Date(a, m - 1, 1).getDay(); // semana de domingo a sábado, como el calendario del sitio
		const celdas = [...Array(vacias).fill(null), ...Array.from({ length: dias }, (_, i) => `${e.mes}-${String(i + 1).padStart(2, '0')}`)];
		const celda = (f) => {
			if (!f) return h('td', {});
			const pasado = f < hoy();
			const reservada = enRango(f, e.reservadas);
			const bloqueado = enRango(f, e.bloqueos);
			const externa = !reservada && !bloqueado && enRango(f, e.externas);
			const estado = reservada ? 'reservado' : bloqueado ? 'bloqueado' : externa ? 'reservado en otra plataforma' : '';
			const pedida = !estado && enRango(f, e.abiertas.filter((x) => x.aparta));
			const clases = ['vac-dia', f === hoy() && 'is-hoy', estado && 'is-ocupado',
				e.desde && f === e.desde && 'is-llegada', e.desde && f === e.hasta && 'is-salida', f > e.desde && f < e.hasta && 'is-rango'].filter(Boolean).join(' ');
			return h('td', {}, h('button', {
				type: 'button', class: clases, 'aria-disabled': pasado ? 'true' : null, 'aria-pressed': e.desde && f >= e.desde && f <= e.hasta ? 'true' : null,
				'aria-label': `${dia(f)}${estado ? `, ${estado}` : pedida ? ', solicitado' : ''}`, onclick: pasado ? null : () => tocar(f)
			},
			h('span', { class: 'vac-dia-num' }, Number(f.slice(8))),
			estado || pedida ? h('span', { class: `vac-dia-precio ${reservada ? 'icon-bed' : bloqueado ? 'icon-lock' : externa ? 'icon-globe' : 'icon-clock-o'}`, 'aria-hidden': 'true' })
				: h('span', { class: 'vac-dia-precio' }, dineroCorto(V.precioNoche(f, plan()), p.moneda))));
		};
		const semanas = [];
		for (let i = 0; i < celdas.length; i += 7) semanas.push(h('tr', {}, celdas.slice(i, i + 7).map(celda)));
		repintar(cal,
			h('div', { class: 'vac-cal-cabecera' },
				flecha('prev', 'Mes anterior', () => { e.mes = moverMes(e.mes, -1); calendario(); }, e.mes <= hoy().slice(0, 7)),
				h('h2', { class: 'vac-cal-mes' }, mesTitulo(e.mes)),
				flecha('next', 'Mes siguiente', () => { e.mes = moverMes(e.mes, 1); calendario(); })),
			h('table', { class: 'vac-cal-tabla' },
				h('thead', {}, h('tr', {}, ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d) => h('th', { scope: 'col' }, d)))),
				h('tbody', {}, semanas)),
			h('p', { class: 'small text-muted my-2' },
				h('span', { class: 'icon-lock', 'aria-hidden': 'true' }), ' Bloqueado  ·  ', h('span', { class: 'icon-bed', 'aria-hidden': 'true' }), ' Reservado  ·  ',
				e.externas.length ? [h('span', { class: 'icon-globe', 'aria-hidden': 'true' }), ' Airbnb, Booking o VRBO  ·  '] : null,
				h('span', { class: 'icon-clock-o', 'aria-hidden': 'true' }), ' Solicitado  ·  El precio es el tuyo, sin la comisión.'),
			barra());
	}

	// ------------------------------------------------------------ Listas de lo especial
	const grupo = (titulo, campo, texto) => {
		const vigentes = e[campo].filter((r) => r.hasta >= hoy());
		if (!vigentes.length) return null;
		return h('div', { class: 'mb-3' },
			h('h2', { class: 'h6' }, titulo),
			h('ul', { class: 'list-group' }, vigentes.map((r) => h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
				h('span', { class: 'flex-grow-1' }, h('strong', {}, rango(r)), h('span', { class: 'd-block small text-muted' }, texto(r),
					r.cada ? [' · ', ic('icon-repeat'), QUE_CADA[r.cada]] : null)),
				iconoBtn('icon-trash', `Quitar ${titulo.toLowerCase()} ${rango(r)}`, {
					onclick: async () => {
						// Si se repite cada año: quitar solo este año o todos.
						const todos = r.cada ? (await elegirOpcion('¿Quitar solo este año o todos?', ['Solo este año', 'Todos los años'])) : 'Solo este año';
						if (!todos) return;
						const quita = todos === 'Todos los años' ? (x) => (r.serie && x.serie === r.serie) || mismoRango(x, r) : (x) => mismoRango(x, r);
						guardar(() => textoDueno.quito(titulo, r, todos === 'Todos los años'), (a) => ({ [campo]: a[campo].filter((x) => !quita(x)) }));
					}
				})))));
	};
	// Cabecera (foto, estado, lo que ve el cliente, reservas): se repinta con cada cambio de precio.
	const cabecera = h('div');
	const pintarCabecera = () => repintar(cabecera,
		cabeceraCasa({ foto: p.fotos?.[0]?.url, titulo: p.titulo, precio: formatPrice(V.precioDesde(V.planPublico(plan(), s.margen), hoy()) || p.precio, p.moneda, p.operacion),
			insignias: [estadoCasa(p), p.publicado ? null : badge('Sin publicar', 'light')],
			lineas: [
				h('li', { class: 'text-muted' }, ic('icon-eye'), 'Lo que ve el cliente por noche, sin impuestos'),
				h('li', {}, ic('icon-calendar-check-o'), cuenta.reservas
					? [`${cuenta.reservas} ${cuenta.reservas === 1 ? 'reserva confirmada' : 'reservas confirmadas'} · ${nNoches(cuenta.noches)} · tu parte: `,
						h('strong', {}, dineroPorMoneda(Object.fromEntries(Object.entries(cuenta.porMoneda).map(([m, x]) => [m, x.costoSocio]))))]
					: 'Todavía sin reservas confirmadas'),
				e.abiertas.length ? h('li', {}, h('a', { href: '#/solicitudes' }, ic('icon-clock-o'), `${e.abiertas.length} ${e.abiertas.length === 1 ? 'solicitud sin responder' : 'solicitudes sin responder'}`)) : null,
				p.publicado && p.slug ? h('li', {}, h('a', { href: publicUrl(p), target: '_blank', rel: 'noopener' }, ic('icon-external-link'), 'Ver el anuncio en la página')) : null] }));
	// Temporadas que se repiten y que todavía no tienen el año que viene: aviso con un botón (nada se escribe solo).
	function avisoTemporadas() {
		const faltan = faltanTemporadas(e, hoy());
		if (!faltan.length || !puedePrecios) return null;
		const anio = Number(hoy().slice(0, 4)) + ANIOS_ADELANTE;
		const poner = () => {
			let saltadas = [];
			guardar(() => textoDueno.temporadas(anio), (a) => {
				const out = {};
				saltadas = [];
				for (const campo of ['tarifas', 'minimos']) {
					const copias = faltanTemporadas({ tarifas: a.tarifas, minimos: a.minimos }, hoy()).filter((f) => f.campo === campo)
						.flatMap((f) => V.repetirRango(f.ultima, f.ultima.cada, anio - Number(f.ultima.desde.slice(0, 4))).filter((c) => Number(c.desde.slice(0, 4)) <= anio));
					if (!copias.length) continue;
					const r = agregarCopias(a[campo], copias);
					saltadas.push(...r.saltadas);
					out[campo] = r.lista;
				}
				return out;
			}).then((ok) => { if (ok && saltadas.length) toast(`En ${saltadas.map((x) => rango(x)).join(', ')} ya tenías algo puesto: lo dejé como estaba.`, 'warning'); });
		};
		return h('div', { class: 'alert alert-info d-flex align-items-center gap-2 mb-3', role: 'status' },
			ic('icon-repeat'),
			h('span', { class: 'flex-grow-1' }, `Faltan tus temporadas de ${anio}: `, faltan.map((f) => rango(f.ultima)).join(', '), '.'),
			h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: poner }, 'Ponerlas'));
	}
	function pintar() {
		pintarCabecera();
		calendario();
		repintar(listas,
			avisoTemporadas(),
			grupo('Precios especiales', 'tarifas', (r) => `${plata(r.precio)} por noche · el cliente ve ${publico(r.precio)}`),
			grupo('Mínimos de noches', 'minimos', (r) => `${r.noches} noches como mínimo`));
	}

	pintar();
	mount(container,
		h('div', { class: 'd-flex align-items-center gap-2 mb-3' }, volver('Volver a mis propiedades'), h('h1', { class: 'h4 mb-0' }, p.titulo)),
		avisoSocio(perm),
		pestanas(id, 'calendario'),
		// La misma cabecera que la casa en venta: foto, estado, lo que ve el cliente, sus reservas y su anuncio.
		cabecera,
		// En computadora: precios y lo especial a la izquierda, el calendario a la derecha (sin un calendario de 900 px).
		h('div', { class: 'row gx-3' }, h('div', { class: 'col-lg-5' }, h('div', { class: 'card card-body mb-3' }, h('div', { class: 'row g-3' },
			precio('base', 'Entre semana', 'Tu precio por noche.'),
			precio('finde', 'Fin de semana', 'Vacío: igual que entre semana.'),
			h('div', { class: 'col-6' },
				h('label', { class: 'form-label', for: 'mc-huespedes' }, 'Personas máximo'),
				h('input', {
					class: 'form-control', id: 'mc-huespedes', type: 'number', inputmode: 'numeric', min: '1', max: '50', value: e.huespedes || '', disabled: !puedePrecios,
					// La misma regla que la ficha del inmueble: al menos 1 (vacío no es «sin límite»).
					onchange: (ev) => { const n = huespedesMaxDe(ev.target.value); guardar((a) => textoDueno.personas(n, a.huespedes), () => ({ huespedes: n })).then(() => { ev.target.value = e.huespedes; }); }
				})))), listas),
			h('div', { class: 'col-lg-7' }, cal)));
}

// Las dos partes de una casa por noche: su calendario (precios, bloqueos, mínimos) y lo que ve el huésped.
const pestanas = (id, activa) => h('ul', { class: 'nav nav-tabs mb-3' },
	[['calendario', 'Calendario y precios', 'icon-calendar', `#/mis-casas/${id}`], ['casa', 'La casa', 'icon-home2', `#/mis-casas/${id}/casa`]].map(([k, t, icono, href]) =>
		h('li', { class: 'nav-item' }, h('a', { class: `nav-link${k === activa ? ' active' : ''}`, href, 'aria-current': k === activa ? 'page' : null }, ic(icono), t))));

// Lo que el dueño cambia él solo (admin/js/mi-casa.js); el formulario es el mismo de la ficha (renderForm).
const SI_NO = [['', 'Sin indicar'], ['si', 'Se aceptan'], ['no', 'No se aceptan']];
const esquemaCasa = (id) => [
	{ type: 'section', label: 'Fotos', help: 'La primera es la portada. Arrastra para ordenar.' },
	{ name: 'fotos', label: 'Fotos', type: 'images', marca: true, marcaFija: true },
	{ type: 'section', label: 'Lo que lee el huésped', help: 'Sin enlaces, correos ni teléfonos: el huésped recibe tu contacto al confirmar.' },
	{ name: 'titulo', label: 'Título', maxlength: 90, required: true },
	{ name: 'descripcion', label: 'Descripción', type: 'textarea', rows: 6, required: true },
	{ name: 'amenidades', label: 'Amenidades', type: 'tags', placeholder: 'Escribe otra y presiona Enter', sugerencias: () => amenidadesPara('vacacional') },
	{ type: 'section', label: 'La casa' },
	{ name: 'habitaciones', label: 'Habitaciones', type: 'number', min: 0, max: 50, cols: 3 },
	{ name: 'camas', label: 'Camas', type: 'number', min: 0, max: 100, cols: 3 },
	{ name: 'banos', label: 'Baños', type: 'number', min: 0, max: 50, step: 0.5, cols: 3 },
	{ name: 'parqueos', label: 'Parqueos', type: 'number', min: 0, max: 50, cols: 3 },
	{ type: 'section', label: 'La estancia' },
	{ name: 'checkIn', label: 'Hora de entrada', type: 'select', options: HORAS.map((x) => [x, x]), cols: 3 },
	{ name: 'checkOut', label: 'Hora de salida', type: 'select', options: HORAS.map((x) => [x, x]), cols: 3 },
	{ name: 'deposito', label: 'Depósito (se devuelve)', type: 'number', min: 0, max: 50000, step: 0.01, cols: 3 },
	{ name: 'mascotas', label: 'Mascotas', type: 'select', options: SI_NO, cols: 3 },
	{ name: 'cancelacion', label: 'Cancelación', type: 'textarea', rows: 2, cols: 6, help: 'Vacío: la política general del sitio.' },
	{ name: 'reglas', label: 'Reglas de la casa (una por línea)', type: 'textarea', rows: 3, cols: 6, help: 'Vacío: las reglas generales del sitio.' },
	{ name: 'comoLlegar', label: 'Cómo llegar', type: 'textarea', rows: 3, cols: 6 },
	{ type: 'section', label: 'Llegada (privada)', help: 'El huésped la recibe por el chat cuando marcas su pago; nunca sale en la página.' },
	{ name: 'direccion', label: 'Dirección', cols: 6 },
	{ name: 'mapa', label: 'Mapa', cols: 6, placeholder: 'Enlace de Google Maps', help: 'En Google Maps: Compartir → Copiar vínculo.' },
	{ type: 'section', label: 'Tus calendarios', help: 'Pega el enlace iCal de cada plataforma: las fechas ocupadas allá se bloquean solas aquí.' },
	...V.CALENDARIOS.map((x) => ({ name: x.campo, label: x.nombre, type: 'url', cols: 4, placeholder: 'https://….ics' })),
	campoCalendarioEq(id),
	{ type: 'section', label: 'En la página' },
	{ name: 'estado', label: 'Mostrar la casa', type: 'select', options: [['disponible', 'Sí, se puede reservar'], ['pausada', 'No, pausada (no sale en la página)']], cols: 6,
		help: 'Con huéspedes por venir no se puede pausar: bloquea los días en el calendario.' }
];

async function laCasa(container, id) {
	const mio = session.profile.propietarioId || '-';
	const ref = doc(db, 'properties', id);
	const sCasa = await getDoc(ref).catch(() => null);
	if (!sCasa?.exists() || sCasa.data().operacion !== 'vacacional' || sCasa.data().propietarioId !== mio) return casa(container, id);
	const leerPriv = (k) => getDoc(doc(db, 'properties', id, 'privado', k)).then((d) => (d.exists() ? d.data() : {})).catch(() => ({}));
	const [socio, llegada, perm] = await Promise.all([leerPriv('socio'), leerPriv('llegada'), permisosDelSocio(mio)]);
	const puedeCasa = puede(perm, 'casa');
	let p = sCasa.data();
	let base = valoresDueno({ casa: p, socio, llegada });
	const form = renderForm(esquemaCasa(id), base, { folder: `properties/${id}` });
	const boton = h('button', { type: 'submit', class: 'btn btn-primary', disabled: !puedeCasa }, 'Guardar');
	const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	const guardar = async (ev) => {
		ev.preventDefault();
		if (!form.validate()) return;
		const d = form.getData();
		const cambios = Object.fromEntries(CAMPOS_DUENO.map((c) => c.campo).filter((k) => !igual(d[k], base[k])).map((k) => [k, d[k]]));
		if (!Object.keys(cambios).length) return toast('No hay cambios que guardar.');
		boton.disabled = true;
		try {
			const res = await fetch('/api/mi-casa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.user.getIdToken()}` }, body: JSON.stringify({ casa: id, cambios }) });
			const cuerpo = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(cuerpo.error || fallaDelServidor(res.status));
			base = d;
			// Si el sitio no se publica solo (apagado, o la última publicación falló), lo publica el equipo.
			toast(cuerpo.publicaSola ? 'Guardado. Sale en la página en unos minutos.' : 'Guardado. Sale en la página cuando el equipo publique el sitio.');
		} catch (err) { showError(err); }
		finally { boton.disabled = false; }
	};
	mount(container,
		h('div', { class: 'd-flex align-items-center gap-2 mb-3' }, volver('Volver a mis propiedades'), h('h1', { class: 'h4 mb-0' }, p.titulo)),
		avisoSocio(perm),
		pestanas(id, 'casa'),
		h('form', { class: 'card card-body mb-3', onsubmit: guardar, novalidate: true }, h('div', { class: puedeCasa ? '' : 'perm-off' }, form.el),
			h('div', { class: 'd-flex align-items-center gap-2 mt-3 pt-3 border-top' },
				h('span', { class: 'small text-muted flex-grow-1' }, ic('icon-info-circle'), 'Lo que guardas sale en la página al publicarse el sitio. El administrador ve cada cambio.'),
				boton)));
}

export async function render(container, [id, parte] = []) {
	if (!id) return lista(container);
	return parte === 'casa' ? laCasa(container, id) : casa(container, id);
}
