// Lo que sale del panel a un servicio de fuera (la IA de Netlify y el traductor gratuito de admin/js/reglas.js):
// de cada propiedad, solo lo que se publica; de los clientes, su primer nombre y lo que buscan, sin teléfono ni
// correo. Lo aplica pedirIA (admin/js/ia.js) a todo lo que manda, así ninguna pantalla se lo salta.
// Sin dependencias: lo prueba scripts/test-para-ia.mjs.

// Lista de lo permitido (lo que no está aquí no sale: socio, acuerdo, privado, historial, difusión, dueño, asesor, uid…).
// «id» es el de la propiedad: con él vuelven los resultados de la búsqueda.
const CAMPOS = ['id', 'slug', 'vip', 'codigo', 'titulo', 'descripcion', 'operacion', 'tipo', 'estado', 'precio', 'moneda',
	'zona', 'ciudad', 'direccion', 'habitaciones', 'banos', 'parqueos', 'm2Construccion', 'm2Terreno', 'niveles',
	'anioConstruccion', 'mantenimiento', 'amenidades', 'destacada'];
const VACACIONAL = ['base', 'finde', 'nochesMin', 'huespedesMax', 'checkIn', 'checkOut', 'camas', 'mascotas', 'comoLlegar', 'reglas', 'cancelacion'];
const VIP = ['titular', 'subtitular', 'puntosClave', 'ctaTexto', 'ocultarPrecio'];
const SEO = ['titulo', 'descripcion'];

const tomar = (o, campos) => Object.fromEntries(campos.filter((k) => o?.[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));

export function propiedadParaIA(p) {
	if (!p || typeof p !== 'object') return p;
	const d = tomar(p, CAMPOS);
	if (p.operacion === 'vacacional') {
		// La dirección de una casa por noche es privada (la recibe el cliente con el pago); no lleva mantenimiento.
		delete d.direccion; delete d.mantenimiento;
		d.vacacional = tomar(p.vacacional, VACACIONAL);
	}
	if (p.vip && p.operacion !== 'vacacional') {
		d.vipLanding = tomar(p.vipLanding, VIP);
		if (d.vipLanding.ocultarPrecio) delete d.precio;
	}
	if (p.seo) d.seo = tomar(p.seo, SEO);
	return d;
}

// Teléfonos y correos escritos dentro de un texto (mensaje del cliente, notas): se cambian por una marca.
// Fechas (2026-05-01, 1/5/2026), horas y montos con comas no cuentan.
export function sinContacto(texto) {
	return String(texto ?? '')
		.replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[correo]')
		.replace(/\+?\d[\d\s().-]{5,}\d/g, (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) || x.replace(/\D/g, '').length < 7 ? x : '[teléfono]'));
}
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';

// Un lead: la IA necesita su contexto (qué pidió, cuándo, en qué va), no su contacto.
export function leadParaIA(l) {
	if (!l) return l;
	return {
		nombre: primerNombre(l.nombre), mensaje: sinContacto(l.mensaje), origen: l.origen || '', estado: l.estado || '',
		propiedad: l.propiedad || l.propertyTitulo || '', diasDesdeQueEscribio: l.diasDesdeQueEscribio ?? null,
		notas: (l.notas || []).map((n) => sinContacto(typeof n === 'string' ? n : n?.texto))
	};
}

// Un requerimiento guardado (cliente que busca): lo que busca y su primer nombre.
export const requerimientoParaIA = (r) => ({ id: r.id, cliente: primerNombre(r.cliente), texto: sinContacto(r.texto), criterios: r.criterios || {}, estado: r.estado || '' });

// Todo lo que se manda en una tarea de pedirIA.
export function paraIA(datos = {}) {
	const d = { ...datos };
	if (d.propiedad) d.propiedad = propiedadParaIA(d.propiedad);
	if (Array.isArray(d.inventario)) d.inventario = d.inventario.map(propiedadParaIA);
	if (d.lead) d.lead = leadParaIA(d.lead);
	if (Array.isArray(d.requerimientos)) d.requerimientos = d.requerimientos.map(requerimientoParaIA);
	return d;
}
