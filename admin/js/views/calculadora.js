// Calculadora de renta del panel: análisis completo de inversión (año 1, escenarios, flujo a largo plazo, TIR y VPN).
// El motor es el mismo del sitio (js/calc-renta.js → window.EQRenta), así los números coinciden con la ficha pública.
import '/js/calc-renta.js';
import { h, mount, pageHeader, toast } from '../ui.js';

const R = window.EQRenta;

const TIPOS_DEF = [['casa', 'Casa'], ['apartamento', 'Apartamento'], ['terreno', 'Terreno'], ['oficina', 'Oficina'], ['local', 'Local comercial'], ['bodega', 'Bodega'], ['finca', 'Finca']];
const USOS = [['habitacional', 'Habitacional (vivienda)'], ['mixto', 'Mixto'], ['comercial', 'Comercial']];
const ISR = [['capital', 'Rentas de capital (10 % sobre el 70 %)'], ['simplificado', 'Régimen simplificado (5 % / 7 %)'], ['utilidades', 'Sobre utilidades (25 %)']];
const IVA = [['exento', 'Exento (vivienda)'], ['general', 'General 12 % (lo paga el inquilino)'], ['pequeno', 'Pequeño contribuyente 5 %']];

const AVISOS = {
	terreno: 'Un terreno casi nunca se renta: la referencia de cap rate no aplica y el resultado es solo ilustrativo.',
	pequenoLimite: 'La renta cobrada pasa de Q 150,000 al año: ya no cabe en pequeño contribuyente; revisa el régimen de IVA.',
	mixtoIva: 'Uso mixto: el IVA depende del contrato (la parte de vivienda está exenta). Confirma con el contador.',
	tirNula: 'La TIR no se puede calcular con estos flujos (no recupera la inversión en el plazo).'
};

const GLOSARIO = [
	['Renta bruta', 'Lo que pagaría el inquilino en el año si la propiedad estuviera rentada los 12 meses.'],
	['Vacancia', 'Porcentaje del año en que la propiedad queda vacía o no se cobra la renta.'],
	['Gastos operativos', 'Mantenimiento, cuota de condominio, seguro, administración y reparaciones menores, como porcentaje de lo cobrado.'],
	['Reserva de capital (capex)', 'Ahorro para reparaciones grandes: techo, pintura, equipos.'],
	['IUSI', 'Impuesto Único sobre Inmuebles. Se calcula sobre el valor fiscal (el inscrito en la municipalidad), no sobre el precio de venta.'],
	['ISR', 'Impuesto Sobre la Renta del dueño por las rentas cobradas, según el régimen elegido.'],
	['IVA', 'Impuesto al Valor Agregado. En el régimen general lo cobra el dueño al inquilino y lo entrega a la SAT: no es costo del dueño.'],
	['Ingreso efectivo', 'La renta que de verdad se cobra en el año: renta bruta menos la vacancia.'],
	['NOI', 'Ingreso operativo neto: lo cobrado menos gastos operativos e IUSI, antes de ISR y reserva.'],
	['Flujo antes de impuestos', 'Lo que queda después de gastos, IUSI y reserva, antes de pagar el ISR.'],
	['Cap rate', 'NOI del año 1 dividido entre el precio. Sirve para comparar propiedades.'],
	['Rendimiento neto', 'Lo que te queda en el año 1 (después de impuestos y reserva) dividido entre el precio.'],
	['Costo de adquisición', 'Lo que te costó la propiedad: precio, costos de compra y mejoras hechas en el plazo.'],
	['Ganancia de capital', 'Lo que ganas al vender: ingreso neto de la venta menos el costo de adquisición. Sobre esa ganancia se paga ISR.'],
	['Múltiplo', 'Todo lo que recibes (rentas netas más la venta) dividido entre lo que invertiste. 2 veces quiere decir que duplicaste el dinero.'],
	['Cap rate de salida', 'El cap rate con el que se estima el precio de venta al final del plazo (NOI del año siguiente ÷ cap rate).'],
	['TIR', 'Tasa interna de retorno: el rendimiento anual de toda la inversión, incluyendo la venta al final (después de su impuesto).'],
	['VPN', 'Valor presente neto: cuánto vale hoy el flujo futuro, descontado a la tasa que pides. Si es positivo, la inversión supera esa tasa.'],
	['Payback', 'Años que tardan los flujos netos en devolver la inversión inicial (sin contar la venta).']
];

const etiqueta = (lista, v) => (lista.find(([k]) => k === v) || [v, v])[1];

const DEF = { tipo: 'casa', moneda: 'USD', precio: '', rentaMensual: '', uso: 'habitacional', valorFiscal: '', vacancia: 5, crecimientoRenta: 3, gastosOperativos: 10, reservaCapex: 0, regimenISR: 'capital', regimenIVA: 'exento', iusiMil: '', depreciacion: 0, plazo: 30, capSalida: '', costosVenta: 5, costosCompra: 0, capexSumaAlCosto: true, restarImpuestoVenta: true, tasaDescuento: 10, objetivo: 6 };

