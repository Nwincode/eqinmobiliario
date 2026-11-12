// Pantalla del socio de rentas: sus casas, con precios, personas, días bloqueados y mínimos de noches.
// Cada cambio queda en la bitácora de la casa con quién y cuándo.
// El socio escribe SU precio; el del cliente (con la comisión) lo calcula el sistema.
import '/js/calc-vacacional.js';
import { db, doc, getDoc, getDocs, updateDoc, addDoc, collection, query, where, serverTimestamp } from '../firebase.js';
import { h, toast, showError, pageHeader, emptyState, mount, iconoBtn, hoy, dia } from '../ui.js';
import { session, markPending } from '../session.js';
import { prefijoMoneda, miles } from '../formato.js';

const V = window.EQVacacional;
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

async function lista(container) {
	const snap = await getDocs(query(collection(db, 'properties'), where('propietarioId', '==', session.profile.propietarioId || '-')));
	const casas = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)));
	const filas = h('div', { class: 'list-group' });
	const pintar = (texto = '') => repintar(filas, casas
		.filter((c) => `${c.titulo} ${c.codigo || ''}`.toLowerCase().includes(texto.toLowerCase()))
		.map((c) => h('a', { class: 'list-group-item list-group-item-action d-flex align-items-center gap-2 py-3', href: `#/mis-casas/${c.id}` },
			h('span', { class: 'icon-home2 text-muted', 'aria-hidden': 'true' }),
			h('span', { class: 'flex-grow-1 fw-semibold' }, c.titulo, c.codigo ? h('span', { class: 'd-block small fw-normal text-muted' }, c.codigo) : null),
			h('span', { class: 'icon-chevron-right text-muted', 'aria-hidden': 'true' }))));
	pintar();
	mount(container,
		pageHeader('Mis casas'),
		!casas.length ? emptyState('Todavía no tenés casas asignadas. Escribinos y las activamos.') : [
			casas.length > 8 ? h('input', { class: 'form-control mb-3', type: 'search', placeholder: 'Buscar casa', 'aria-label': 'Buscar casa', oninput: (e) => pintar(e.target.value) }) : null,
			filas]);
}

async function casa(container, id) {
	const refCasa = doc(db, 'properties', id);
	const refSocio = doc(db, 'properties', id, 'privado', 'socio');
	const mio = session.profile.propietarioId || '-';
	const [sCasa, sSocio, sLeads] = await Promise.all([getDoc(refCasa), getDoc(refSocio),
		getDocs(query(collection(db, 'leads'), where('propietarioId', '==', mio)))]);
	if (!sCasa.exists()) return mount(container, emptyState('No encontramos esa casa.', h('a', { class: 'btn btn-primary', href: '#/mis-casas' }, 'Ver mis casas')));
	const p = sCasa.data();
	const s = sSocio.exists() ? sSocio.data() : {};
	const v = p.vacacional || {};
	const pre = prefijoMoneda(p.moneda || 'USD');
	const plata = (n) => `${pre}${miles(n)}`;
	const e = {
		base: Number(s.precioBase) || 0, finde: Number(s.precioFinde) || 0, tarifas: [...(s.tarifas || [])],
		bloqueos: V.unirRangos(v.bloqueos || []), minimos: [...(v.minimos || [])], reservadas: V.unirRangos(v.reservadas || []),
		huespedes: Number(v.huespedesMax) || 0, mes: hoy().slice(0, 7), desde: '', hasta: '', pide: '',
		// Solicitudes de la web que todavía no respondió.
		pedidas: sLeads.docs.map((d) => d.data()).filter((l) => l.propertyId === id && l.reserva?.llegada && !l.solicitud?.estado)
			.map((l) => ({ desde: l.reserva.llegada, hasta: l.reserva.salida }))
	};
	const plan = () => ({ base: e.base, finde: e.finde, tarifas: e.tarifas });
	const publico = (n) => plata(V.nochePublica(n, s.margen));

	async function guardar(descripcion) {
		const pub = V.planPublico(plan(), s.margen);
		try {
			await updateDoc(refSocio, { precioBase: e.base, precioFinde: e.finde, tarifas: e.tarifas, updatedAt: serverTimestamp(), updatedBy: session.user.uid });
			await updateDoc(refCasa, {
				precio: V.precioDesde(pub, hoy()) || null, 'vacacional.base': pub.base, 'vacacional.finde': pub.finde, 'vacacional.tarifas': pub.tarifas,
				'vacacional.bloqueos': e.bloqueos, 'vacacional.minimos': e.minimos, 'vacacional.huespedesMax': e.huespedes || null, updatedAt: serverTimestamp()
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
		h('div', { class: 'd-flex align-items-center gap-2 mb-3' },
			iconoBtn('icon-arrow-left', 'Volver a mis casas', { href: '#/mis-casas', class: 'cot-btn cot-btn-icono btn btn-link text-body' }),
			h('h1', { class: 'h4 mb-0' }, p.titulo)),
		h('div', { class: 'card card-body mb-3' }, h('div', { class: 'row g-3' },
			precio('base', 'Entre semana', 'Tu precio por noche.'),
			precio('finde', 'Fin de semana', 'Vacío: igual que entre semana.'),
			h('div', { class: 'col-6' },
				h('label', { class: 'form-label', for: 'mc-huespedes' }, 'Personas máximo'),
				h('input', {
					class: 'form-control', id: 'mc-huespedes', type: 'number', inputmode: 'numeric', min: '1', value: e.huespedes || '',
					onchange: (ev) => { e.huespedes = Math.max(0, Math.floor(Number(ev.target.value) || 0)); guardar(`personas máximo ${e.huespedes || 'sin límite'}`); }
				})))),
		cal, listas);
}

export async function render(container, [id] = []) {
	return id ? casa(container, id) : lista(container);
}
