// Listado de propiedades en PDF para enviar a un cliente: se filtra, se eligen las propiedades
// y se abre una versión lista para imprimir; el navegador la guarda como PDF.
import { db, doc, getDoc, getDocs, collection, siteConfig } from '../firebase.js';
import { h, esc, toast, pageHeader, emptyState, formatPrice, mount } from '../ui.js';
import { session, loadAgents } from '../session.js';
import { stripMd } from '../seo.js';
import { TIPOS } from './properties.js';

const SITE = (siteConfig.siteUrl || '').replace(/\/$/, '');
const TIPO_LABEL = Object.fromEntries(TIPOS);

function absUrl(url) {
	if (!url) return '';
	try { return new URL(url, location.origin).href; } catch { return ''; }
}

function publicLink(p) {
	return `${SITE || location.origin}${p.vip ? '/vip/' : '/propiedad/'}${p.slug}/`;
}

function cut(text, max) {
	const t = stripMd(text).replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}

function precioPdf(p, mostrarPrecio) {
	if (!mostrarPrecio || (p.vip && p.vipLanding?.ocultarPrecio)) return 'Precio a consultar';
	return formatPrice(p.precio, p.moneda, p.operacion);
}

function specs(p) {
	return [
		p.habitaciones && `${p.habitaciones} hab.`,
		p.banos && `${p.banos} baños`,
		p.parqueos && `${p.parqueos} parqueos`,
		p.m2Construccion && `${p.m2Construccion} m² const.`,
		p.m2Terreno && `${p.m2Terreno} m² terreno`
	].filter(Boolean);
}

function ubicacion(p) {
	return [p.direccion, p.zona, p.ciudad].filter(Boolean).join(', ');
}

