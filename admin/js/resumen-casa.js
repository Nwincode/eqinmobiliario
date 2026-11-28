// Panel del dueño (propietario o colaborador): cómo va UNA casa en venta o renta, solo lectura. Sale del resumen
// que arma el equipo (admin/js/portal.js → portalPropietarios): sin nombres, teléfonos ni correos de clientes, sin
// el acuerdo (solo la fecha de la exclusiva de esta casa) y sin notas internas. Lo único que escribe el dueño es su
// respuesta al anuncio (comentariosPropietarios: «Sí, de acuerdo» aquí; sus pedidos, con admin/js/pedido-dueno.js), que
// el asesor ve en la ficha de la persona y en «Cambios de los dueños».
import { db, addDoc, collection, serverTimestamp } from './firebase.js';
import { h, showError, badge, statCard, iconoBtn, tablaAdmin, tarjeta, formatPrice } from './ui.js';
import { ESTADOS_PROPIEDAD, OPERACIONES } from './estados.js';
import { whatsappUrl, fechaCorta, fechaLarga } from './formato.js';
import { estadoExclusiva, datosDe } from './ficha-casa.js';
import { CANALES } from './portal-clientes.js';
import { enlaceSeguro } from './duenos.js';

const DIA = 86400000;
const ic = (clase) => h('span', { class: `${clase} me-1`, 'aria-hidden': 'true' });
const fecha = (v, corta = false) => (corta ? fechaCorta(v, '') : fechaLarga(v));

const COLOR_VISIBILIDAD = { visible: 'success', cerrada: 'info', oculta: 'secondary' };
const CANAL = { web: ['Página web', 'icon-globe'], whatsapp: ['WhatsApp', 'icon-whatsapp'], portal: ['Portal de anuncios', 'icon-newspaper-o'], anuncio: ['Anuncio pagado', 'icon-bullhorn'],
	redes: ['Redes sociales', 'icon-share-alt'], referido: ['Recomendación', 'icon-user-plus'], llamada: ['Llamada o rótulo', 'icon-phone'], otro: ['Otro medio', 'icon-ellipsis-h'] };
const ETAPA = { interesado: ['Interesado', 'icon-eye', 'light'], visito: ['Visitó', 'icon-calendar-check-o', 'info'], negociando: ['Negociando', 'icon-comments', 'warning'],
	oferto: ['Ofertó', 'icon-handshake-o', 'primary'], cerro: ['Cerró', 'icon-key', 'success'], perdido: ['Ya no está interesado', 'icon-times-circle', 'secondary'] };
const EVENTO = { foto: ['Fotos nuevas', 'icon-camera'], precio: ['Cambio de precio', 'icon-tag'], oferta: ['Oferta', 'icon-handshake-o'], visita: ['Visita', 'icon-calendar-check-o'],
	paso: ['Próximo paso', 'icon-flag'], nota: ['Nota', 'icon-commenting-o'], publicado: ['Publicación', 'icon-globe'], portal: ['Publicación', 'icon-bullhorn'] };

// Texto de un evento automático (llega sin texto: se arma aquí).
function textoAuto(e, p) {
	const n = Number(e.veces) || 1;
	return { web: 'Se publicó en eqinmobiliario.gt', portal: `Se publicó en ${e.portal || 'un portal'}`, precio: `Cambio de precio a ${formatPrice(e.precio, e.moneda, p.operacion)}`,
		visita: n > 1 ? `Se realizaron ${n} visitas` : 'Se realizó una visita', oferta: n > 1 ? `Se recibieron ${n} ofertas` : 'Se recibió una oferta' }[e.auto] || '';
}

