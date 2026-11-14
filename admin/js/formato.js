// Formatos compartidos por el panel y el generador del sitio. Sin DOM ni Firebase: también corre en Node.
// Antes de escribir otro formato de precio, número o WhatsApp, usar los de aquí.

export const M2_A_FT2 = 10.7639;
// Vara cuadrada de Guatemala: 1 v² = 0.698737 m².
export const M2_A_V2 = 1.43115;

// Tipo de cambio de referencia (quetzales por dólar). Uno solo para ordenar y filtrar precios en Q y en US$
// en el sitio (el generador pone `data-precio` en US$), y para las búsquedas sin IA del panel (reglas.js).
// La cotización tiene el suyo, editable, en settings/cotizacion (admin/js/cotizacion.js `TC_DEF` es el inicial).
export const TIPO_CAMBIO = 7.7;
// Un monto en US$ (para comparar precios en monedas distintas). Sin moneda se toma US$.
export const enUSD = (n, moneda) => (moneda === 'GTQ' ? (Number(n) || 0) / TIPO_CAMBIO : Number(n) || 0);

const PREFIJO_MONEDA = { USD: 'US$', GTQ: 'Q' };
export const prefijoMoneda = (moneda) => PREFIJO_MONEDA[moneda] || moneda;

// Número con coma en miles y punto en decimales (2,226.47), como se usa en Guatemala.
export const miles = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Dinero: siempre con 2 decimales (1,250.00), con o sin el prefijo de la moneda.
export const decimales = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (n, moneda) => `${prefijoMoneda(moneda)} ${decimales(n)}`;
// Precio de una propiedad a la vista (no una cuenta): sin centavos cuando es entero y de 1,000 o más
// («US$ 350,000», «Q 5,000»); con centavos si los tiene o es menor («US$ 120.00», «US$ 1,250.50»).
// Lo que se cobra o se suma (reservas, cotizaciones, impuestos, comisiones) sigue con `dinero`.
export const montoPrecio = (n, moneda) => {
	const x = Number(n) || 0;
	return Number.isInteger(x) && Math.abs(x) >= 1000 ? `${prefijoMoneda(moneda)} ${x.toLocaleString('en-US')}` : dinero(x, moneda);
};
// Precio de una propiedad según su operación, en español o inglés: «US$ 250,000», «Q 5,000 /mes»,
// «Desde US$ 120.00 por noche»; sin precio, «Precio a consultar». Lo usan el panel (ui.js `formatPrice`), la difusión,
// las reglas sin IA y el generador del sitio (scripts/lib/util.mjs `formatPrice`).
const PRECIO = {
	es: { consultar: 'Precio a consultar', mes: ' /mes', noche: (x) => `Desde ${x} por noche` },
	en: { consultar: 'Price on request', mes: ' /mo', noche: (x) => `From ${x} per night` }
};
export function precioTexto(precio, moneda = 'USD', operacion = 'venta', lang = 'es') {
	const t = PRECIO[lang] || PRECIO.es;
	if (!Number(precio)) return t.consultar;
	if (operacion === 'vacacional') return t.noche(montoPrecio(precio, moneda));
	return `${montoPrecio(precio, moneda)}${operacion === 'renta' ? t.mes : ''}`;
}
// «1 noche», «3 noches».
export const nNoches = (n) => `${n} ${n === 1 ? 'noche' : 'noches'}`;

// ¿Es un correo que puede recibir mensajes? Algo@dominio.ext, sin espacios y con una extensión de 2 letras o más
// («ana@» o «ana@correo» no pasan). La usan los formularios del sitio (js/site.js, por el paquete de assets.mjs)
// y las funciones.
export const correoValido = (correo) => {
	const c = String(correo || '').trim();
	return c.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.\d]{2,}$/.test(c);
};

// Horario de atención en inglés a partir del escrito en español (un solo dato: Contenido → Contacto → Horario).
// Frases, días, conectores y horas de 24 h a 12 h: «Lunes a sábado, 8:00 a 17:00» → «Monday to Saturday, 8:00 a.m. to 5:00 p.m.».
// Lo que no reconoce lo deja como está (scripts/test-sitio.mjs tiene los casos).
const FRASES_EN = [[/todos los d[ií]as/gi, 'every day'], [/(con )?cita previa/gi, 'by appointment'], [/24 horas/gi, '24 hours'], [/hora de guatemala/gi, 'Guatemala time']];
const PALABRAS_EN = { lunes: 'Monday', martes: 'Tuesday', miercoles: 'Wednesday', jueves: 'Thursday', viernes: 'Friday', sabado: 'Saturday', sabados: 'Saturdays',
	domingo: 'Sunday', domingos: 'Sundays', feriado: 'holiday', feriados: 'holidays', festivos: 'holidays', cerrado: 'closed', abierto: 'open',
	a: 'to', al: 'to', hasta: 'to', y: 'and', e: 'and', o: 'or', de: 'from', desde: 'from', con: 'by', cita: 'appointment', los: '', las: '', solo: 'only' };
