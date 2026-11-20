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

// CSV para abrir en Excel o Google Sheets. Un texto que empieza con = + - @, tabulador o retorno de carro se abriría
// como fórmula (un nombre del formulario del sitio puede sacar datos de otras celdas): va con un apóstrofo delante, que
// la hoja muestra como texto. Los números van tal cual. El importador lo quita al leer (sinMarcaCsv).
const FORMULA_CSV = /^[=+\-@\t\r]/;
export const celdaCsv = (c) => {
	const t = typeof c === 'number' ? String(c) : FORMULA_CSV.test(String(c ?? '')) ? `'${c}` : String(c ?? '');
	return `"${t.replace(/"/g, '""')}"`;
};
export const textoCsv = (filas) => filas.map((f) => f.map(celdaCsv).join(',')).join('\r\n');
export const sinMarcaCsv = (t) => (/^'[=+\-@\t\r]/.test(t) ? t.slice(1) : t);

// Número con coma en miles y punto en decimales (2,226.47), como se usa en Guatemala.
export const miles = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Dinero: siempre con 2 decimales (1,250.00), con o sin el prefijo de la moneda.
export const decimales = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (n, moneda) => `${prefijoMoneda(moneda)} ${decimales(n)}`;
// Precio de una propiedad a la vista (no una cuenta): sin centavos cuando es entero y de 1,000 o más
// («US$ 350,000», «Q 5,000»); con centavos si los tiene o es menor («US$ 120.00», «US$ 1,250.50»).
// Lo que se cobra o se suma (reservas, cotizaciones, impuestos, comisiones) sigue con `dinero`.
// Decisión del dueño: los precios llevan siempre centavos («US$ 350,000.00», «US$ 120.00»), igual que las cuentas.
export const montoPrecio = (n, moneda) => dinero(Number(n) || 0, moneda);
// Precio de una propiedad según su operación, en español o inglés: «US$ 250,000.00», «Q 5,000.00 /mes»,
// «US$ 120.00 por noche» (sin «desde»: el precio no se negocia; el de fin de semana va aparte en la ficha); sin precio, «Precio a consultar». Lo usan el panel (ui.js `formatPrice`), la difusión,
// las reglas sin IA y el generador del sitio (scripts/lib/util.mjs `formatPrice`).
const PRECIO = {
	es: { consultar: 'Precio a consultar', mes: ' /mes', noche: (x) => `${x} por noche` },
	en: { consultar: 'Price on request', mes: ' /mo', noche: (x) => `${x} per night` }
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
// («ana@», «ana@correo», «.ana@gmail.com», «ana..x@gmail.com» o «ana@-gmail.com» no pasan). La usan los formularios del sitio (js/site.js, por el paquete de assets.mjs)
// y las funciones.
export const correoValido = (correo) => {
	const c = String(correo || '').trim();
	// Antes de la @, sin punto al inicio, al final ni dos seguidos; cada parte del dominio sin guion al inicio ni al final.
	return c.length <= 254 && /^[^\s@.]+(\.[^\s@.]+)*@([^\s@.-]([^\s@.]*[^\s@.-])?\.)+[^\s@.\d-]{2,}$/.test(c);
};
// Correo con el dominio mal escrito («gmial.com», «hotmail.con»): devuelve el correo corregido para sugerirlo, o ''.
// Solo los proveedores más usados y a 1 o 2 letras de distancia (una letra de más, de menos, cambiada o dos al revés).
const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com', 'hotmail.es', 'outlook.es', 'yahoo.es', 'yahoo.com.mx', 'live.com.mx', 'me.com', 'aol.com', 'protonmail.com', 'proton.me'];
function distancia(a, b) {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
		d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
	}
	return d[a.length][b.length];
}
export function sugerenciaCorreo(correo) {
	const c = String(correo || '').trim(), k = c.lastIndexOf('@');
	if (k < 1) return '';
	const dominio = c.slice(k + 1).toLowerCase();
	if (!dominio || DOMINIOS.includes(dominio)) return '';
	let mejor = '', min = 3;
	for (const x of DOMINIOS) { const n = distancia(dominio, x); if (n < min) { min = n; mejor = x; } }
	// Dos letras de distancia, solo en dominios largos: en uno corto casi cualquier dominio queda a dos letras de otro.
	return mejor && (min === 1 || dominio.length >= 7) ? `${c.slice(0, k)}@${mejor}` : '';
}

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

// El mismo horario como schema.org/OpeningHoursSpecification (JSON-LD de la portada): «Lunes a sábado, 8:00 a 17:00»
// → [{ dayOfWeek: [Monday…Saturday], opens: '08:00', closes: '17:00' }]. Tramos separados por «;», varias horas con
// «y», «domingos cerrado» se salta. Si queda una palabra que no entiende, null: mejor nada que un horario inventado.
const DIAS_LD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DIA_N = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, sabados: 5, domingo: 6, domingos: 6 };
export function horarioSchema(horario) {
	const sinTilde = String(horario || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
	if (!sinTilde) return null;
	const DIA = '(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)';
	const out = [];
	// Otro tramo también empieza con «,» o «y» después de una hora cuando sigue un día («…17:00 y sábados 8:00 a 12:00»),
	// y cada tramo puede empezar con «de» o «desde» («De lunes a viernes, 9:00 a 18:00»).
	const tramos = sinTilde.replace(new RegExp(`(\\d(?:\\s*[ap]\\.?\\s*m\\b\\.?|\\s*h(?:rs|oras)?\\b)?)\\s*(?:,|\\by\\b)\\s+(?=(?:de |desde )?(?:todos los dias|${DIA})\\b)`, 'g'), '$1;');
	for (const tramo of tramos.split(';').map((x) => x.trim().replace(/\.$/, '').replace(/^(de|desde)\s+/, '')).filter(Boolean)) {
		if (new RegExp(`^${DIA}( (a|al|y) ${DIA})?,? cerrados?$`).test(tramo)) continue;
		const d = new RegExp(`^(?:todos los dias|${DIA}(?:\\s+(?:a|al)\\s+${DIA})?)[\\s,:]+(.*)$`).exec(tramo);
		if (!d) return null;
		const [desde, hasta] = d[1] ? [DIA_N[d[1]], DIA_N[d[2] || d[1]]] : [0, 6];
		if (hasta < desde) return null;
		const horas = [];
		const resto = d[3].replace(/(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\b\.?|h(?:rs|oras)?\b)?/g, (_, h, m = '00', ap) => {
			let n = Number(h);
			if (ap === 'p' && n < 12) n += 12;
			if (ap === 'a' && n === 12) n = 0;
			horas.push(n <= 24 && Number(m) < 60 ? `${String(n).padStart(2, '0')}:${m}` : null);
			return ' ';
		});
		if (resto.replace(/\b(de|desde|a|al|hasta|y)\b/g, '').replace(/[\s,.–-]/g, '') || !horas.length || horas.length % 2 || horas.includes(null)) return null;
		for (let i = 0; i < horas.length; i += 2) {
			if (horas[i] >= horas[i + 1]) return null;
			out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DIAS_LD.slice(desde, hasta + 1), opens: horas[i], closes: horas[i + 1] });
		}
	}
	return out.length ? out : null;
}

