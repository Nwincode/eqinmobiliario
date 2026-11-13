// Formatos compartidos por el panel y el generador del sitio. Sin DOM ni Firebase: también corre en Node.
// Antes de escribir otro formato de precio, número o WhatsApp, usar los de aquí.

export const M2_A_FT2 = 10.7639;
// Vara cuadrada de Guatemala: 1 v² = 0.698737 m².
export const M2_A_V2 = 1.43115;

const PREFIJO_MONEDA = { USD: 'US$', GTQ: 'Q' };
export const prefijoMoneda = (moneda) => PREFIJO_MONEDA[moneda] || moneda;

// Número con coma en miles y punto en decimales (2,226.47), como se usa en Guatemala.
export const miles = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
// Dinero: siempre con 2 decimales (1,250.00), con o sin el prefijo de la moneda.
export const decimales = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinero = (n, moneda) => `${prefijoMoneda(moneda)} ${decimales(n)}`;
// «1 noche», «3 noches».
export const nNoches = (n) => `${n} ${n === 1 ? 'noche' : 'noches'}`;

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