export function horarioEn(horario) {
	const horas = [];
	const guardar = (h, m = '00', ap = '') => {
		const n = Number(h);
		const doce = ap ? `${n % 12 || 12}:${m} ${ap.toLowerCase()}.m.` : n > 24 || Number(m) > 59 ? `${h}:${m}` : `${n % 12 || 12}:${m} ${n >= 12 && n < 24 ? 'p.m.' : 'a.m.'}`;
		horas.push(doce);
		return `\u0000${horas.length - 1}\u0000`;
	};
	let en = String(horario || '').trim();
	for (const [re, x] of FRASES_EN) en = en.replace(re, x);
	en = en
		.replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/gi, (_, h, m, ap) => guardar(h, m, ap)) // «8 a. m.», «5:30 pm»
		.replace(/\b(\d{1,2}):(\d{2})(?:\s*(?:h|hrs|horas)\b)?/g, (_, h, m) => guardar(h, m)) // «17:00», «17:00 h»
		.replace(/\b(\d{1,2})\s*(?:h|hrs|horas)\b/g, (_, h) => guardar(h)) // «17 h»
		.replace(/[A-Za-zÁÉÍÓÚáéíóúÑñ]+/g, (w) => {
			const k = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
			return Object.hasOwn(PALABRAS_EN, k) ? PALABRAS_EN[k] : w;
		})
		.replace(/\u0000(\d+)\u0000/g, (_, i) => horas[i])
		.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
	return en.charAt(0).toUpperCase() + en.slice(1);
}

// Texto en inglés con los m² también en pies cuadrados: «149 m² apartment» → «149 m² (1,604 sq ft) apartment».
// Lo que ya trae sus sq ft al lado («1,604 sq ft (149 m²)», «2,226 m² (23,966 sq ft)») no se toca.
export function conPiesCuadrados(texto) {
	return String(texto || '').replace(/(?<![(\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?m(?:²|2\b)(?!\s*\(?[\d,.]+\s*sq\s*ft)/g, (todo, entero, dec = '') => {
		const m2 = Number(entero.replace(/,/g, '') + dec);
		return m2 ? `${todo} (${Math.round(m2 * M2_A_FT2).toLocaleString('en-US')} sq ft)` : todo;
	});
}

// Teléfonos: un solo formato en todo el sistema, «+código número» (p. ej. «+502 5555 1234»).
// Códigos de país que ofrece cada campo de teléfono, primero los que más escriben; cualquier otro
// se escribe completo, empezando con «+».
export const CODIGOS_PAIS = [['502', 'GT'], ['1', 'US/CA'], ['52', 'MX'], ['503', 'SV'], ['504', 'HN'], ['505', 'NI'], ['506', 'CR'], ['507', 'PA'], ['501', 'BZ'],
	['57', 'CO'], ['34', 'ES'], ['44', 'GB'], ['49', 'DE'], ['33', 'FR'], ['39', 'IT'], ['31', 'NL'], ['54', 'AR'], ['56', 'CL'], ['55', 'BR'], ['972', 'IL'], ['61', 'AU']];
// Código y número de un teléfono guardado, para mostrarlo en un campo con su código de país.
//  «+502 5555 1234» → { codigo: '502', numero: '5555 1234' }
//  «5555 1234» (sin código, como se guardaba antes) → el código por defecto
//  «50255551234» o «13055551234» (11 dígitos con el código pegado) → se separa
//  «+995 555 123» (código que no está en la lista) → { codigo: '', numero: '+995 555 123' }: se conserva tal cual
export function partirTelefono(tel, porDefecto = '502') {
	const t = String(tel || '').trim();
	if (!t) return { codigo: porDefecto, numero: '' };
	const digitos = t.replace(/\D/g, '');
	const conocido = (d) => CODIGOS_PAIS.map(([c]) => c).sort((a, b) => b.length - a.length).find((c) => d.startsWith(c)) || '';
	if (t.startsWith('+')) {
		const codigo = conocido(digitos);
		return codigo ? { codigo, numero: t.slice(1).trim().slice(codigo.length).trim() } : { codigo: '', numero: t };
	}
	if (digitos.length === 11 && (digitos.startsWith('502') || digitos.startsWith('1')) && !/\D/.test(t)) {
		const codigo = digitos.startsWith('502') ? '502' : '1';
		return { codigo, numero: digitos.slice(codigo.length) };
	}
	return { codigo: porDefecto, numero: t };
}
// Código + número → como se guarda. Si el número ya viene con «+», manda el número.
export function unirTelefono(codigo, numero) {
	const n = String(numero || '').trim();
	if (!n) return '';
	return n.startsWith('+') || !codigo ? n : `+${codigo} ${n}`;
}
// ¿Es un teléfono que se puede marcar? Entre 7 y 15 dígitos, contando el código de país.
export const telefonoValido = (tel) => { const d = String(tel || '').replace(/\D/g, '').length; return d >= 7 && d <= 15; };

// Teléfono comparable y listo para wa.me: solo dígitos; los de 8 dígitos se asumen de Guatemala.
export function telefonoWa(tel) {
	let n = String(tel || '').replace(/\D/g, '');
	if (n.length === 8) n = `502${n}`;
	return n;
}

export function whatsappUrl(tel, mensaje) {
	const n = telefonoWa(tel);
	const text = mensaje ? `text=${encodeURIComponent(mensaje)}` : '';
	return n ? `https://wa.me/${n}${text ? `?${text}` : ''}` : `https://wa.me/?${text}`;
}