export async function render(container) {
	const estado = { ...DEF };
	let params = R.copiaParams();
	let props = [];

	const num = (v) => (v === '' || v === null || v === undefined || !isFinite(Number(v)) ? undefined : Number(v));
	const dinero = (v, dec = 0) => R.dinero(v, estado.moneda, 'es', dec);
	const pct = (v, dec = 2) => (v === null || v === undefined || !isFinite(v) ? '—' : R.porcentaje(v, 'es', dec));
	const paramValores = () => Object.fromEntries(Object.entries(params).map(([k, p]) => [k, p.valor]));
	const entradas = () => ({
		tipo: estado.tipo, moneda: estado.moneda, precio: num(estado.precio) || 0, rentaMensual: num(estado.rentaMensual) || 0,
		uso: estado.uso, regimenISR: estado.regimenISR, regimenIVA: estado.regimenIVA, valorFiscal: num(estado.valorFiscal),
		vacancia: num(estado.vacancia) ?? 0, crecimientoRenta: num(estado.crecimientoRenta) ?? 0, gastosOperativos: num(estado.gastosOperativos) ?? 0,
		reservaCapex: num(estado.reservaCapex) ?? 0, iusiMil: num(estado.iusiMil), depreciacion: num(estado.depreciacion) ?? 0,
		plazo: num(estado.plazo) || 30, capSalida: num(estado.capSalida), costosVenta: num(estado.costosVenta) ?? 0, tasaDescuento: num(estado.tasaDescuento) ?? 0,
		costosCompra: num(estado.costosCompra) ?? 0, capexSumaAlCosto: estado.capexSumaAlCosto !== false, restarImpuestoVenta: estado.restarImpuestoVenta !== false
	});

	// ── Campos ──────────────────────────────────────────────
	const campos = {};
	const id = (k) => `calc-${k}`;
	function campo(k, label, { tipo = 'number', opciones, sufijo, ayuda, attrs = {}, col = 'col-sm-6' } = {}) {
		const onInput = (e) => { estado[k] = e.target.value; if (k === 'uso') { estado.regimenIVA = R.ivaPorUso(estado.uso); campos.regimenIVA.value = estado.regimenIVA; } if (k === 'moneda') monedas(); calcular(); };
		const input = opciones
			? h('select', { class: 'form-select', id: id(k), onchange: onInput }, opciones.map(([v, t]) => h('option', { value: v, selected: String(estado[k]) === v }, t)))
			: h('input', { class: 'form-control', id: id(k), type: tipo, inputmode: 'decimal', step: 'any', min: '0', value: estado[k], oninput: onInput, 'aria-describedby': ayuda ? `${id(k)}-ayuda` : undefined, ...attrs });
		campos[k] = input;
		return h('div', { class: col },
			h('label', { class: 'form-label', for: id(k) }, label, sufijo ? h('span', { class: 'calc-sufijo', dataset: { sufijo } }, ` (${sufijo === 'moneda' ? simbolo() : sufijo})`) : null),
			input,
			ayuda ? h('div', { class: 'form-text', id: `${id(k)}-ayuda` }, ayuda) : null);
	}
	const simbolo = () => (estado.moneda === 'GTQ' ? 'Q' : 'US$');
	function monedas() { container.querySelectorAll('.calc-sufijo[data-sufijo="moneda"]').forEach((s) => { s.textContent = ` (${simbolo()})`; }); }
	function setCampos(obj) {
		for (const [k, v] of Object.entries(obj)) {
			estado[k] = v ?? '';
			if (!campos[k]) continue;
			if (campos[k].type === 'checkbox') campos[k].checked = v !== false; else campos[k].value = estado[k];
		}
		monedas();
	}
	// Casilla (sí / no) que también guarda en estado.
	function casilla(k, label, ayuda) {
		const input = h('input', { class: 'form-check-input', type: 'checkbox', id: id(k), checked: estado[k] !== false, 'aria-describedby': ayuda ? `${id(k)}-ayuda` : undefined,
			onchange: (e) => { estado[k] = e.target.checked; sincronizar(k); calcular(); } });
		campos[k] = input;
		return h('div', { class: 'form-check calc-check' }, input, h('label', { class: 'form-check-label', for: id(k) }, label),
			ayuda ? h('div', { class: 'form-text', id: `${id(k)}-ayuda` }, ayuda) : null);
	}
	// La casilla de la tarjeta de venta y la de los campos son la misma opción.
	const espejo = {};
	function espejoCasilla(k, label) {
		const input = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: `${id(k)}-2`, checked: estado[k] !== false,
			onchange: (e) => { estado[k] = e.target.checked; sincronizar(k); calcular(); } });
		espejo[k] = input;
		return h('div', { class: 'form-check form-switch calc-check mb-0' }, input, h('label', { class: 'form-check-label', for: `${id(k)}-2` }, label));
	}
	function sincronizar(k) { if (espejo[k]) espejo[k].checked = estado[k] !== false; if (campos[k]) campos[k].checked = estado[k] !== false; }
	const grupo = (icono, titulo, ...hijos) => h('section', { class: 'card calc-grupo mb-3' },
		h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), titulo)),
		h('div', { class: 'card-body' }, h('div', { class: 'row g-3' }, hijos)));

	// Propiedad del inventario (opcional).
	const selProp = h('select', { class: 'form-select', id: 'calc-prop', onchange: (e) => elegir(e.target.value) },
		h('option', { value: '' }, 'Ingreso manual'));
	function elegir(pid) {
		const p = props.find((x) => x.id === pid);
		if (!p) return;
		const uso = R.usoPorTipo(p.tipo);
		const sug = R.rentaSugerida(Number(p.precio), p.tipo, { vacancia: num(estado.vacancia), gastosOperativos: num(estado.gastosOperativos) }, paramValores());
		setCampos({ tipo: p.tipo || 'casa', moneda: p.moneda === 'GTQ' ? 'GTQ' : 'USD', precio: p.precio || '', uso, regimenIVA: R.ivaPorUso(uso), valorFiscal: '', capSalida: '',
			rentaMensual: p.operacion === 'renta' ? p.precio : (sug ? Math.round(sug / 10) * 10 : '') });
		if (p.operacion === 'renta') setCampos({ precio: '' });
		calcular();
	}

	// Parámetros de ley y de mercado.
	const paramInputs = {};
	function paramsPanel() {
		const grupos = {};
		for (const [k, p] of Object.entries(params)) (grupos[p.grupo] ||= []).push(k);
		return h('details', { class: 'calc-params col-12' },
			h('summary', {}, h('span', { class: 'icon-chevron-down me-2 calc-chev', 'aria-hidden': 'true' }), 'Valores de ley y de mercado (por confirmar)'),
			h('p', { class: 'small text-muted mt-2 mb-3' }, 'Todos son editables. Cada valor dice de dónde sale; confírmalos con el contador antes de usarlos con un cliente.'),
			Object.entries(grupos).map(([g, keys]) => h('fieldset', { class: 'mb-3' },
				h('legend', { class: 'calc-legend' }, g),
				h('div', { class: 'row g-2' }, keys.map((k) => {
					const p = params[k];
					const inp = h('input', { class: 'form-control form-control-sm', id: `calc-p-${k}`, type: 'number', step: 'any', value: p.valor, 'aria-describedby': `calc-p-${k}-f`,
						oninput: (e) => { const v = Number(e.target.value); if (e.target.value !== '' && isFinite(v)) { params[k].valor = v; calcular(); } } });
					paramInputs[k] = inp;
					return h('div', { class: 'col-sm-6' },
						h('label', { class: 'form-label small mb-1', for: `calc-p-${k}` }, `${p.etiqueta} (${p.unidad})`), inp,
						h('div', { class: 'form-text calc-fuente', id: `calc-p-${k}-f` }, p.fuente));
				})))),
			h('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', onclick: () => {
				params = R.copiaParams();
				for (const [k, inp] of Object.entries(paramInputs)) inp.value = params[k].valor;
				calcular();
				toast('Se restablecieron los valores de ley.');
			} }, h('span', { class: 'icon-undo me-1', 'aria-hidden': 'true' }), 'Restablecer valores de ley'));
	}

	// Renta para un rendimiento objetivo.
	const objetivoOut = h('p', { class: 'calc-objetivo-out mb-0', role: 'status', 'aria-live': 'polite' });
	const usarObjetivo = h('button', { type: 'button', class: 'btn btn-outline-primary calc-usar', hidden: true, onclick: () => { setCampos({ rentaMensual: usarObjetivo.dataset.renta }); calcular(); } }, 'Usar esta renta');

	// ── Resultados ─────────────────────────────────────────
	const kpis = h('div', { class: 'row g-3 mb-3 calc-kpis' });
	const avisos = h('div', { class: 'calc-avisos' });
	const tablaAnio1 = h('div', { class: 'table-responsive' });
	const tablaVenta = h('div', { class: 'table-responsive' });
	const tablaGanancia = h('div', { class: 'table-responsive' });
	const tablaResumen = h('div', { class: 'table-responsive' });
	const notaVenta = h('p', { class: 'calc-er-nota mb-0' });
	const rendResumen = h('div', { class: 'calc-resumen-tir' });
	let anioER = 1;
	const selAnio = h('select', { class: 'form-select form-select-sm calc-anio-sel', id: 'calc-anio-er', onchange: (e) => { anioER = Number(e.target.value) || 1; calcular(); } });
	const tituloER = h('span', {}, 'Estado de resultados — año 1');
	const tituloVenta = h('span', {}, 'Venta al final del plazo');
	const tituloResumen = h('span', {}, 'Resumen del negocio');
	const tablaEsc = h('div', { class: 'table-responsive' });
	const grafica = h('div', { class: 'calc-grafica' });
	let ultimoR = null;
	const tablaLargo = h('div', { class: 'table-responsive calc-largo' });
	const vacio = h('div', { class: 'calc-vacio text-muted' }, 'Ingresa el precio y la renta mensual para ver el análisis.');
	const resultados = h('div', { class: 'calc-resultados' });
	const resumenImpresion = h('p', { class: 'print-only calc-print-resumen' });

	function kpi(icono, label, valor, nota, destacado) {
		return h('div', { class: destacado ? 'col-12' : 'col-6 col-md-4' }, h('div', { class: `card stat-card calc-kpi h-100${destacado ? ' calc-kpi-main' : ''}` },
			h('div', { class: 'calc-kpi-label' }, h('span', { class: `${icono} me-1`, 'aria-hidden': 'true' }), label),
			h('div', { class: 'stat-value' }, valor),
			nota ? h('div', { class: 'calc-kpi-nota' }, nota) : null));
	}

	function tabla(cols, filas, { total = [], cls = '' } = {}) {
		return h('table', { class: `table table-sm align-middle mb-0 calc-tabla ${cls}` },
			h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { scope: 'col', class: i ? 'text-end' : '' }, c)))),
			h('tbody', {}, filas.map((f, j) => h('tr', { class: total.includes(j) ? 'calc-total' : '' }, f.map((c, i) => (i ? h('td', { class: 'text-end' }, c) : h('th', { scope: 'row' }, c)))))));
	}

	// Estado de resultados: cascada de bruto a neto. Cada fila trae su tipo (ingreso, resta, subtotal, total, info).
	// cols: 'anio' (anual, mensual y % de la renta bruta), 'venta' (monto y % del precio de venta) o 'monto'.
	// inicio: claves que abren un bloque nuevo (no llevan «+»).
	function estadoTabla(filas, { caption, cols = 'monto', inicio = [] } = {}) {
		const signo = { resta: '−', subtotal: '=', total: '=' };
		const monto = (v) => (v === null || v === undefined ? '' : v < 0 ? `−${dinero(-v)}` : dinero(v));
		const porc = (v) => (v === null || v === undefined ? '' : v < 0 ? `−${pct(-v, 1)}` : pct(v, 1));
		const encabezados = cols === 'anio' ? ['Anual', 'Mensual', '% de la renta bruta'] : cols === 'venta' ? ['Monto', '% del precio de venta'] : ['Monto'];
		const celdas = (f) => {
			if (f.clave === 'multiplo') return [f.monto === null ? '—' : `${f.monto.toFixed(2)} veces`];
			const v = [monto(f.monto)];
			if (cols === 'anio') v.push(monto(f.mensual), porc(f.pct));
			if (cols === 'venta') v.push(porc(f.pct));
			return v;
		};
		return h('table', { class: `table table-sm mb-0 calc-tabla calc-er calc-er-${cols}` },
			caption ? h('caption', { class: 'visually-hidden' }, caption) : null,
			h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Concepto'), encabezados.map((c) => h('th', { scope: 'col', class: 'text-end' }, c)))),
			h('tbody', {}, filas.map((f, j) => {
				const s = f.tipo === 'ingreso' ? (j === 0 || inicio.includes(f.clave) || filas[j - 1].tipo === 'info' ? '' : '+') : signo[f.tipo] || '';
				const soloTexto = f.tipo === 'info' && f.monto === null;
				const vals = celdas(f);
				return h('tr', { class: `calc-er-${f.tipo}${inicio.includes(f.clave) && j ? ' calc-er-bloque' : ''}` },
					h('th', { scope: 'row', colspan: soloTexto ? String(vals.length + 1) : undefined },
						h('span', { class: 'calc-er-concepto' },
							h('span', { class: 'calc-er-signo', 'aria-hidden': 'true' }, s),
							h('span', {}, h('span', { class: 'calc-er-etq' }, f.etiqueta), f.nota ? h('span', { class: 'calc-er-desc' }, f.nota) : null))),
					soloTexto ? null : vals.map((c) => h('td', { class: 'text-end' }, c)));
			})));
	}

	// Dos gráficas pequeñas con su propia escala (en una sola, las barras del año se veían diminutas junto al acumulado).
	// Se dibujan al ancho real del contenedor para que los textos se lean igual en celular y en computadora.
	function svgGrafica(r) {
		const anios = r.anios;
		const W = Math.max(300, Math.min(760, Math.round(grafica.clientWidth) || 640));
		const angosto = W < 480;
		const P = { l: 66, r: 10, t: 14, b: 24 };
		const corto = (v) => {
			const m = Math.abs(v);
			const txt = m >= 1e6 ? `${(m / 1e6).toFixed(1)} M` : m >= 1e3 ? `${Math.round(m / 1e3)} k` : String(Math.round(m));
			return `${v < 0 ? '−' : ''}${simbolo()} ${txt}`;
		};
		const ns = 'http://www.w3.org/2000/svg';
		const s = (tag, attrs, txt) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; return e; };
		const paso = anios.length > 20 ? (angosto ? 10 : 5) : anios.length > 10 ? 5 : 1;

		function panel(vals, { H, barras, etiqueta }) {
			const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
			const x = (i) => P.l + (i + 0.5) * (W - P.l - P.r) / vals.length;
			const y = (v) => P.t + (max - v) * (H - P.t - P.b) / ((max - min) || 1);
			const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'calc-svg', role: 'img', 'aria-label': etiqueta });
			const ticks = (min < 0 && max > 0 ? [min, 0, max] : [min, (min + max) / 2, max]).filter((v, i, a) => a.indexOf(v) === i);
			for (const v of ticks) {
				svg.append(s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: v === 0 ? 'calc-eje-cero' : 'calc-eje' }));
				svg.append(s('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'calc-eje-txt' }, corto(v)));
			}
			anios.forEach((a, i) => {
				if (i === 0 || (i + 1) % paso === 0) svg.append(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'calc-eje-txt' }, angosto ? String(a.t) : `Año ${a.t}`));
			});
			if (barras) {
				const bw = Math.max(2, (W - P.l - P.r) / vals.length * 0.62);
				vals.forEach((v, i) => svg.append(s('rect', { x: x(i) - bw / 2, y: Math.min(y(v), y(0)), width: bw, height: Math.max(1, Math.abs(y(v) - y(0))), rx: 1.5, class: v < 0 ? 'calc-barra calc-barra-neg' : 'calc-barra' })));
			} else {
				svg.append(s('polyline', { points: vals.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'calc-linea' }));
				// Marca del payback: donde la línea cruza el cero.
				if (r.payback !== null && r.payback <= vals.length) {
					const px = P.l + r.payback * (W - P.l - P.r) / vals.length;
					svg.append(s('line', { x1: px, x2: px, y1: P.t, y2: H - P.b, class: 'calc-marca' }));
					svg.append(s('circle', { cx: px, cy: y(0), r: 4, class: 'calc-punto' }));
					const der = px + (angosto ? 64 : 200) < W - P.r;
					svg.append(s('text', { x: px + (der ? 6 : -6), y: P.t + 10, 'text-anchor': der ? 'start' : 'end', class: 'calc-marca-txt' }, angosto ? `Año ${r.payback.toFixed(1)}` : `Recuperas la inversión: año ${r.payback.toFixed(1)}`));
				}
			}
			return svg;
		}
		const netos = anios.map((a) => a.neto);
		const acum = anios.map((a) => a.acumulado - r.inversion);
		return h('div', { class: 'calc-graficas' },
			h('figure', { class: 'mb-0' },
				h('figcaption', { class: 'calc-graf-titulo' }, 'Neto de cada año', h('span', {}, ' (lo que te queda, sin la venta)')),
				panel(netos, { H: 150, barras: true, etiqueta: `Neto de cada año durante ${anios.length} años: de ${dinero(netos[0])} el año 1 a ${dinero(netos[netos.length - 1])} el año ${anios.length}` })),
			h('figure', { class: 'mb-0' },
				h('figcaption', { class: 'calc-graf-titulo' }, 'Recuperación de la inversión', h('span', {}, ' (neto acumulado menos la inversión; cruza el cero en el payback)')),
				panel(acum, { H: 190, barras: false, etiqueta: `Neto acumulado menos la inversión: empieza en ${dinero(acum[0])} y termina en ${dinero(acum[acum.length - 1])}${r.payback !== null ? `; recupera la inversión en ${r.payback.toFixed(1)} años` : '; no recupera la inversión en el plazo'}` })));
	}

	function calcular() {
		const e = entradas();
		const listo = e.precio > 0 && e.rentaMensual > 0;
		vacio.hidden = listo;
		resultados.hidden = !listo;
		// Rendimiento objetivo (funciona aunque no haya renta).
		const obj = num(estado.objetivo);
		if (e.precio > 0 && obj !== undefined) {
			const renta = R.rentaParaRendimiento(e.precio, obj, e, paramValores());
			objetivoOut.textContent = renta === null ? `No se llega a ${pct(obj / 100, 1)} neto con estos supuestos.` : `Necesitas cobrar ${dinero(renta)} al mes para un rendimiento neto de ${pct(obj / 100, 1)}.`;
			usarObjetivo.hidden = renta === null;
			if (renta !== null) usarObjetivo.dataset.renta = Math.round(renta / 10) * 10;
		} else { objetivoOut.textContent = 'Ingresa el precio para calcularla.'; usarObjetivo.hidden = true; }
		if (!listo) return;

		const P = paramValores();
		const r = R.calcular(e, P);
		const ne = r.entradas;
		resumenImpresion.textContent = `${TIPOS_DEF.find(([v]) => v === ne.tipo)?.[1] || 'Propiedad'} · precio ${dinero(ne.precio)} · renta ${dinero(ne.rentaMensual)}/mes · uso ${etiqueta(USOS, ne.uso)} · ISR: ${etiqueta(ISR, ne.regimenISR)} · IVA: ${etiqueta(IVA, ne.regimenIVA)} · vacancia ${ne.vacancia} % · gastos ${ne.gastosOperativos} % · plazo ${ne.plazo} años`;

		kpis.replaceChildren(
			kpi('icon-money', 'Neto mensual', dinero(r.netoMensual), 'Año 1, después de impuestos', true),
			kpi('icon-percent', 'Rendimiento bruto', pct(r.rendimientoBruto), 'Renta bruta ÷ precio'),
			kpi('icon-percent', 'Rendimiento neto', pct(r.rendimientoNeto), 'Neto anual ÷ precio'),
			kpi('icon-line-chart', 'Cap rate', pct(r.capRate), 'NOI ÷ precio'),
			kpi('icon-area-chart', 'TIR', pct(r.tir), `${ne.plazo} años, con venta${r.venta.restado ? ' e ISR' : ''}`),
			kpi('icon-calculator', 'VPN', dinero(r.vpn), `Al ${pct(ne.tasaDescuento / 100, 1)}`),
			kpi('icon-hourglass-half', 'Payback', r.payback === null ? 'No se recupera' : `${r.payback.toFixed(1)} años`, 'Sin contar la venta'));

		avisos.replaceChildren(...r.avisos.map((c) => h('div', { class: 'alert alert-warning d-flex gap-2 py-2 mb-2', role: 'note' }, h('span', { class: 'icon-exclamation-triangle mt-1', 'aria-hidden': 'true' }), AVISOS[c] || c)));

		// Estado de resultados del año elegido (1 por defecto).
		const nAnios = r.anios.length;
		if (selAnio.options.length !== nAnios) selAnio.replaceChildren(...r.anios.map((x) => h('option', { value: String(x.t) }, `Año ${x.t}`)));
		anioER = Math.min(Math.max(1, anioER), nAnios);
		selAnio.value = String(anioER);
		tituloER.textContent = `Estado de resultados — año ${anioER}`;
		tablaAnio1.replaceChildren(estadoTabla(R.cascadaAnio(r, anioER), { cols: 'anio', caption: `Estado de resultados del año ${anioER}, de la renta bruta al flujo neto para el dueño` }));

		// Venta al final del plazo y cálculo de la ganancia.
		const v = r.venta;
		tituloVenta.textContent = `Venta al final del plazo (año ${ne.plazo})`;
		tablaVenta.replaceChildren(estadoTabla(R.cascadaVenta(r), { cols: 'venta', caption: `Venta estimada en el año ${ne.plazo}, del precio de venta a lo que te queda` }));
		tablaGanancia.replaceChildren(estadoTabla(R.cascadaGanancia(r), { inicio: ['ingresoNeto'], caption: 'Cálculo de la ganancia de capital y de su impuesto' }));
		sincronizar('restarImpuestoVenta');
		notaVenta.textContent = v.restado
			? 'La TIR, el VPN y el resumen ya restan este impuesto.'
			: `Opción desactivada: la TIR, el VPN y el resumen no restan los ${dinero(v.impuestoCalculado)} de ISR de la venta.`;

		// Resumen de todo el negocio.
		tituloResumen.textContent = `Resumen del negocio a ${ne.plazo} años`;
		tablaResumen.replaceChildren(estadoTabla(R.cascadaResumen(r), { caption: `Resumen del negocio en ${ne.plazo} años: rentas, venta, inversión y ganancia total` }));
		const dato = (k, val, nota) => h('div', { class: 'calc-resumen-dato' }, h('span', { class: 'calc-resumen-k' }, k), h('strong', {}, val), h('span', { class: 'calc-resumen-n' }, nota));
		rendResumen.replaceChildren(
			dato('TIR', pct(r.tir), v.restado ? 'Después del ISR de la venta' : 'Sin restar el ISR de la venta'),
			v.restado && v.impuestoCalculado > 0 ? dato('TIR sin el ISR de la venta', pct(r.tirSinImpuestoVenta), 'Solo para comparar') : null,
			dato('Múltiplo', r.multiplo === null ? '—' : `${r.multiplo.toFixed(2)} veces`, 'Total que recibes ÷ inversión'));

		const esc = R.escenarios(e, [-20, -10, 0, 10, 20], P);
		tablaEsc.replaceChildren(tabla(['Renta', 'Renta mensual', 'Neto mensual', 'Rend. neto', 'TIR'],
			esc.map((x) => [x.delta === 0 ? 'Actual' : `${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} %`, dinero(x.rentaMensual), dinero(x.netoMensual), pct(x.rendimientoNeto), pct(x.tir)]),
			{ total: [2], cls: 'calc-tabla-esc' }));

		ultimoR = r;
		grafica.replaceChildren(svgGrafica(r));
		// Vacíos = valor calculado; se muestra como pista dentro del campo.
		campos.valorFiscal.placeholder = `Q ${Math.round(r.valorFiscalQ).toLocaleString('es-GT')}`;
		campos.iusiMil.placeholder = `${r.iusiTasaMil}`;
		campos.capSalida.placeholder = `${ne.capSalida}`;
		tablaLargo.replaceChildren(tabla(['Año', 'Renta bruta', 'Cobrado', 'Gastos, IUSI y reserva', 'Impuestos', 'Neto', 'Acumulado', 'Flujo'],
			r.anios.map((x) => [String(x.t), dinero(x.pgi), dinero(x.cobrado), dinero(x.opex + x.iusi + x.capex), dinero(x.isr + x.ivaPropietario), dinero(x.neto), dinero(x.acumulado), dinero(x.flujo)]),
			{ cls: 'calc-tabla-larga' }),
		h('p', { class: 'small text-muted mt-2 mb-0' }, `El flujo del año ${ne.plazo} incluye la venta: ${dinero(r.venta.neta)} ${r.venta.restado ? 'después de costos y del ISR sobre la ganancia' : 'después de costos (sin restar el ISR sobre la ganancia)'}. El detalle está en «Venta al final del plazo».`));
	}

	// ── Armado ─────────────────────────────────────────────
	const header = pageHeader('Calculadora de renta',
		h('button', { type: 'button', class: 'btn btn-outline-secondary no-print', onclick: () => { setCampos(DEF); anioER = 1; sincronizar('restarImpuestoVenta'); selProp.value = ''; calcular(); } }, h('span', { class: 'icon-eraser me-1', 'aria-hidden': 'true' }), 'Limpiar'),
		h('button', { type: 'button', class: 'btn btn-primary no-print', onclick: () => window.print() }, h('span', { class: 'icon-file-pdf-o me-1', 'aria-hidden': 'true' }), 'Descargar PDF'));

	const tituloCard = (icono, t, ...extra) => h('div', { class: 'card-header d-flex align-items-center justify-content-between gap-2' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: `${icono} me-2`, 'aria-hidden': 'true' }), t), extra);

	container.replaceChildren();
	mount(container,
		h('div', { class: 'print-only calc-print-head' }, h('img', { src: '/logo-equipo-inmobiliario.png', alt: 'Equipo Inmobiliario', height: '48' }), h('div', {}, h('strong', {}, 'Análisis de renta'), h('div', { class: 'small' }, new Date().toLocaleDateString('es-GT', { dateStyle: 'long' })))),
		header,
		h('p', { class: 'text-muted calc-intro no-print' }, 'Estima cuánto deja una propiedad en renta, con impuestos de Guatemala y proyección a largo plazo. Es una referencia para conversar con el cliente, no una asesoría fiscal.'),
		resumenImpresion,
		h('div', { class: 'row g-4 calc-layout' },
			h('div', { class: 'col-xl-5 calc-entradas no-print' },
				grupo('icon-home', 'Propiedad',
					h('div', { class: 'col-12' }, h('label', { class: 'form-label', for: 'calc-prop' }, 'Propiedad del inventario'), selProp, h('div', { class: 'form-text' }, 'Opcional: llena tipo, moneda, precio y una renta sugerida.')),
					campo('tipo', 'Tipo', { opciones: TIPOS_DEF }),
					campo('uso', 'Uso', { opciones: USOS }),
					campo('moneda', 'Moneda', { opciones: [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']] }),
					campo('precio', 'Precio de compra', { sufijo: 'moneda' }),
					campo('valorFiscal', 'Valor fiscal (para IUSI)', { sufijo: 'Q', ayuda: 'Vacío = precio en quetzales.', col: 'col-12' })),
				grupo('icon-money', 'Renta',
					campo('rentaMensual', 'Renta mensual', { sufijo: 'moneda', col: 'col-12' }),
					campo('vacancia', 'Vacancia', { sufijo: '%' }),
					campo('crecimientoRenta', 'Aumento anual de la renta', { sufijo: '%' })),
				grupo('icon-wrench', 'Gastos',
					campo('gastosOperativos', 'Gastos operativos', { sufijo: '% de lo cobrado' }),
					campo('reservaCapex', 'Reserva de capital', { sufijo: '% de lo cobrado' })),
				grupo('icon-bank', 'Impuestos',
					campo('regimenISR', 'Régimen de ISR', { opciones: ISR, col: 'col-12' }),
					campo('regimenIVA', 'Régimen de IVA', { opciones: IVA, col: 'col-12' }),
					campo('iusiMil', 'IUSI forzado', { sufijo: '‰', ayuda: 'Vacío = según uso y tramo.' }),
					campo('depreciacion', 'Depreciación (solo utilidades)', { sufijo: '% anual' }),
					paramsPanel()),
				grupo('icon-area-chart', 'Largo plazo',
					campo('plazo', 'Plazo', { sufijo: 'años', attrs: { min: '1', max: '50', step: '1' } }),
					campo('tasaDescuento', 'Tasa de descuento (VPN)', { sufijo: '%' }),
					campo('capSalida', 'Cap rate de salida', { sufijo: '%', ayuda: 'Vacío = referencia del tipo + 0.5.' }),
					campo('costosVenta', 'Costos de venta', { sufijo: '%' }),
					campo('costosCompra', 'Costos de compra', { sufijo: '% del precio', ayuda: 'Escritura, notario y registro. Se suman a la inversión y al costo.' }),
					h('div', { class: 'col-12' },
						casilla('capexSumaAlCosto', 'Sumar la reserva al costo de la propiedad', 'Las reparaciones mayores pagadas con la reserva bajan la ganancia de la venta.'),
						casilla('restarImpuestoVenta', 'Restar el ISR sobre la ganancia de la venta', 'Afecta la TIR, el VPN y el resumen.'))),
				h('section', { class: 'card calc-grupo calc-objetivo' },
					h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-line-chart me-2', 'aria-hidden': 'true' }), 'Renta para un rendimiento objetivo')),
					h('div', { class: 'card-body' }, h('div', { class: 'row g-3 align-items-end' },
						campo('objetivo', 'Rendimiento neto que quieres', { sufijo: '%', col: 'col-12' }),
						h('div', { class: 'col-12' }, objetivoOut, usarObjetivo))))),
			h('div', { class: 'col-xl-7 calc-salidas' },
				vacio,
				h('div', { class: 'calc-resultados-wrap' }, resultados))),
		h('section', { class: 'card mt-4 calc-glosario' },
			tituloCard('icon-info-circle', 'Glosario'),
			h('div', { class: 'card-body' }, h('dl', { class: 'row mb-0 small' }, GLOSARIO.map(([t, d]) => [h('dt', { class: 'col-sm-3' }, t), h('dd', { class: 'col-sm-9' }, d)])))));

	mount(resultados,
		kpis, avisos,
		h('section', { class: 'card mb-3 calc-er-card' },
			h('div', { class: 'card-header d-flex align-items-center justify-content-between gap-2 flex-wrap' },
				h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-list-alt me-2', 'aria-hidden': 'true' }), tituloER),
				h('div', { class: 'd-flex align-items-center gap-2 no-print' }, h('label', { class: 'small text-muted mb-0', for: 'calc-anio-er' }, 'Ver año'), selAnio)),
			h('div', { class: 'card-body' }, tablaAnio1)),
		h('section', { class: 'card mb-3 calc-er-card' },
			h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-handshake-o me-2', 'aria-hidden': 'true' }), tituloVenta)),
			h('div', { class: 'card-body' },
				tablaVenta,
				h('div', { class: 'calc-venta-opcion' }, espejoCasilla('restarImpuestoVenta', 'Restar impuesto sobre la ganancia'), notaVenta),
				h('h3', { class: 'calc-er-sub' }, 'Cómo se calcula la ganancia'),
				tablaGanancia)),
		h('section', { class: 'card mb-3 calc-er-card' },
			h('div', { class: 'card-header' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-balance-scale me-2', 'aria-hidden': 'true' }), tituloResumen)),
			h('div', { class: 'card-body' }, tablaResumen, rendResumen)),
		h('section', { class: 'card mb-3' }, tituloCard('icon-sliders', 'Escenarios de renta'), h('div', { class: 'card-body' }, tablaEsc)),
		h('section', { class: 'card mb-3 calc-chart-card' }, tituloCard('icon-area-chart', 'Flujo a largo plazo'), h('div', { class: 'card-body' }, grafica)),
		h('details', { class: 'card calc-detalle' },
			h('summary', { class: 'card-header' }, h('span', { class: 'icon-chevron-down me-2 calc-chev', 'aria-hidden': 'true' }), 'Tabla año por año'),
			h('div', { class: 'card-body' }, tablaLargo)));

	calcular();

	// La gráfica se vuelve a dibujar si cambia el ancho (girar el celular, abrir el menú, imprimir).
	let anchoGrafica = grafica.clientWidth;
	if (window.ResizeObserver) new ResizeObserver(() => {
		const w = grafica.clientWidth;
		if (!ultimoR || !w || Math.abs(w - anchoGrafica) < 8 || !container.isConnected) return;
		anchoGrafica = w;
		grafica.replaceChildren(svgGrafica(ultimoR));
	}).observe(grafica);

	// Al imprimir se abre la tabla año por año (un <details> cerrado no se imprime) y luego vuelve como estaba.
	const detalle = resultados.querySelector('.calc-detalle');
	let estabaAbierto = false;
	const antes = () => { if (!container.isConnected) return window.removeEventListener('beforeprint', antes); estabaAbierto = detalle.open; detalle.open = true; };
	const despues = () => { if (!container.isConnected) return window.removeEventListener('afterprint', despues); detalle.open = estabaAbierto; };
	window.addEventListener('beforeprint', antes);
	window.addEventListener('afterprint', despues);

	// Inventario: se carga aparte para que la calculadora funcione aunque falle la lectura.
	try {
		const { loadAll } = await import('./properties.js');
		props = (await loadAll()).filter((p) => Number(p.precio) > 0);
		const op = (p) => h('option', { value: p.id }, [p.codigo, p.titulo, p.zona].filter(Boolean).join(' · '));
		selProp.append(
			h('optgroup', { label: 'En venta' }, props.filter((p) => p.operacion !== 'renta').map(op)),
			h('optgroup', { label: 'En renta (solo la renta)' }, props.filter((p) => p.operacion === 'renta').map(op)));
	} catch (err) {
		console.warn('Calculadora: no se pudo leer el inventario', err);
	}
}
