// Formatos compartidos por el panel y el generador del sitio. Sin DOM ni Firebase: también corre en Node.
// Antes de escribir otro formato de precio, número o WhatsApp, usar los de aquí.

export const M2_A_FT2 = 10.7639;

const PREFIJO_MONEDA = { USD: 'US$', GTQ: 'Q' };
export const prefijoMoneda = (moneda) => PREFIJO_MONEDA[moneda] || moneda;

// Número con coma en miles y punto en decimales (2,226.47), como se usa en Guatemala.
export const miles = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

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