// Texto en inglés con los m² también en pies cuadrados: «149 m² apartment» → «149 m² (1,604 sq ft) apartment».
// Lo que ya trae sus sq ft al lado («1,604 sq ft (149 m²)», «2,226 m² (23,966 sq ft)») no se toca.
export function conPiesCuadrados(texto) {
	// Sin «lookbehind» (Safari viejo no lo lee y este archivo lo usa todo el panel): el carácter de antes se captura.
	return String(texto || '').replace(/(^|[^(\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?m(?:²|2\b))(?!\s*\(?[\d,.]+\s*sq\s*ft)/g, (todo, antes, entero, dec = '', unidad) => {
		const m2 = Number(entero.replace(/,/g, '') + dec);
		return m2 ? `${antes}${entero}${dec}${unidad} (${Math.round(m2 * M2_A_FT2).toLocaleString('en-US')} sq ft)` : todo;
	});
}

// Teléfonos: un solo formato en todo el sistema, «+código número» (p. ej. «+502 5555 1234»).
// Códigos de país que ofrece cada campo de teléfono, primero los que más escriben. Cualquier otro se escribe completo,
// con «+». Cada uno con el plan de numeración de su país en libphonenumber (metadata «max», v1.11.12):
//  [código, país, largos de fijos y celulares, largo de un celular, otros números (gratuitos, de pago…) con su patrón]
// Un largo «raro» solo vale con el patrón de su país: «+502 1801 2345678» (1-800) sí, «+502 1 305 555 1234» no.
// scripts/test-telefono.mjs tiene un número válido de cada país. +1: los 10 dígitos del plan norteamericano (los
// «310-xxxx» de Canadá no se marcan desde fuera del país).
export const CODIGOS_PAIS = [
	['502', 'GT', [8], 8, '18[01]\\d{8}|19\\d{9}'], ['1', 'US/CA', [10], 10], ['52', 'MX', [10], 10],
	['503', 'SV', [8], 8, '[89]00\\d{4}(?:\\d{4})?'], ['504', 'HN', [8], 8, '8002\\d{7}'], ['505', 'NI', [8], 8],
	['506', 'CR', [8], 8, '800\\d{7}|90[059]\\d{7}'], ['507', 'PA', [7, 8], 8, '800\\d{4,5}|(?:00800|800\\d)\\d{6}'],
	['501', 'BZ', [7], 7, '0800\\d{7}'], ['57', 'CO', [10], 10, '1800\\d{7}|19(?:0[01]|4[78])\\d{7}'], ['34', 'ES', [9], 9],
	['44', 'GB', [9, 10], 10, '800\\d{4}'], ['49', 'DE', [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 11], ['33', 'FR', [9], 9],
	['39', 'IT', [6, 7, 8, 9, 10, 11, 12], 10], ['31', 'NL', [9], 9, '140\\d{2,3}|800\\d{4,7}|90[069]\\d{4,7}|970\\d{8}'],
	['54', 'AR', [10, 11], 11], ['56', 'CL', [9], 9, '(?:123|800)\\d{8}|600\\d{7,8}'],
	['55', 'BR', [10, 11], 11, '300\\d{5}|4(?:00\\d|020|370)\\d{4}|[3589]00\\d{6,7}'], ['972', 'IL', [8, 9], 9, '1\\d{6,11}'],
	['61', 'AU', [9], 9, '1\\d{3,9}']];
const PLAN = Object.fromEntries(CODIGOS_PAIS.map(([c, , largos, celular, especial]) => [c, { largos, celular, especial: especial ? new RegExp(`^(?:${especial})$`) : null }]));
const TRONCAL_0 = ['44', '49', '33', '31', '61', '972', '54', '55', '57', '56'];
const POR_LARGO = CODIGOS_PAIS.map(([c]) => c).sort((a, b) => b.length - a.length);
const codigoDe = (d) => POR_LARGO.find((c) => d.startsWith(c)) || '';
const nacionalBien = (codigo, n) => Boolean(PLAN[codigo]) && (PLAN[codigo].largos.includes(n.length) || Boolean(PLAN[codigo].especial?.test(n)));
// Lo que se escribe de más y no es parte del número: una extensión al final («ext. 12», «x12», «extensión 3»).
const sinExtension = (t) => String(t || '').trim().replace(/\s*[,;]?\s*(?:ext\.?|extensi[oó]n|x)\s*\d{1,6}\s*$/i, '').trim();
// El número nacional como se marca desde fuera: sin el 0 de larga distancia que se escribe dentro del país
// («+44 07911 123456»), el «1» de larga distancia de EE. UU. y Canadá («+1 1 305 555 1234») ni el «1» que antes
// llevaban los celulares de México («+52 1 55 1234 5678»), cuando sin él queda un número de ese país (en Italia el 0 es
// parte del número y se queda).
function nacionalDe(codigo, n) {
	if (nacionalBien(codigo, n)) return n;
	// El 0 solo en los países donde se marca dentro del país (Reino Unido, Alemania, Francia…); en Centroamérica no.
	const prefijo = codigo === '1' || codigo === '52' ? '1' : TRONCAL_0.includes(codigo) ? '0' : '';
	return prefijo && n.startsWith(prefijo) && nacionalBien(codigo, n.slice(1)) ? n.slice(1) : n;
}
// El número sin el código, cortado por dígitos («+(502) 5555-1234» → «5555-1234»).
const sinCodigo = (t, codigo) => t.replace(new RegExp(`^\\+\\D*${codigo.split('').join('\\D*')}`), '').replace(/^[\s).\-/]+/, '').trim();
// Código y número de un teléfono guardado, para mostrarlo en un campo con su código de país.
//  «+502 5555 1234» → { codigo: '502', numero: '5555 1234' }
//  «5555 1234» (sin código, como se guardaba antes) → el código por defecto
//  «50255551234» o «13055551234» (con el código pegado y el largo justo de ese país) → se separa
//  «+995 555 123» (código que no está en la lista) → { codigo: '', numero: '+995 555 123' }: se conserva tal cual
export function partirTelefono(tel, porDefecto = '502') {
	const t = String(tel || '').trim();
	if (!t) return { codigo: porDefecto, numero: '' };
	const digitos = t.replace(/\D/g, '');
	if (t.startsWith('+')) {
		const codigo = codigoDe(digitos);
		return codigo ? { codigo, numero: sinCodigo(t, codigo) } : { codigo: '', numero: t };
	}
	if (digitos.length === 11 && (digitos.startsWith('502') || digitos.startsWith('1')) && !/\D/.test(t)) {
		const codigo = digitos.startsWith('502') ? '502' : '1';
		return { codigo, numero: digitos.slice(codigo.length) };
	}
	return { codigo: porDefecto, numero: t };
}
// Código elegido + número → como se guarda. Si el número ya viene con «+» (o «00»), manda el número. El autollenado
// del navegador suele traer el código pegado («50255551234»): se quita solo si así queda el largo de un celular de ese
// país y con el código no; un número que empieza igual que su código («+39» y «392 123 4567») no se corta.
// La usan el panel (admin/js/form.js) y el sitio (js/site.js, por EQFormato).
export function unirTelefono(codigo, numero) {
	const n = String(numero || '').trim();
	if (!n) return '';
	if (n.startsWith('+') || !codigo) return n;
	const d = n.replace(/\D/g, '');
	if (/^00/.test(n.replace(/[\s.\-()]/g, ''))) {
		const c = codigoDe(d.slice(2));
		return c ? `+${c} ${d.slice(2 + c.length)}` : `+${d.slice(2)}`;
	}
	const cel = PLAN[codigo]?.celular;
	if (cel && d.startsWith(codigo) && d.length !== cel && d.length - codigo.length === cel) return `+${codigo} ${d.slice(codigo.length)}`;
	return `+${codigo} ${n}`;
}
// ¿Es un teléfono que se puede marcar? Con un código de la lista, el número va según el plan de ese país («+502» 8
// dígitos o un 1-800, «+1» 10, …), sin contar una extensión, el 0 de larga distancia ni el «1» viejo de México; con
// otro código, entre 7 y 15 dígitos en total. Sin «+», 8 dígitos (Guatemala, como antes) o de 7 a 15 con el código pegado.
export const telefonoValido = (tel) => {
	const t = sinExtension(tel), d = t.replace(/\D/g, '');
	if (t.startsWith('+')) {
		const codigo = codigoDe(d);
		if (codigo) return nacionalBien(codigo, nacionalDe(codigo, d.slice(codigo.length)));
	}
	return d.length >= 7 && d.length <= 15;
};

// Teléfono comparable y listo para wa.me: solo dígitos, sin extensión, y con el número como se marca desde fuera
// (sin el 0 de larga distancia ni el «1» viejo de México). Solo uno escrito sin «+» y de 8 dígitos se toma de
// Guatemala; uno con «+» nunca cambia de país.
export function telefonoWa(tel) {
	const t = sinExtension(tel);
	let n = t.replace(/\D/g, '');
	const codigo = t.startsWith('+') ? codigoDe(n) : '';
	if (codigo) return codigo + nacionalDe(codigo, n.slice(codigo.length));
	if (n.length === 8 && !t.startsWith('+')) n = `502${n}`;
	return n;
}

// Primer mensaje a quien escribió desde el sitio, en su idioma (el del sitio donde escribió, `lead.idioma`). Uno solo para
// el aviso del lead (netlify/functions/aviso-lead.mjs: WhatsApp y correo) y el botón de WhatsApp de Leads.
export function saludoLead({ nombre = '', propertyTitulo = '', idioma = 'es' } = {}) {
	const n = String(nombre).trim().split(/\s+/)[0] || '';
	return idioma === 'en'
		? `Hi${n ? ` ${n}` : ''}, thanks for reaching out${propertyTitulo ? ` about ${propertyTitulo}` : ''}. `
		: `Hola${n ? ` ${n}` : ''}, gracias por escribirnos${propertyTitulo ? ` por ${propertyTitulo}` : ''}. `;
}

export function whatsappUrl(tel, mensaje) {
	const n = telefonoWa(tel);
	const text = mensaje ? `text=${encodeURIComponent(mensaje)}` : '';
	return n ? `https://wa.me/${n}${text ? `?${text}` : ''}` : `https://wa.me/?${text}`;
}