// Respuesta al anuncio: «Sí, de acuerdo». Lo que quiere cambiar lo pide con «Pedir un cambio», en la fila del título
// (admin/js/pedido-dueno.js: la única puerta, con texto y fotos). Una por visita a la pantalla.
function respuesta(resumen, p) {
	const caja = h('div', {});
	const enviar = async (btn) => {
		btn.disabled = true;
		try {
			await addDoc(collection(db, 'comentariosPropietarios'), {
				token: resumen.id, propietarioId: resumen.propietarioId, agentId: resumen.agentId || '', propiedadId: p.id,
				tipo: 'aprobado', texto: '', fecha: serverTimestamp(), origen: 'propietario', idioma: 'es'
			});
			caja.replaceChildren(h('div', { class: 'alert alert-success small mb-0', role: 'status' }, ic('icon-check-circle'), 'Gracias: tu asesor ya sabe que estás de acuerdo con el anuncio.'));
		} catch (err) { showError(err); btn.disabled = false; }
	};
	caja.append(h('div', { class: 'd-flex flex-wrap align-items-center gap-2' },
		h('span', { class: 'small fw-semibold me-auto' }, '¿Estás de acuerdo con cómo se anuncia?'),
		h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => enviar(e.currentTarget) }, ic('icon-check-circle'), 'Sí, de acuerdo')));
	return caja;
}

// Estado de la casa (Disponible, Vendida…), con el color de su visibilidad en el sitio.
export function estadoCasa(p) {
	const est = ESTADOS_PROPIEDAD.find((e) => e.valor === p.estado) || ESTADOS_PROPIEDAD[0];
	return badge(est.label, COLOR_VISIBILIDAD[est.visibilidad] || 'secondary');
}
// Cabecera de una casa en el panel del dueño: foto y, al lado, insignias, precio, renglones con ícono y lo de abajo.
// La misma para la casa en venta o renta (su resumen) y para la casa por noche (Mis propiedades).
export function cabeceraCasa({ foto, titulo = '', insignias = [], precio, lineas = [], pie = [] }) {
	return h('div', { class: 'card mb-3' }, h('div', { class: 'card-body' }, h('div', { class: 'row g-3' },
		// Sin foto, sin un recuadro vacío del tamaño de una foto: los datos usan todo el ancho.
		foto ? h('div', { class: 'col-md-5' }, h('img', { class: 'mc-foto', src: foto, alt: titulo })) : null,
		h('div', { class: `${foto ? 'col-md-7' : 'col-12'} d-grid gap-2 align-content-start` },
			h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, insignias),
			precio ? h('div', { class: 'h4 mb-0' }, precio) : null,
			h('ul', { class: 'list-unstyled small mb-0 d-grid gap-1' }, lineas),
			pie))));
}

