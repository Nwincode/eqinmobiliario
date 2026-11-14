// «Mis propiedades»: el panel del dueño (propietario o colaborador). Todas sus casas, de las tres categorías:
//  - por noche: las atiende él (precios, personas, días bloqueados y mínimos de noches; cada cambio queda en la
//    bitácora de la casa). Escribe SU precio; el del cliente (con la comisión) lo calcula el sistema;
//  - en venta o renta: cómo va, solo lectura, desde su resumen (admin/js/resumen-casa.js).
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, updateDoc, addDoc, collection, query, where, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, emptyState, mount, iconoBtn, dia } from '../ui.js';
import { session, markPending, cargarMiResumen, misCasas } from '../session.js';
import { prefijoMoneda, decimales, dinero, nNoches } from '../formato.js';
import { fichaCasa, FILA_CASA } from '../ficha-casa.js';
import { resumenCasa } from '../resumen-casa.js';
import { huespedesMaxDe } from '../cambios-casa.js';
import { guardarPrivadoVacacional } from '../privado-casa.js';

const V = window.EQVacacional;
const hoy = V.hoy; // la fecha de Guatemala, la misma del sitio y de las funciones
const fecha = (iso) => new Date(`${iso}T12:00:00`);
const rango = (r) => (r.desde === r.hasta ? dia(r.desde) : `${r.desde.slice(0, 7) === r.hasta.slice(0, 7) ? Number(r.desde.slice(8)) : dia(r.desde)} – ${dia(r.hasta)}`);
const nombreMes = (mes) => { const t = fecha(`${mes}-15`).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const moverMes = (mes, n) => { const d = fecha(`${mes}-15`); d.setMonth(d.getMonth() + n); return d.toLocaleDateString('en-CA').slice(0, 7); };
// Vuelve a pintar una caja: la vacía y le pone lo nuevo.
const repintar = (caja, ...hijos) => { caja.replaceChildren(); mount(caja, ...hijos); };
const porFecha = (a, b) => a.desde.localeCompare(b.desde);
const enRango = (f, lista) => lista.some((r) => f >= r.desde && f < r.hasta);

const flecha = (lado, titulo, onclick, disabled) => h('button', {
	type: 'button', class: `eq-flecha vac-cal-${lado}`, 'aria-label': titulo, onclick, disabled,
	html: `<svg class="eq-flecha-ic" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="${lado === 'prev' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
});

// Casas en venta o renta que están en su resumen pero no dicen ser suyas (enlazadas solo desde su ficha): se
// muestran con lo que trae el resumen, en la misma ficha corta.
const desdeResumen = (x) => ({ id: x.id, titulo: x.titulo, operacion: x.operacion, precio: x.precio, moneda: x.moneda, publicado: Boolean(x.url),
	fotos: x.foto ? [{ url: x.foto }] : [], ...(x.anuncio || {}) });
const ORDEN = { venta: 0, renta: 1, vacacional: 2 };
const volver = (texto) => iconoBtn('icon-arrow-left', texto, { href: '#/mis-casas', class: 'cot-btn cot-btn-icono btn btn-link text-body' });

async function lista(container) {
	const [vivas, resumen] = await Promise.all([misCasas(), cargarMiResumen()]);
	const casas = [...vivas, ...(resumen?.propiedades || []).filter((x) => !vivas.some((c) => c.id === x.id)).map(desdeResumen)]
		.sort((a, b) => (ORDEN[a.operacion] ?? 3) - (ORDEN[b.operacion] ?? 3) || String(a.titulo).localeCompare(String(b.titulo)));
	const porNoche = casas.some((c) => c.operacion === 'vacacional');
	const filas = h('div', { class: 'list-group' });
	const pintar = (texto = '') => repintar(filas, casas
		.filter((c) => `${c.titulo} ${c.codigo || ''}`.toLowerCase().includes(texto.toLowerCase()))
		.map((c) => h('a', { class: `list-group-item list-group-item-action ${FILA_CASA} py-3`, href: `#/mis-casas/${c.id}` }, fichaCasa(c))));
	pintar();
	const ag = resumen?.asesor || {};
	mount(container,
		pageHeader('Mis propiedades'),
		// Con casas por noche, sus datos de pago: se le mandan al cliente al confirmar una reserva.
		porNoche ? (resumen?.datosPago
			? h('p', { class: 'small text-muted' }, h('span', { class: 'icon-credit-card me-1', 'aria-hidden': 'true' }), 'Tus datos de pago (le llegan al cliente al confirmar): ', h('span', { class: 'text-body', style: 'white-space: pre-line' }, resumen.datosPago), '. ¿Cambiaron? Avisale al administrador.')
			: h('div', { class: 'alert alert-warning small' }, 'Faltan tus datos de pago: sin ellos no podés confirmar reservas. Pedile al administrador que los guarde en tu ficha.')) : null,
		casas.some((c) => c.operacion !== 'vacacional') && ag.nombre ? h('p', { class: 'small text-muted' }, h('span', { class: 'icon-user me-1', 'aria-hidden': 'true' }), 'Tu asesor: ', h('strong', { class: 'text-body' }, ag.nombre)) : null,
		!casas.length ? emptyState('Todavía no tenés propiedades asignadas. Escribile a tu asesor y las activamos.') : [
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
		p ? resumenCasa(resumen, p, { responder: propia }) : emptyState('Tu asesor todavía está preparando el resumen de esta propiedad. Volvé a entrar en un rato.'));
}

async function casa(container, id) {
	const refCasa = doc(db, 'properties', id);
	const refSocio = doc(db, 'properties', id, 'privado', 'socio');
	const mio = session.profile.propietarioId || '-';
	const sCasa = await getDoc(refCasa).catch(() => null);
	const suya = Boolean(sCasa?.exists()) && sCasa.data().propietarioId === mio;
	if (!sCasa?.exists() || sCasa.data().operacion !== 'vacacional') return enVenta(container, id, sCasa?.exists() ? sCasa.data().titulo : '', suya);
	if (!suya) return mount(container, emptyState('Esta casa no está a tu nombre.', h('a', { class: 'btn btn-primary', href: '#/mis-casas' }, 'Ver mis propiedades')));
	const [sSocio, sLeads, sReservas] = await Promise.all([getDoc(refSocio),
		// Solicitudes de sus casas: del chat de cada una (las solicitudes traen el contacto del cliente y el socio no las lee).
		getDocs(query(collection(db, 'chats'), where('propietarioId', '==', mio))),
		getDocs(query(collection(db, 'reservas'), where('propietarioId', '==', mio))).catch(() => null)]);
	const p = sCasa.data();
	// Lo que lleva esta casa: reservas confirmadas, noches y lo que le toca (la misma cuenta de Rentas vacacionales).
	const cuenta = V.resumenReservas((sReservas?.docs || []).map((d) => d.data()).filter((r) => r.propertyId === id));
	const s = sSocio.exists() ? sSocio.data() : {};
	const v = p.vacacional || {};
	const pre = prefijoMoneda(p.moneda || 'USD');
	const plata = (n) => `${pre}${decimales(n)}`;
	const e = {
		base: Number(s.precioBase) || 0, finde: Number(s.precioFinde) || 0, tarifas: [...(s.tarifas || [])],
		bloqueos: V.unirRangos(v.bloqueos || []), minimos: [...(v.minimos || [])], reservadas: V.unirRangos(v.reservadas || []),
		huespedes: huespedesMaxDe(v.huespedesMax), mes: hoy().slice(0, 7), desde: '', hasta: '', pide: '',
		// Solicitudes de la web que todavía no respondió.
		pedidas: sLeads.docs.map((d) => d.data()).filter((c) => c.propertyId === id && c.llegada && !c.estado)
			.map((c) => ({ desde: c.llegada, hasta: c.salida }))
	};
	const plan = () => ({ base: e.base, finde: e.finde, tarifas: e.tarifas });
	const publico = (n) => plata(V.nochePublica(n, s.margen));

	async function guardar(descripcion) {
		try {
			// El margen lo pone el equipo y puede haber cambiado con esta pantalla abierta: el precio público sale del vigente.
			const vigente = await getDoc(refSocio);
			if (vigente.exists() && vigente.data().margen !== undefined) s.margen = vigente.data().margen;
			const pub = V.planPublico(plan(), s.margen);
			await guardarPrivadoVacacional(id, { precioBase: e.base, precioFinde: e.finde, tarifas: e.tarifas });
			await updateDoc(refCasa, {
				precio: V.precioDesde(pub, hoy()) || null, 'vacacional.base': pub.base, 'vacacional.finde': pub.finde, 'vacacional.tarifas': pub.tarifas,
				'vacacional.bloqueos': e.bloqueos, 'vacacional.minimos': e.minimos, 'vacacional.huespedesMax': e.huespedes, updatedAt: serverTimestamp()
			});
			await addDoc(collection(refCasa, 'bitacora'), { que: descripcion, quien: session.user.uid, nombre: session.profile.nombre || '', cuando: serverTimestamp() });
			await markPending(`${p.titulo}: ${descripcion}`);
			toast('Guardado.');
		} catch (err) { showError(err); }
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
					class: 'form-control', id: `mc-${campo}`, type: 'number', inputmode: 'decimal', min: '0', value: e[campo] || '',
					onchange: (ev) => {
						const n = V.r2(Math.max(0, Number(ev.target.value) || 0));
						if (campo === 'base' && !n) { ev.target.value = e.base || ''; return toast('Escribí el precio por noche.', 'warning'); }
						e[campo] = n; pinta(); pintar();
						guardar(`precio ${titulo.toLowerCase()}`);
					}
				})), ve);
	};

	// ------------------------------------------------------------ Calendario
	const cal = h('div', { class: 'card card-body mb-3' });
	const listas = h('div', {});

	function tocar(f) {
		if (e.desde && e.desde === e.hasta && f > e.desde) e.hasta = f;
		else { e.desde = f; e.hasta = f; }
		e.pide = '';
		calendario();
	}
	const soltar = () => { e.desde = ''; e.hasta = ''; e.pide = ''; };

	function aplicar(que, valor) {
		const { desde, hasta } = e;
		const fin = V.sumarDias(hasta, 1);
		if (que === 'bloquear') e.bloqueos = V.unirRangos([...e.bloqueos, { desde, hasta: fin }]);
		if (que === 'habilitar') e.bloqueos = V.liberarNoches(e.bloqueos, desde, fin);
		if (que === 'precio') e.tarifas = [...V.quitarRango(e.tarifas, desde, hasta), { desde, hasta, precio: valor }].sort(porFecha);
		if (que === 'minimo') e.minimos = [...V.quitarRango(e.minimos, desde, hasta), { desde, hasta, noches: valor }].sort(porFecha);
		const texto = { bloquear: 'bloqueó', habilitar: 'habilitó', precio: 'precio especial', minimo: 'mínimo de noches' }[que];
		soltar();
		pintar();
		guardar(`${texto} ${rango({ desde, hasta })}${que === 'bloquear' ? ` (${valor})` : ''}`);
	}

	// Barra que aparece al elegir días: cuatro acciones de ícono y, si hace falta, un número.
	function barra() {
		if (!e.desde) return h('p', { class: 'vac-ayuda mb-0' }, 'Tocá un día (y otro para marcar varios) para bloquear, habilitar o cambiar el precio.');
		const cerrar = iconoBtn('icon-close', 'Cancelar', { onclick: () => { e.pide = ''; calendario(); } });
		// Bloquear pide el motivo: un toque.
		if (e.pide === 'motivo') return h('div', { class: 'mc-barra' },
			h('strong', { class: 'd-block mb-1' }, `Bloquear · ${rango(e)}`),
			h('div', { class: 'd-flex flex-wrap gap-2' },
				['Otra reserva', 'Mantenimiento', 'Uso propio'].map((t) => h('button', { type: 'button', class: 'cot-btn btn btn-sm btn-outline-secondary', onclick: () => aplicar('bloquear', t) }, t)),
				cerrar));
		if (e.pide) {
			const esPrecio = e.pide === 'precio';
			const ve = h('div', { class: 'form-text' }, esPrecio ? 'Tu precio por noche en esos días.' : 'Noches mínimas si la estancia toca esos días.');
			const campo = h('input', {
				class: 'form-control', type: 'number', inputmode: esPrecio ? 'decimal' : 'numeric', min: '1', 'aria-label': esPrecio ? 'Precio por noche' : 'Mínimo de noches',
				oninput: (ev) => { if (esPrecio) ve.textContent = Number(ev.target.value) > 0 ? `El cliente ve ${publico(ev.target.value)}` : 'Tu precio por noche en esos días.'; }
			});
			const listo = () => {
				const n = esPrecio ? V.r2(Number(campo.value) || 0) : Math.floor(Number(campo.value) || 0);
				if (n < 1) return toast(esPrecio ? 'Escribí el precio.' : 'Escribí cuántas noches.', 'warning');
				aplicar(e.pide, n);
			};
			campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') listo(); });
			setTimeout(() => campo.focus());
			return h('div', { class: 'mc-barra' },
				h('strong', { class: 'd-block mb-1' }, `${esPrecio ? 'Precio especial' : 'Mínimo de noches'} · ${rango(e)}`),
				h('div', { class: 'd-flex gap-2' },
					h('div', { class: 'input-group' }, esPrecio ? h('span', { class: 'input-group-text' }, pre.trim()) : null, campo, esPrecio ? null : h('span', { class: 'input-group-text' }, 'noches')),
					iconoBtn('icon-check', 'Guardar', { class: 'cot-btn cot-btn-icono btn btn-primary', onclick: listo }),
					cerrar),
				ve);
		}
		return h('div', { class: 'mc-barra d-flex align-items-center gap-2' },
			h('strong', { class: 'flex-grow-1' }, rango(e)),
			iconoBtn('icon-lock', 'Bloquear estos días', { onclick: () => { e.pide = 'motivo'; calendario(); } }),
			iconoBtn('icon-unlock', 'Habilitar estos días', { onclick: () => aplicar('habilitar') }),
			iconoBtn('icon-tag', 'Precio especial', { onclick: () => { e.pide = 'precio'; calendario(); } }),
			iconoBtn('icon-moon-o', 'Mínimo de noches', { onclick: () => { e.pide = 'minimo'; calendario(); } }),
			iconoBtn('icon-close', 'Quitar la selección', { class: 'cot-btn cot-btn-icono btn btn-link text-body', onclick: () => { soltar(); calendario(); } }));
	}

	function calendario() {
		const [a, m] = e.mes.split('-').map(Number);
		const dias = new Date(a, m, 0).getDate();
		const vacias = (new Date(a, m - 1, 1).getDay() + 6) % 7; // semana de lunes a domingo
		const celdas = [...Array(vacias).fill(null), ...Array.from({ length: dias }, (_, i) => `${e.mes}-${String(i + 1).padStart(2, '0')}`)];
		const celda = (f) => {
			if (!f) return h('td', {});
			const pasado = f < hoy();
			const reservada = enRango(f, e.reservadas);
			const bloqueado = enRango(f, e.bloqueos);
			const estado = reservada ? 'reservado' : bloqueado ? 'bloqueado' : '';
			const pedida = !estado && enRango(f, e.pedidas);
			const clases = ['vac-dia', f === hoy() && 'is-hoy', estado && 'is-ocupado',
				e.desde && f === e.desde && 'is-llegada', e.desde && f === e.hasta && 'is-salida', f > e.desde && f < e.hasta && 'is-rango'].filter(Boolean).join(' ');
			return h('td', {}, h('button', {
				type: 'button', class: clases, 'aria-disabled': pasado ? 'true' : null, 'aria-pressed': e.desde && f >= e.desde && f <= e.hasta ? 'true' : null,
				'aria-label': `${dia(f)}${estado ? `, ${estado}` : pedida ? ', solicitado' : ''}`, onclick: pasado ? null : () => tocar(f)
			},
			h('span', { class: 'vac-dia-num' }, Number(f.slice(8))),
			estado || pedida ? h('span', { class: `vac-dia-precio ${reservada ? 'icon-bed' : bloqueado ? 'icon-lock' : 'icon-clock-o'}`, 'aria-hidden': 'true' })
				: h('span', { class: 'vac-dia-precio' }, plata(V.precioNoche(f, plan())))));
		};
		const semanas = [];
		for (let i = 0; i < celdas.length; i += 7) semanas.push(h('tr', {}, celdas.slice(i, i + 7).map(celda)));
		repintar(cal,
			h('div', { class: 'vac-cal-cabecera' },
				flecha('prev', 'Mes anterior', () => { e.mes = moverMes(e.mes, -1); calendario(); }, e.mes <= hoy().slice(0, 7)),
				h('h2', { class: 'vac-cal-mes' }, nombreMes(e.mes)),
				flecha('next', 'Mes siguiente', () => { e.mes = moverMes(e.mes, 1); calendario(); })),
			h('table', { class: 'vac-cal-tabla' },
				h('thead', {}, h('tr', {}, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('th', { scope: 'col' }, d)))),
				h('tbody', {}, semanas)),
			h('p', { class: 'small text-muted my-2' },
				h('span', { class: 'icon-lock', 'aria-hidden': 'true' }), ' Bloqueado  ·  ', h('span', { class: 'icon-bed', 'aria-hidden': 'true' }), ' Reservado  ·  ', h('span', { class: 'icon-clock-o', 'aria-hidden': 'true' }), ' Solicitado  ·  El precio es el tuyo, sin comisión.'),
			barra());
	}

	// ------------------------------------------------------------ Listas de lo especial
	const grupo = (titulo, campo, texto) => {
		const vigentes = e[campo].filter((r) => r.hasta >= hoy());
		if (!vigentes.length) return null;
		return h('div', { class: 'mb-3' },
			h('h2', { class: 'h6' }, titulo),
			h('ul', { class: 'list-group' }, vigentes.map((r) => h('li', { class: 'list-group-item d-flex align-items-center gap-2' },
				h('span', { class: 'flex-grow-1' }, h('strong', {}, rango(r)), h('span', { class: 'd-block small text-muted' }, texto(r))),
				iconoBtn('icon-trash', `Quitar ${titulo.toLowerCase()} ${rango(r)}`, {
					onclick: () => { e[campo] = e[campo].filter((x) => x !== r); pintar(); guardar(`quitó ${titulo.toLowerCase()} ${rango(r)}`); }
				})))));
	};
	function pintar() {
		calendario();
		repintar(listas,
			grupo('Precios especiales', 'tarifas', (r) => `${plata(r.precio)} por noche · el cliente ve ${publico(r.precio)}`),
			grupo('Mínimos de noches', 'minimos', (r) => `${r.noches} noches como mínimo`));
	}

	pintar();
	mount(container,
		h('div', { class: 'd-flex align-items-center gap-2 mb-3' }, volver('Volver a mis propiedades'), h('h1', { class: 'h4 mb-0' }, p.titulo)),
		cuenta.reservas ? h('p', { class: 'small text-muted' }, h('span', { class: 'icon-calendar-check-o me-1', 'aria-hidden': 'true' }),
			`${cuenta.reservas} ${cuenta.reservas === 1 ? 'reserva confirmada' : 'reservas confirmadas'} · ${nNoches(cuenta.noches)} · tu parte: `,
			h('strong', { class: 'text-body' }, Object.entries(cuenta.porMoneda).map(([m, x]) => dinero(x.costoSocio, m)).join(' · '))) : null,
		h('div', { class: 'card card-body mb-3' }, h('div', { class: 'row g-3' },
			precio('base', 'Entre semana', 'Tu precio por noche.'),
			precio('finde', 'Fin de semana', 'Vacío: igual que entre semana.'),
			h('div', { class: 'col-6' },
				h('label', { class: 'form-label', for: 'mc-huespedes' }, 'Personas máximo'),
				h('input', {
					class: 'form-control', id: 'mc-huespedes', type: 'number', inputmode: 'numeric', min: '1', value: e.huespedes || '',
					// La misma regla que la ficha del inmueble: al menos 1 (vacío no es «sin límite»).
					onchange: (ev) => { e.huespedes = huespedesMaxDe(ev.target.value); ev.target.value = e.huespedes; guardar(`personas máximo ${e.huespedes}`); }
				})))),
		cal, listas);
}

export async function render(container, [id] = []) {
	return id ? casa(container, id) : lista(container);
}
