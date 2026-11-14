// Listado de propiedades en PDF para enviar a un cliente: se filtra, se eligen las propiedades
// y se abre una versión lista para imprimir; el navegador la guarda como PDF.
import { db, doc, getDoc, getDocs, collection, siteConfig } from '../firebase.js';
import { h, esc, toast, pageHeader, emptyState, formatPrice, mount, cajaTabla } from '../ui.js';
import { session, loadAgents } from '../session.js';
import { stripMd } from '../seo.js';
import { TIPOS } from './properties.js';
import { datosDe } from '../ficha-casa.js';
import { estadoDe, operacionDe, enOperacion } from '../estados.js';
import { colorTema } from '../tema-def.js';
import { telefonoWa, whatsappUrl } from '../formato.js';

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

// Ficha técnica: [etiqueta, valor] solo con los datos que tiene la propiedad.
function datos(p) {
	const n = (v) => Number(v).toLocaleString('en-US');
	return [
		['Tipo', TIPO_LABEL[p.tipo] || ''],
		['Operación', operacionDe(p)],
		['Zona', p.zona],
		['Habitaciones', p.habitaciones],
		['Baños', p.banos],
		['Parqueos', p.parqueos],
		['Construcción', p.m2Construccion && `${n(p.m2Construccion)} m²`],
		['Terreno', p.m2Terreno && `${n(p.m2Terreno)} m²`]
	].filter(([, v]) => v);
}

// Ícono de cada dato, los mismos que usa la ficha del sitio.
const ICONO_DATO = {
	Tipo: 'building', Operación: 'tag', Zona: 'map-marker', Habitaciones: 'bed', Baños: 'bath',
	Parqueos: 'car', Construcción: 'home2', Terreno: 'expand'
};
const ic = (nombre) => (nombre ? `<span class="icon-${nombre} ic" aria-hidden="true"></span>` : '');

// Enlaces del contacto para que en el PDF se pueda tocar el WhatsApp, el teléfono o el correo.
function enlaceTelefono(telefono, titulo) {
	if (!telefonoWa(telefono)) return '';
	return /whatsapp/i.test(telefono)
		? whatsappUrl(telefono, `Hola, vi el listado «${titulo}» y me interesa una propiedad.`)
		: `tel:${String(telefono).replace(/[^\d+]/g, '')}`;
}
const iconoTelefono = (telefono) => ic(/whatsapp/i.test(telefono) ? 'whatsapp' : 'phone');

function ubicacion(p) {
	return [p.direccion, p.zona, p.ciudad].filter(Boolean).join(', ');
}

function etiquetaTipo(p) {
	return `${TIPO_LABEL[p.tipo] || 'Propiedad'} ${enOperacion(p)}`;
}

function cabeceraPagina(empresa, n, total) {
	return `<div class="cabecera"><span>${esc(empresa)}</span><span>${n} / ${total}</span></div>`;
}