// p: la casa tal como viene en el resumen; resumen: el documento entero (asesor, próximo paso, ids).
export function resumenCasa(resumen, p, { responder = true } = {}) {
	const desde = p.enMercadoDesde ? new Date(p.enMercadoDesde) : null;
	const dias = desde ? Math.max(0, Math.floor(((p.enMercadoHasta ? new Date(p.enMercadoHasta) : new Date()) - desde) / DIA)) : null;
	const k = p.kpis || {};
	const a = p.anuncio || {};
	const ag = resumen.asesor || {};
	const kpi = (clave, label, icono) => h('div', { class: 'col-4' }, statCard(icono, label, Number(k[clave]?.total) || 0, { cls: 'stat-envuelve', nota: k[clave]?.d30 ? `+${k[clave].d30} en 30 días` : 'Nada nuevo en 30 días' }));
	const foto = enlaceSeguro(p.foto);
	// Las demás fotos del anuncio (la primera ya está arriba).
	const fotos = (a.fotos || []).map(enlaceSeguro).filter((u) => u && u !== foto);
	const eventos = (p.eventos || []).filter((e) => e && (e.texto || e.auto));
	const precios = (p.historialPrecio || []).filter((x) => x?.precio).slice().sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)));
	const clientes = (p.clientes || []).filter((c) => c && Number(c.n)).sort((x, y) => y.n - x.n);
	const prox = Number(k.visitasProximas) || 0;
	const operacion = OPERACIONES.find(([v]) => v === p.operacion)?.[1] || '';

	return h('div', {},
		// Lo principal: foto y, al lado, estado, precio, días en el mercado, exclusiva, asesor e interés.
		cabeceraCasa({ foto, titulo: p.titulo, precio: formatPrice(p.precio, p.moneda, p.operacion),
			insignias: [estadoCasa(p), p.exclusivaHasta ? estadoExclusiva({ exclusiva: true, exclusivaFin: p.exclusivaHasta }) : badge('Sin exclusiva', 'light')],
			lineas: [
				h('li', {}, ic('icon-clock-o'), dias === null ? 'Aún no sale al mercado' : dias === 0 ? 'Salió al mercado hoy' : `${dias} ${dias === 1 ? 'día' : 'días'} en el mercado`),
				p.exclusivaHasta ? h('li', {}, ic('icon-calendar'), `Exclusiva hasta el ${fecha(p.exclusivaHasta)}`) : null,
				prox ? h('li', {}, ic('icon-calendar-check-o'), `${prox} ${prox === 1 ? 'visita agendada' : 'visitas agendadas'}`) : null,
				resumen.proximoPaso ? h('li', {}, ic('icon-flag'), h('strong', {}, 'Próximo paso: '), resumen.proximoPaso) : null,
				enlaceSeguro(p.url) ? h('li', {}, h('a', { href: p.url, target: '_blank', rel: 'noopener' }, ic('icon-external-link'), 'Ver el anuncio en la página')) : null],
			pie: [
				ag.nombre || ag.whatsapp || ag.telefono ? h('div', { class: 'd-flex align-items-center gap-2 border-top pt-2' },
					h('span', { class: 'small flex-grow-1' }, h('span', { class: 'text-muted' }, resumen.agentId ? 'Tu asesor: ' : 'Escríbele a: '), h('strong', {}, ag.nombre || 'Equipo Inmobiliario')),
					ag.whatsapp ? iconoBtn('icon-whatsapp', `WhatsApp a ${ag.nombre || 'tu asesor'}`, { href: whatsappUrl(ag.whatsapp, `Hola${ag.nombre ? ` ${ag.nombre.split(' ')[0]}` : ''}, vi en mi panel «${p.titulo}» y tengo una consulta.`), target: '_blank', rel: 'noopener' }) : null,
					ag.telefono ? iconoBtn('icon-phone', `Llamar a ${ag.nombre || 'tu asesor'}`, { href: `tel:${ag.telefono}` }) : null) : null,
				// Interés: consultas, visitas y ofertas (total y últimos 30 días), junto a la foto.
				h('div', { class: 'row g-2' }, kpi('consultas', 'Consultas', 'icon-commenting-o'), kpi('visitas', 'Visitas', 'icon-calendar-check-o'), kpi('ofertas', 'Ofertas', 'icon-handshake-o'))] }),
		tarjeta('icon-bullhorn', 'Cómo se anuncia',
			h('p', { class: 'small text-muted' }, 'Así ven tu propiedad los interesados en nuestra página.'),
			h('div', { class: 'fw-semibold' }, p.titulo),
			h('div', { class: 'small text-muted mb-1' }, h('span', { class: 'icon-map-marker', 'aria-hidden': 'true' }), ` ${[operacion, a.zona, a.ciudad].filter(Boolean).join(' · ')}`),
			h('div', { class: 'prop-datos mb-2' }, datosDe({ ...a, operacion: p.operacion })),
			fotos.length ? h('div', { class: 'images-grid mb-2' }, fotos.map((u, i) => h('div', { class: 'images-grid-item' }, h('img', { src: u, alt: `Foto ${i + 1} del anuncio`, loading: 'lazy' })))) : null,
			a.descripcion ? h('details', { class: 'mb-3' }, h('summary', { class: 'small' }, ic('icon-file-text-o'), 'Descripción del anuncio'),
				h('div', { class: 'small mt-2', style: 'white-space: pre-line' }, String(a.descripcion).replace(/\*\*/g, '').replace(/^#+\s*/gm, ''))) : null,
			resumen.id && responder ? respuesta(resumen, p) : null),
		h('div', { class: 'row gx-3' },
			h('div', { class: 'col-lg-5' },
				precios.length > 1 ? tarjeta('icon-line-chart', 'Historial de precio', h('ul', { class: 'list-group list-group-flush' }, precios.map((x, i) => h('li', { class: 'list-group-item d-flex justify-content-between px-0' },
					h('span', { class: i ? 'text-muted' : 'fw-semibold' }, formatPrice(x.precio, x.moneda, p.operacion)), h('span', { class: 'small text-muted' }, fecha(x.fecha, true)))))) : null,
				tarjeta('icon-globe', 'Dónde se anuncia', (p.portales || []).length ? h('ul', { class: 'list-unstyled mb-0 d-grid gap-1' }, p.portales.map((po) => h('li', {},
					enlaceSeguro(po.url) ? h('a', { href: po.url, target: '_blank', rel: 'noopener' }, ic('icon-external-link'), po.nombre) : h('span', {}, ic('icon-globe'), po.nombre))))
					: h('p', { class: 'small text-muted mb-0' }, 'Tu asesor está preparando la publicación.'))),
			h('div', { class: 'col-lg-7' },
				tarjeta('icon-history', 'Lo que ha pasado', eventos.length ? h('ul', { class: 'list-group list-group-flush' }, eventos.map((e) => {
					const [tipo, icono] = EVENTO[e.tipo] || EVENTO.nota;
					return h('li', { class: 'list-group-item d-flex gap-2 px-0' }, h('span', { class: `${icono} text-muted mt-1`, 'aria-hidden': 'true' }),
						h('div', {}, h('div', { class: 'small text-muted' }, `${tipo}${e.fecha ? ` · ${fecha(e.fecha)}` : ''}`), h('div', {}, e.auto ? textoAuto(e, p) : e.texto)));
				})) : h('p', { class: 'small text-muted mb-0' }, 'Todavía no hay novedades. Tu asesor las irá agregando aquí.')))),
		tarjeta('icon-users', 'Clientes interesados',
			h('p', { class: 'small text-muted' }, ic('icon-lock'), 'Sin nombres ni teléfonos: cada persona tiene un número, en el orden en que nos contactó.'),
			(() => {
				const t = tablaAdmin({
					tarjeta: false,
					columnas: ['Cliente', 'Cómo llegó', 'Primer contacto', 'Visitas', 'Etapa'].map((titulo) => ({ titulo })),
					celdas: (c) => {
						const [canal, iconoCanal] = CANAL[CANALES.includes(c.canal) ? c.canal : 'otro'];
						const [etapa, iconoEtapa, color] = ETAPA[c.etapa] || ETAPA.interesado;
						const nv = Number(c.visitas) || 0;
						return [
							h('span', { class: 'fw-semibold' }, `Cliente ${c.n}`),
							[h('span', { class: iconoCanal, title: canal, 'aria-hidden': 'true' }), ` ${canal}`],
							h('span', { class: 'small' }, c.desde ? fecha(c.desde, true) : '—'),
							h('span', { class: 'small' }, [nv === 0 ? 'Sin visitas' : nv === 1 ? '1 visita' : `${nv} visitas`, c.visitaProxima ? 'visita agendada' : ''].filter(Boolean).join(' · ')),
							badge([h('span', { class: `${iconoEtapa} me-1`, 'aria-hidden': 'true' }), etapa], color)];
					},
					vacio: h('p', { class: 'small text-muted mb-0' }, 'Todavía no hay clientes interesados. Los verás aquí en cuanto alguien nos contacte por tu propiedad.')
				});
				t.pintar(clientes);
				return t;
			})()));
}