function fichaCompleta(p, opts) {
	const fotos = (p.fotos || []).map((f) => absUrl(f.url)).filter(Boolean);
	const amen = (p.amenidades || []).slice(0, 12);
	return `
	<section class="ficha">
		${fotos[0] ? `<img class="foto-principal" src="${esc(fotos[0])}" alt="">` : '<div class="foto-principal sin-foto">Sin foto</div>'}
		${fotos.length > 1 ? `<div class="fotos-extra">${fotos.slice(1, 4).map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}
		<div class="ficha-cabecera">
			<div>
				<div class="etiqueta">${esc(TIPO_LABEL[p.tipo] || 'Propiedad')} en ${p.operacion === 'renta' ? 'renta' : 'venta'}</div>
				<h2>${esc(p.titulo)}</h2>
				<div class="ubicacion">${esc(ubicacion(p))}</div>
			</div>
			<div class="precio">${esc(precioPdf(p, opts.mostrarPrecio))}</div>
		</div>
		${specs(p).length ? `<ul class="specs">${specs(p).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
		<p class="descripcion">${esc(cut(p.descripcion, 900))}</p>
		${amen.length ? `<div class="amenidades"><strong>Amenidades:</strong> ${amen.map(esc).join(' · ')}</div>` : ''}
		${opts.enlaces && p.slug ? `<div class="enlace">Ver fotos y detalles: <a href="${esc(publicLink(p))}">${esc(publicLink(p))}</a></div>` : ''}
	</section>`;
}

function filaCompacta(p, opts) {
	const foto = absUrl(p.fotos?.[0]?.url);
	return `
	<section class="fila">
		${foto ? `<img src="${esc(foto)}" alt="">` : '<div class="sin-foto">Sin foto</div>'}
		<div class="fila-datos">
			<div class="etiqueta">${esc(TIPO_LABEL[p.tipo] || 'Propiedad')} en ${p.operacion === 'renta' ? 'renta' : 'venta'}</div>
			<h2>${esc(p.titulo)}</h2>
			<div class="ubicacion">${esc(ubicacion(p))}</div>
			<div class="precio">${esc(precioPdf(p, opts.mostrarPrecio))}</div>
			${specs(p).length ? `<ul class="specs">${specs(p).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
			<p class="descripcion">${esc(cut(p.descripcion, 260))}</p>
			${opts.enlaces && p.slug ? `<div class="enlace"><a href="${esc(publicLink(p))}">${esc(publicLink(p))}</a></div>` : ''}
		</div>
	</section>`;
}

export function documento(props, opts, empresa, contacto) {
	const fecha = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
	const tarjetaContacto = `<div class="asesor"><span class="etiqueta">${esc(contacto.etiqueta)}</span><strong>${esc(contacto.nombre)}</strong>${[contacto.telefono, contacto.email].filter(Boolean).map(esc).join('<br>')}</div>`;
	const css = `
		@page { size: letter; margin: 14mm 14mm 18mm; }
		* { box-sizing: border-box; }
		body { font-family: 'Work Sans', Arial, sans-serif; color: #0e1920; margin: 0; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		a { color: #0e5e8a; text-decoration: none; word-break: break-all; }
		.portada { height: 230mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
		.portada img.logo { width: 34mm; margin-bottom: 10mm; }
		.portada .marca { font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; color: #0e5e8a; font-weight: 600; }
		.portada h1 { font-size: 30pt; line-height: 1.1; margin: 4mm 0 6mm; }
		.portada .linea { width: 30mm; height: 1.2mm; background: #00b7e7; margin-bottom: 8mm; }
		.portada .meta { color: #5b666f; font-size: 11pt; }
		.asesor { margin-top: 18mm; padding: 6mm; border: 1px solid #d5dbe0; border-radius: 3mm; max-width: 110mm; }
		.asesor strong { display: block; font-size: 12pt; }
		.cierre { margin-top: 10mm; page-break-inside: avoid; }
		.cierre h2 { font-size: 15pt; }
		.cierre .asesor { margin-top: 4mm; }
		.portada .nota { margin-top: 8mm; max-width: 140mm; }
		.etiqueta { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #0e5e8a; font-weight: 600; }
		h2 { font-size: 16pt; margin: 1mm 0; line-height: 1.2; }
		.ubicacion { color: #5b666f; }
		.precio { font-size: 15pt; font-weight: 700; color: #0e5e8a; white-space: nowrap; }
		.specs { list-style: none; padding: 0; margin: 3mm 0; display: flex; flex-wrap: wrap; gap: 2mm; }
		.specs li { background: #eef4f8; border-radius: 2mm; padding: 1mm 3mm; font-size: 9.5pt; }
		.descripcion { margin: 2mm 0; }
		.amenidades, .enlace { font-size: 9.5pt; margin-top: 2mm; }
		.sin-foto { background: #eef4f8; color: #5b666f; display: flex; align-items: center; justify-content: center; }
		.ficha { page-break-after: always; }
		.ficha:last-child { page-break-after: auto; }
		.ficha .foto-principal { width: 100%; height: 105mm; object-fit: cover; border-radius: 3mm; display: block; }
		.fotos-extra { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-top: 2.5mm; }
		.fotos-extra img { width: 100%; height: 34mm; object-fit: cover; border-radius: 2mm; }
		.ficha-cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; margin-top: 5mm; }
		.fila { display: grid; grid-template-columns: 62mm 1fr; gap: 6mm; padding: 5mm 0; border-bottom: 1px solid #d5dbe0; page-break-inside: avoid; }
		.fila img, .fila .sin-foto { width: 62mm; height: 46mm; object-fit: cover; border-radius: 2mm; }
		.fila h2 { font-size: 13pt; }
		.fila .precio { font-size: 12.5pt; margin-top: 1mm; }
		.fila .specs { margin: 2mm 0; }
		.fila .descripcion { font-size: 9.5pt; }
		.aviso { position: fixed; top: 0; left: 0; right: 0; background: #0e5e8a; color: #fff; padding: 10px 16px; font-size: 14px; display: flex; gap: 12px; align-items: center; justify-content: center; }
		.aviso button { font: inherit; border: 0; border-radius: 6px; padding: 6px 14px; background: #fff; color: #0e5e8a; cursor: pointer; }
		@media screen { body { background: #e9edf0; padding: 70px 0 40px; } main { background: #fff; max-width: 216mm; margin: 0 auto; padding: 14mm; } }
		@media print { .aviso { display: none; } }`;
	const cuerpo = opts.formato === 'compacto'
		? `<section class="lista">${props.map((p) => filaCompacta(p, opts)).join('')}</section>`
		: props.map((p) => fichaCompleta(p, opts)).join('');
	return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(opts.titulo || 'Propiedades')} · ${esc(empresa)}</title>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="aviso">En la ventana de impresión elige «Guardar como PDF». <button onclick="print()">Guardar PDF</button></div>
<main>
	<section class="portada">
		<img class="logo" src="${esc(absUrl('/docs/marca/logo/imagotipo-azul.svg'))}" alt="">
		<div class="marca">${esc(empresa)}</div>
		<h1>${esc(opts.titulo || 'Propiedades seleccionadas')}</h1>
		<div class="linea"></div>
		<div class="meta">${opts.cliente ? `Preparado para <strong>${esc(opts.cliente)}</strong> · ` : ''}${esc(fecha)} · ${props.length} ${props.length === 1 ? 'propiedad' : 'propiedades'}</div>
		${opts.nota ? `<p class="nota">${esc(opts.nota)}</p>` : ''}
		${tarjetaContacto}
	</section>
	${cuerpo}
	<section class="cierre">
		<h2>¿Te interesa alguna?</h2>
		<p>Escríbenos para resolver tus dudas o agendar una visita.</p>
		${tarjetaContacto}
	</section>
</main>
<script>
	// Abre la ventana de impresión cuando todas las fotos terminaron de cargar.
	Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))
		.then(() => document.fonts.ready).then(() => setTimeout(() => print(), 300));
</script>
</body></html>`;
}

export async function render(container) {
	const [snap, agents, site] = await Promise.all([
		getDocs(collection(db, 'properties')),
		loadAgents(),
		getDoc(doc(db, 'settings', 'site')).then((s) => s.data() || {}).catch(() => ({}))
	]);
	const props = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
		.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || String(a.titulo).localeCompare(String(b.titulo)));
	const empresa = site.general?.nombre || 'Equipo Inmobiliario';

	if (!props.length) {
		mount(container, pageHeader('Listado en PDF'),
			emptyState('Aún no hay propiedades para armar un listado.', h('a', { href: '#/propiedades/nuevo', class: 'btn btn-primary' }, 'Crear la primera')));
		return;
	}

	const zonas = [...new Set(props.map((p) => p.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
	const sel = (opts) => h('select', { class: 'form-select' }, opts.map(([v, l]) => h('option', { value: v }, l)));
	const num = (placeholder) => h('input', { class: 'form-control', type: 'number', min: 0, placeholder });

	const fOperacion = sel([['', 'Venta y renta'], ['venta', 'Venta'], ['renta', 'Renta']]);
	const fTipo = sel([['', 'Todos los tipos'], ...TIPOS]);
	const fZona = sel([['', 'Todas las zonas'], ...zonas.map((z) => [z, z])]);
	const fMoneda = sel([['', 'Cualquier moneda'], ['USD', 'US$'], ['GTQ', 'Q']]);
	const fMin = num('Precio mínimo');
	const fMax = num('Precio máximo');
	const fHab = num('Habitaciones mín.');
	const fDisponibles = h('input', { class: 'form-check-input', type: 'checkbox', id: 'pdf-disp', checked: true });
	const fPublicadas = h('input', { class: 'form-check-input', type: 'checkbox', id: 'pdf-pub', checked: true });

	const cliente = h('input', { class: 'form-control', id: 'pdf-cliente', placeholder: 'Familia Pérez' });
	const titulo = h('input', { class: 'form-control', id: 'pdf-titulo', value: 'Propiedades seleccionadas para ti' });
	const nota = h('textarea', { class: 'form-control', id: 'pdf-nota', rows: 2, placeholder: 'Opcional. Ej. Estas opciones cumplen con 3 habitaciones y jardín en zona 16.' });
	const asesor = sel([['', `Contacto general de ${empresa}`], ...agents.map((a) => [a.id, a.nombre])]);
	asesor.id = 'pdf-asesor';
	asesor.value = agents.some((a) => a.id === session.agentId) ? session.agentId : '';
	const formato = sel([['completo', 'Una propiedad por página, con fotos'], ['compacto', 'Lista compacta, varias por página']]);
	formato.id = 'pdf-formato';
	const mostrarPrecio = h('input', { class: 'form-check-input', type: 'checkbox', id: 'pdf-precio', checked: true });
	const enlaces = h('input', { class: 'form-check-input', type: 'checkbox', id: 'pdf-enlaces', checked: true });

	const elegidas = new Set();
	const tbody = h('tbody');
	const count = h('span', { class: 'small text-muted' });
	const todas = h('input', { class: 'form-check-input', type: 'checkbox', 'aria-label': 'Seleccionar todas' });
	let visibles = [];

	const filtrar = () => {
		const min = Number(fMin.value) || 0;
		const max = Number(fMax.value) || Infinity;
		const hab = Number(fHab.value) || 0;
		return props.filter((p) =>
			(!fOperacion.value || p.operacion === fOperacion.value)
			&& (!fTipo.value || p.tipo === fTipo.value)
			&& (!fZona.value || p.zona === fZona.value)
			&& (!fMoneda.value || p.moneda === fMoneda.value)
			&& (!min || (p.precio || 0) >= min)
			&& (max === Infinity || (p.precio && p.precio <= max))
			&& (!hab || (p.habitaciones || 0) >= hab)
			&& (!fDisponibles.checked || !p.estado || p.estado === 'disponible')
			&& (!fPublicadas.checked || p.publicado));
	};

	const draw = (reset) => {
		visibles = filtrar();
		if (reset) { elegidas.clear(); visibles.forEach((p) => elegidas.add(p.id)); }
		const n = visibles.filter((p) => elegidas.has(p.id)).length;
		count.textContent = `${n} de ${visibles.length} seleccionadas`;
		todas.checked = n > 0 && n === visibles.length;
		todas.indeterminate = n > 0 && n < visibles.length;
		tbody.replaceChildren(...visibles.map((p) => {
			const check = h('input', { class: 'form-check-input', type: 'checkbox', checked: elegidas.has(p.id), 'aria-label': `Incluir ${p.titulo}` });
			check.addEventListener('change', () => { if (check.checked) elegidas.add(p.id); else elegidas.delete(p.id); draw(false); });
			return h('tr', {},
				h('td', {}, check),
				h('td', {}, h('img', { class: 'thumb', src: p.fotos?.[0]?.url || '', alt: '' })),
				h('td', {}, h('div', { class: 'fw-semibold' }, p.titulo || '(sin título)'), h('div', { class: 'small text-muted' }, ubicacion(p))),
				h('td', { class: 'text-nowrap' }, formatPrice(p.precio, p.moneda, p.operacion)),
				h('td', { class: 'small text-muted' }, specs(p).slice(0, 2).join(' · ')));
		}));
		if (!visibles.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: 5, class: 'text-center text-muted py-4' }, 'Ninguna propiedad cumple con estos filtros.')));
	};
	todas.addEventListener('change', () => { visibles.forEach((p) => (todas.checked ? elegidas.add(p.id) : elegidas.delete(p.id))); draw(false); });
	[fOperacion, fTipo, fZona, fMoneda, fMin, fMax, fHab, fDisponibles, fPublicadas].forEach((el) => el.addEventListener('input', () => draw(true)));

	const generar = () => {
		const lista = visibles.filter((p) => elegidas.has(p.id));
		if (!lista.length) { toast('Selecciona al menos una propiedad.', 'warning'); return; }
		const a = agents.find((x) => x.id === asesor.value);
		const contacto = a
			? { etiqueta: 'Tu asesor', nombre: a.nombre, telefono: a.whatsapp ? `WhatsApp +${String(a.whatsapp).replace(/\D/g, '')}` : '', email: a.email }
			: { etiqueta: 'Contacto', nombre: empresa, telefono: site.contacto?.telefono || (site.contacto?.whatsapp ? `WhatsApp +${site.contacto.whatsapp}` : ''), email: site.contacto?.email };
		const win = window.open('', '_blank');
		if (!win) { toast('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.', 'danger'); return; }
		win.document.open();
		win.document.write(documento(lista, {
			cliente: cliente.value.trim(), titulo: titulo.value.trim(), nota: nota.value.trim(),
			formato: formato.value, mostrarPrecio: mostrarPrecio.checked, enlaces: enlaces.checked
		}, empresa, contacto));
		win.document.close();
	};

	const check = (input, label) => h('div', { class: 'form-check' }, input, h('label', { class: 'form-check-label', for: input.id }, label));
	const field = (label, input, cols) => h('div', { class: cols }, h('label', { class: 'form-label small', for: input.id }, label), input);

	draw(true);
	mount(container,
		pageHeader('Listado en PDF', h('button', { class: 'btn btn-primary', onclick: generar }, 'Generar PDF')),
		h('p', { class: 'text-muted' }, 'Filtra según lo que busca tu cliente, marca las propiedades y genera un PDF con tu marca y tus datos de contacto, listo para enviar por WhatsApp o correo.'),
		h('div', { class: 'card p-3 mb-3' },
			h('h2', { class: 'h6 mb-3' }, '1. ¿Qué busca el cliente?'),
			h('div', { class: 'row g-2' },
				h('div', { class: 'col-6 col-md-3' }, fOperacion),
				h('div', { class: 'col-6 col-md-3' }, fTipo),
				h('div', { class: 'col-6 col-md-3' }, fZona),
				h('div', { class: 'col-6 col-md-3' }, fMoneda),
				h('div', { class: 'col-6 col-md-3' }, fMin),
				h('div', { class: 'col-6 col-md-3' }, fMax),
				h('div', { class: 'col-6 col-md-3' }, fHab),
				h('div', { class: 'col-6 col-md-3 d-flex flex-column justify-content-center' },
					check(fDisponibles, 'Solo disponibles'), check(fPublicadas, 'Solo publicadas')))),
		h('div', { class: 'card overflow-hidden mb-3' },
			h('div', { class: 'd-flex justify-content-between align-items-center p-3 pb-0' }, h('h2', { class: 'h6 mb-0' }, '2. Elige las propiedades'), count),
			h('div', { class: 'table-responsive' },
				h('table', { class: 'table table-admin mb-0' },
					h('thead', {}, h('tr', {}, h('th', {}, todas), ['', 'Propiedad', 'Precio', 'Características'].map((t) => h('th', {}, t)))),
					tbody))),
		h('div', { class: 'card p-3 mb-3' },
			h('h2', { class: 'h6 mb-3' }, '3. Datos del PDF'),
			h('div', { class: 'row g-3' },
				field('Para (cliente)', cliente, 'col-md-4'),
				field('Título de la portada', titulo, 'col-md-4'),
				field('Contacto que aparece', asesor, 'col-md-4'),
				field('Nota en la portada', nota, 'col-md-8'),
				field('Formato', formato, 'col-md-4'),
				h('div', { class: 'col-12 d-flex flex-wrap gap-4' },
					check(mostrarPrecio, 'Mostrar precios'), check(enlaces, 'Incluir enlace a cada ficha del sitio'))),
			h('div', { class: 'mt-3' }, h('button', { class: 'btn btn-primary', onclick: generar }, 'Generar PDF'))));
}