function fichaCompleta(p, opts, n, total, empresa, contacto) {
	const fotos = (p.fotos || []).map((f) => absUrl(f.url)).filter(Boolean);
	const amen = (p.amenidades || []).slice(0, 12);
	return `
	<section class="ficha${fotos.length > 1 ? ' con-miniaturas' : ''}${n === total ? ' ultima' : ''}">
		${cabeceraPagina(empresa, n, total)}
		${fotos[0] ? `<img class="foto-principal" src="${esc(fotos[0])}" alt="">` : '<div class="foto-principal sin-foto">Sin foto</div>'}
		${fotos.length > 1 ? `<div class="fotos-extra" style="grid-template-columns: repeat(${Math.min(fotos.length - 1, 3)}, 1fr)">${fotos.slice(1, 4).map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}
		<div class="titular">
			<div>
				<div class="etiqueta">${esc(etiquetaTipo(p))}</div>
				<h2>${esc(p.titulo)}</h2>
				<div class="ubicacion">${ic('map-marker')}${esc(ubicacion(p))}</div>
			</div>
			<div class="precio">${esc(precioPdf(p, opts.mostrarPrecio))}</div>
		</div>
		<div class="cuerpo">
			<div>
				<h3>${ic('align-left')}Descripción</h3>
				<p class="descripcion">${esc(cut(p.descripcion, 750))}</p>
				${amen.length ? `<h3>${ic('check-square-o')}Amenidades</h3><ul class="amenidades">${amen.map((a) => `<li>${ic('check')}${esc(a)}</li>`).join('')}</ul>` : ''}
			</div>
			<aside>
				<h3>${ic('list-ul')}Ficha técnica</h3>
				<dl class="datos">${datos(p).map(([k, v]) => `<dt>${ic(ICONO_DATO[k])}${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
			</aside>
		</div>
		<div class="pie-ficha">
			${opts.enlaces && p.slug ? `<div><span>${ic('camera')}Más fotos y detalles</span><a href="${esc(publicLink(p))}">${esc(publicLink(p).replace(/^https?:\/\//, ''))}</a></div>` : '<div></div>'}
			<div class="pie-contacto"><span>${ic('user')}${esc(contacto.etiqueta)}</span>${esc(contacto.nombre)}${contacto.telefono ? ` · <a href="${esc(enlaceTelefono(contacto.telefono, opts.titulo || 'Propiedades'))}">${iconoTelefono(contacto.telefono)}${esc(contacto.telefono)}</a>` : ''}</div>
		</div>
	</section>`;
}

function filaCompacta(p, opts, n) {
	const foto = absUrl(p.fotos?.[0]?.url);
	const claves = datos(p).filter(([k]) => ['Habitaciones', 'Baños', 'Construcción', 'Terreno', 'Parqueos'].includes(k)).slice(0, 4);
	return `
	<section class="fila">
		<div class="fila-foto">
			${foto ? `<img src="${esc(foto)}" alt="">` : '<div class="sin-foto">Sin foto</div>'}
			<span class="numero">${n}</span>
		</div>
		<div class="fila-datos">
			<div class="fila-top">
				<div>
					<div class="etiqueta">${esc(etiquetaTipo(p))}</div>
					<h2>${esc(p.titulo)}</h2>
					<div class="ubicacion">${ic('map-marker')}${esc(ubicacion(p))}</div>
				</div>
				<div class="precio">${esc(precioPdf(p, opts.mostrarPrecio))}</div>
			</div>
			${claves.length ? `<dl class="claves">${claves.map(([k, v]) => `<div><dt>${ic(ICONO_DATO[k])}${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
			<p class="descripcion">${esc(cut(p.descripcion, 220))}</p>
			${opts.enlaces && p.slug ? `<a class="enlace-corto" href="${esc(publicLink(p))}">${ic('link')}${esc(publicLink(p).replace(/^https?:\/\//, ''))}</a>` : ''}
		</div>
	</section>`;
}

export function documento(props, opts, empresa, contacto, tema = {}) {
	const fecha = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
	const lineasContacto = [
		contacto.telefono && `<a href="${esc(enlaceTelefono(contacto.telefono, opts.titulo || 'Propiedades'))}">${iconoTelefono(contacto.telefono)}${esc(contacto.telefono)}</a>`,
		contacto.email && `<a href="mailto:${esc(contacto.email)}">${ic('envelope-o')}${esc(contacto.email)}</a>`
	].filter(Boolean).join('<br>');
	const tarjetaContacto = `<div class="asesor"><span class="avatar">${esc((contacto.nombre || '').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase())}</span><div><span class="etiqueta">${esc(contacto.etiqueta)}</span><strong>${esc(contacto.nombre)}</strong><span class="lineas">${lineasContacto}</span></div></div>`;
	const total = props.length;
	const css = `
		@page { size: letter; margin: 12mm 14mm 14mm; }
		* { box-sizing: border-box; }
		/* Colores del tema del sitio (Contenido → Colores). */
		:root { --tinta: ${colorTema(tema, 'dark')}; --azul: ${colorTema(tema, 'primary')}; --celeste: ${colorTema(tema, 'cyan')}; --gris: ${colorTema(tema, 'ink')}; --blanco: ${colorTema(tema, 'white')};
			--linea: color-mix(in srgb, var(--tinta) 12%, var(--blanco)); --suave: color-mix(in srgb, var(--azul) 6%, var(--blanco)); }
		body span.ic { display: inline-block; font-size: .95em; margin-right: 1.6mm; color: var(--azul); vertical-align: -.05em; }
		h3 .ic, .etiqueta .ic { margin-right: 1.2mm; }
		.ubicacion .ic, .pie-ficha span .ic, .asesor .lineas .ic, .portada-datos span .ic { color: var(--gris); }
		.amenidades .ic { font-size: .8em; margin-right: 1mm; }
		.datos dt .ic { width: 4mm; display: inline-block; text-align: center; }
		body { font-family: 'Work Sans', Arial, sans-serif; color: var(--tinta); margin: 0; font-size: 10pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		a { color: var(--azul); text-decoration: none; }
		h2 { font-size: 17pt; margin: 1mm 0 .5mm; line-height: 1.15; letter-spacing: -.01em; }
		h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: .12em; color: var(--azul); margin: 0 0 2mm; }
		.etiqueta { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .12em; color: var(--azul); font-weight: 600; }
		.ubicacion { color: var(--gris); font-size: 9.5pt; }
		.precio { font-size: 16pt; font-weight: 700; color: var(--azul); white-space: nowrap; }
		.sin-foto { background: var(--suave); color: var(--gris); display: flex; align-items: center; justify-content: center; }

		/* Portada */
		.portada { height: 252mm; display: flex; flex-direction: column; page-break-after: always; }
		.portada-banda { background: var(--tinta); color: var(--blanco); border-radius: 4mm; padding: 14mm 12mm 12mm; position: relative; overflow: hidden; }
		.portada-banda::after { content: ""; position: absolute; right: -24mm; bottom: -30mm; width: 62mm; height: 62mm; border-radius: 50%; border: 10mm solid color-mix(in srgb, var(--celeste) 22%, transparent); }
		.portada-banda img { width: 18mm; height: 18mm; }
		.portada-banda .marca { margin-top: 5mm; font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: var(--celeste); font-weight: 600; }
		.portada-banda > * { position: relative; z-index: 1; }
		.portada-banda h1 { font-size: 28pt; line-height: 1.1; margin: 3mm 0 0; max-width: 125mm; letter-spacing: -.01em; }
		.portada-datos { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 10mm; border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea); }
		.portada-datos div { padding: 5mm 0; }
		.portada-datos div + div { padding-left: 6mm; border-left: 1px solid var(--linea); }
		.portada-datos span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .12em; color: var(--gris); }
		.portada-datos strong { display: block; font-size: 12pt; margin-top: 1mm; }
		.nota { margin: 8mm 0 0; font-size: 11pt; max-width: 150mm; color: var(--tinta); }
		.indice { margin-top: 8mm; }
		.indice ol { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: 8mm; }
		.indice li { display: flex; gap: 3mm; padding: 1.6mm 0; border-bottom: 1px dotted var(--linea); break-inside: avoid; font-size: 9.5pt; }
		.indice li b { color: var(--azul); min-width: 5mm; }
		.indice li span { flex: 1; }
		.indice-mas { margin: 2mm 0 0; color: var(--gris); font-size: 9pt; }
		.indice li em { font-style: normal; color: var(--gris); white-space: nowrap; }
		.portada .asesor { margin-top: auto; }

		.asesor { display: flex; align-items: center; gap: 5mm; padding: 5mm 6mm; background: var(--suave); border-radius: 3mm; max-width: 120mm; }
		.asesor .avatar { width: 13mm; height: 13mm; flex: none; border-radius: 50%; background: var(--azul); color: var(--blanco); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11pt; }
		.asesor strong { display: block; font-size: 12pt; }
		.asesor .lineas { display: block; color: var(--gris); font-size: 9.5pt; }
		.asesor .lineas a, .pie-contacto a { color: inherit; text-decoration: none; }

		/* Cabecera de cada página */
		.cabecera { display: flex; justify-content: space-between; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .12em; color: var(--gris); padding-bottom: 2.5mm; margin-bottom: 4mm; border-bottom: 1px solid var(--linea); }

		/* Una propiedad por página */
		.ficha { page-break-after: always; height: 252mm; display: flex; flex-direction: column; }
		.ficha.ultima { page-break-after: auto; }
		.ficha .foto-principal { width: 100%; height: 104mm; object-fit: cover; border-radius: 3mm; display: block; flex: none; }
		.ficha.con-miniaturas .foto-principal { height: 86mm; }
		.ficha .foto-principal.sin-foto { display: flex; }
		.fotos-extra { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; margin-top: 2.5mm; }
		.fotos-extra img { width: 100%; height: 28mm; object-fit: cover; border-radius: 2mm; }
		.titular { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 5mm; padding-bottom: 4mm; border-bottom: 1px solid var(--linea); }
		.cuerpo { display: grid; grid-template-columns: 1fr 66mm; gap: 8mm; margin-top: 5mm; }
		.descripcion { margin: 0 0 4mm; }
		.amenidades { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 1.5mm; }
		.amenidades li { background: var(--suave); border-radius: 1.5mm; padding: .6mm 2.5mm; font-size: 8.5pt; }
		.datos { margin: 0; display: grid; grid-template-columns: auto 1fr; border-top: 1px solid var(--linea); }
		.datos dt, .datos dd { margin: 0; padding: 1.4mm 0; border-bottom: 1px solid var(--linea); font-size: 9pt; }
		.datos dt { color: var(--gris); padding-right: 4mm; }
		.datos dd { text-align: right; font-weight: 600; }
		.pie-ficha { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; padding-top: 3mm; border-top: 1px solid var(--linea); font-size: 8.5pt; }
		.pie-ficha span { display: block; color: var(--gris); text-transform: uppercase; letter-spacing: .1em; font-size: 7pt; }
		.pie-ficha a { word-break: break-all; }
		.pie-contacto { text-align: right; white-space: nowrap; }
		.enlace { display: flex; justify-content: space-between; align-items: center; gap: 4mm; margin-top: 6mm; padding: 3mm 4mm; border: 1px solid var(--linea); border-radius: 2mm; font-size: 8.5pt; }
		.enlace span { color: var(--gris); text-transform: uppercase; letter-spacing: .1em; font-size: 7.5pt; white-space: nowrap; }
		.enlace a { word-break: break-all; text-align: right; }

		/* Lista compacta */
		.lista .cabecera { margin-bottom: 0; }
		.fila { display: grid; grid-template-columns: 60mm 1fr; gap: 6mm; padding: 5mm 0; border-bottom: 1px solid var(--linea); page-break-inside: avoid; }
		.fila-foto { position: relative; }
		.fila-foto img, .fila-foto .sin-foto { width: 60mm; height: 45mm; object-fit: cover; border-radius: 2.5mm; display: block; }
		.fila-foto .sin-foto { display: flex; }
		.numero { position: absolute; top: 2mm; left: 2mm; width: 7mm; height: 7mm; border-radius: 50%; background: var(--tinta); color: var(--blanco); font-size: 8.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
		.fila-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; }
		.fila h2 { font-size: 12.5pt; }
		.fila .precio { font-size: 12.5pt; }
		.claves { display: flex; gap: 0; margin: 3mm 0; border: 1px solid var(--linea); border-radius: 2mm; }
		.claves div { flex: 1; padding: 1.5mm 3mm; }
		.claves div + div { border-left: 1px solid var(--linea); }
		.claves dt { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: var(--gris); }
		.claves dd { margin: 0; font-weight: 600; font-size: 9.5pt; }
		.fila .descripcion { font-size: 9pt; color: color-mix(in srgb, var(--tinta) 82%, var(--blanco)); margin: 0 0 1.5mm; }
		.enlace-corto { font-size: 8.5pt; word-break: break-all; }

		/* Cierre */
		.cierre { margin-top: 10mm; page-break-inside: avoid; border-top: 3px solid var(--celeste); padding-top: 6mm; }
		.cierre h2 { font-size: 15pt; }
		.cierre p { color: var(--gris); margin: 1mm 0 4mm; }

		.aviso { position: fixed; top: 0; left: 0; right: 0; background: var(--tinta); color: var(--blanco); padding: 10px 16px; font-size: 14px; display: flex; gap: 12px; align-items: center; justify-content: center; z-index: 5; }
		.aviso button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 6px 14px; background: var(--celeste); color: var(--tinta); cursor: pointer; }
		@media screen { body { background: #e9edf0; padding: 70px 0 40px; } main { background: var(--blanco); max-width: 216mm; margin: 0 auto; padding: 12mm 14mm; } .ficha, .portada { margin-bottom: 14mm; height: auto; min-height: 240mm; } }
		@media print { .aviso { display: none; } }`;
	const cuerpo = opts.formato === 'compacto'
		? props.reduce((html, p, i) => html
			+ (i % 3 === 0 ? `${i ? '</section>' : ''}<section class="lista"${i ? ' style="page-break-before: always"' : ''}>${cabeceraPagina(empresa, Math.floor(i / 3) + 1, Math.ceil(total / 3))}` : '')
			+ filaCompacta(p, opts, i + 1), '') + '</section>'
		: props.map((p, i) => fichaCompleta(p, opts, i + 1, total, empresa, contacto)).join('');
	return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc([opts.titulo || 'Propiedades', opts.cliente, empresa].filter(Boolean).join(' · '))}</title>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<link href="${esc(absUrl('/fonts/icomoon/style.css'))}" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="aviso">En la ventana de impresión elige «Guardar como PDF». <button onclick="print()">${ic('file-pdf-o')}Guardar PDF</button></div>
<main>
	<section class="portada">
		<div class="portada-banda">
			<img src="${esc(absUrl('/docs/marca/logo/imagotipo-blanco.svg'))}" alt="">
			<div class="marca">${esc(empresa)}</div>
			<h1>${esc(opts.titulo || 'Propiedades seleccionadas')}</h1>
		</div>
		<div class="portada-datos">
			<div><span>${ic('user')}Preparado para</span><strong>${esc(opts.cliente || '—')}</strong></div>
			<div><span>${ic('calendar')}Fecha</span><strong>${esc(fecha)}</strong></div>
			<div><span>${ic('home2')}Propiedades</span><strong>${total}</strong></div>
		</div>
		${opts.nota ? `<p class="nota">${esc(opts.nota)}</p>` : ''}
		<div class="indice">
			<h3>${ic('list-ol')}En este documento</h3>
			<ol>${props.slice(0, 16).map((p, i) => `<li><b>${i + 1}</b><span>${esc(p.titulo)}</span><em>${esc(precioPdf(p, opts.mostrarPrecio))}</em></li>`).join('')}</ol>
			${total > 16 ? `<p class="indice-mas">… y ${total - 16} propiedades más en las páginas siguientes.</p>` : ''}
		</div>
		${tarjetaContacto}
	</section>
	${cuerpo}
	${opts.formato === 'compacto' ? `<section class="cierre">
		<h2>¿Te interesa alguna?</h2>
		<p>Escríbenos para resolver tus dudas o agendar una visita.</p>
		${tarjetaContacto}
	</section>` : ''}
</main>
<script>
	// Abre la ventana de impresión cuando las fotos y los íconos cargaron (o a los 12 s, si algo tarda).
	const listo = Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))
		.then(() => Promise.all([document.fonts.load('1em icomoon'), document.fonts.ready]).catch(() => {}));
	Promise.race([listo, new Promise((r) => setTimeout(r, 12000))]).then(() => setTimeout(() => print(), 300));
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

	// Recuerda en este navegador el formato, el contacto y las casillas que se usaron la última vez.
	const PREF = 'eq-listado-pdf';
	try {
		const g = JSON.parse(localStorage.getItem(PREF) || '{}');
		if ([...formato.options].some((o) => o.value === g.formato)) formato.value = g.formato;
		if (g.asesor !== undefined && [...asesor.options].some((o) => o.value === g.asesor)) asesor.value = g.asesor;
		if (typeof g.mostrarPrecio === 'boolean') mostrarPrecio.checked = g.mostrarPrecio;
		if (typeof g.enlaces === 'boolean') enlaces.checked = g.enlaces;
	} catch { /* sin preferencias guardadas */ }
	const guardarPref = () => {
		try { localStorage.setItem(PREF, JSON.stringify({ formato: formato.value, asesor: asesor.value, mostrarPrecio: mostrarPrecio.checked, enlaces: enlaces.checked })); } catch { /* navegador sin almacenamiento */ }
	};

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
			&& (!fDisponibles.checked || estadoDe(p).valor === 'disponible')
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
			const chips = datosDe(p);
			return h('tr', {},
				h('td', { class: 'celda-sel' }, h('label', { class: 'sel-toque' }, check)),
				h('td', { class: 'celda-foto' }, p.fotos?.[0]?.url ? h('img', { class: 'thumb', src: p.fotos[0].url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb thumb-vacia', title: 'Sin fotos' }, h('span', { class: 'icon-camera', 'aria-hidden': 'true' }))),
				h('td', { class: 'celda-titulo' },
					h('div', { class: 'fw-semibold prop-titulo' }, p.titulo || '(sin título)'),
					h('div', { class: 'small text-muted prop-zona' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${ubicacion(p)}`),
					chips.length ? h('div', { class: 'prop-datos' }, chips) : null),
				h('td', { class: 'text-nowrap celda-precio' }, h('div', {}, formatPrice(p.precio, p.moneda, p.operacion))));
		}));
		if (!visibles.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'text-center text-muted py-4' }, 'Ninguna propiedad cumple con estos filtros.')));
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
		guardarPref();
		const win = window.open('', '_blank');
		if (!win) { toast('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.', 'danger'); return; }
		win.document.open();
		win.document.write(documento(lista, {
			cliente: cliente.value.trim(), titulo: titulo.value.trim(), nota: nota.value.trim(),
			formato: formato.value, mostrarPrecio: mostrarPrecio.checked, enlaces: enlaces.checked
		}, empresa, contacto, site.tema || {}));
		win.document.close();
	};

	const check = (input, label) => h('div', { class: 'form-check' }, input, h('label', { class: 'form-check-label', for: input.id }, label));
	const field = (label, input, cols) => h('div', { class: cols }, h('label', { class: 'form-label small', for: input.id }, label), input);

	draw(true);
	mount(container,
		pageHeader('Listado en PDF', h('button', { class: 'btn btn-primary', onclick: generar }, h('span', { class: 'icon-file-pdf-o', 'aria-hidden': 'true' }), 'Generar PDF')),
		h('p', { class: 'text-muted' }, 'Filtra según lo que busca tu cliente, marca las propiedades y genera un PDF con tu marca y tus datos de contacto, listo para enviar por WhatsApp o correo.'),
		h('div', { class: 'card p-3 mb-3' },
			h('h2', { class: 'h6 mb-3' }, h('span', { class: 'icon-search me-2 text-primary', 'aria-hidden': 'true' }), '1. ¿Qué busca el cliente?'),
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
			h('div', { class: 'd-flex justify-content-between align-items-center p-3 pb-0' }, h('h2', { class: 'h6 mb-0' }, h('span', { class: 'icon-check-square-o me-2 text-primary', 'aria-hidden': 'true' }), '2. Elige las propiedades'), count),
			cajaTabla(
				h('table', { class: 'table table-admin tabla-propiedades mb-0 align-middle' },
					h('thead', {}, h('tr', {}, h('th', { class: 'celda-sel' }, h('label', { class: 'sel-toque' }, todas)), [['', 'celda-foto'], ['Propiedad', 'celda-titulo'], ['Precio', 'celda-precio']].map(([t, c]) => h('th', { class: c }, t)))),
					tbody))),
		h('div', { class: 'card p-3 mb-3' },
			h('h2', { class: 'h6 mb-3' }, h('span', { class: 'icon-file-text-o me-2 text-primary', 'aria-hidden': 'true' }), '3. Datos del PDF'),
			h('div', { class: 'row g-3' },
				field('Para (cliente)', cliente, 'col-md-4'),
				field('Título de la portada', titulo, 'col-md-4'),
				field('Contacto que aparece', asesor, 'col-md-4'),
				field('Nota en la portada', nota, 'col-md-8'),
				field('Formato', formato, 'col-md-4'),
				h('div', { class: 'col-12 d-flex flex-wrap gap-4' },
					check(mostrarPrecio, 'Mostrar precios'), check(enlaces, 'Incluir enlace a cada ficha del sitio'))),
			h('div', { class: 'mt-3' }, h('button', { class: 'btn btn-primary', onclick: generar }, h('span', { class: 'icon-file-pdf-o', 'aria-hidden': 'true' }), 'Generar PDF'))));
}
