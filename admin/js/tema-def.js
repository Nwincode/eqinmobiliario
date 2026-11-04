// Colores del sitio que se pueden cambiar desde el panel (Contenido → Colores).
// Lo usan el panel y la publicación: cada valor se vuelve una variable CSS de css/tema.css.
// Sin dependencias del navegador para que también lo importe scripts/build.mjs.

export const COLORES_TEMA = [
	{ clave: 'dark', variable: '--eq-dark', label: 'Color oscuro', defecto: '#0e1920', ayuda: 'Original: negro azulado. Menú, pie, títulos y texto.' },
	{ clave: 'primary', variable: '--eq-primary', label: 'Color principal', defecto: '#0e5e8a', ayuda: 'Original: azul. Botones, enlaces y precios; el tono al pasar el mouse se calcula solo.' },
	{ clave: 'cyan', variable: '--eq-cyan', label: 'Color de acento', defecto: '#00b7e7', ayuda: 'Original: celeste del logo. Líneas, cifras y borde de foco.' },
	{ clave: 'white', variable: '--eq-white', label: 'Fondo', defecto: '#ffffff', ayuda: 'Fondo general de las páginas y texto de los botones.' },
	{ clave: 'ink', variable: '--eq-ink', label: 'Gris de textos secundarios', defecto: '#5b666f', ayuda: 'Descripciones, fechas y detalles.' },
	{ clave: 'gold', variable: '--eq-gold', label: 'Dorado VIP', defecto: '#85662b', ayuda: 'Sello y botones de las propiedades VIP.' },
	{ clave: 'whatsapp', variable: '--eq-whatsapp', label: 'Verde WhatsApp', defecto: '#1e7e4a', ayuda: 'Botones de WhatsApp.' }
];

export const RADIO_TEMA = { clave: 'radio', variable: '--eq-radius', label: 'Esquinas de botones y campos (px)', defecto: 8, min: 0, max: 28 };

export const hexValido = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

// Solo los valores válidos y distintos del original; el resto queda como en css/tema.css.
export function variablesTema(tema = {}) {
	const vars = {};
	for (const c of COLORES_TEMA) {
		const v = tema[c.clave];
		if (hexValido(v) && v.toLowerCase() !== c.defecto) vars[c.variable] = v.toLowerCase();
	}
	const r = Number(tema[RADIO_TEMA.clave]);
	if (tema[RADIO_TEMA.clave] !== '' && tema[RADIO_TEMA.clave] != null && Number.isFinite(r) && r !== RADIO_TEMA.defecto) {
		vars[RADIO_TEMA.variable] = `${Math.round(Math.min(RADIO_TEMA.max, Math.max(RADIO_TEMA.min, r)))}px`;
	}
	return vars;
}

export function cssTema(tema) {
	const vars = Object.entries(variablesTema(tema));
	return vars.length ? `:root{${vars.map(([k, v]) => `${k}:${v}`).join(';')}}` : '';
}

export function colorTema(tema, clave) {
	const def = COLORES_TEMA.find((c) => c.clave === clave);
	const v = tema?.[clave];
	return hexValido(v) ? v.toLowerCase() : def.defecto;
}

// Contraste WCAG entre dos colores hex (1 a 21). Texto normal necesita 4.5 o más.
function luminancia(hex) {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
	const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

// Combinaciones de texto que usa el sitio; el panel avisa si alguna no se lee bien.
export const PARES_CONTRASTE = [
	['white', 'primary', 'Texto de los botones principales'],
	['white', 'dark', 'Texto del menú y del pie'],
	['dark', 'white', 'Texto general'],
	['ink', 'white', 'Textos secundarios'],
	['primary', 'white', 'Enlaces y precios'],
	['white', 'gold', 'Botones VIP'],
	['white', 'whatsapp', 'Botones de WhatsApp']
];

// Combinaciones listas para elegir con un clic (todas con contraste 4.5:1 o más en los textos).
// Lo que no se indica queda con el color original de la marca.
export const PALETAS = [
	{ nombre: 'Marca (original)', descripcion: 'Negro azulado, azul y celeste del logo.', tema: {} },
	{ nombre: 'Azul océano', descripcion: 'Azul más vivo, sobrio y corporativo.', tema: { dark: '#0b1a2c', primary: '#1d4f91', ink: '#566273' } },
	{ nombre: 'Grafito', descripcion: 'Casi monocromo: negro, gris carbón y celeste.', tema: { dark: '#161718', primary: '#2d3a45', ink: '#5f6368' } },
	{ nombre: 'Petróleo', descripcion: 'Azul verdoso, fresco y elegante.', tema: { dark: '#0c1f24', primary: '#0f6670', cyan: '#3cc8d4', ink: '#55666a' } },
	{ nombre: 'Verde bosque', descripcion: 'Natural, para casas con jardín y terrenos.', tema: { dark: '#0f1d17', primary: '#1d5e45', cyan: '#5cc29a', ink: '#56645d' } },
	{ nombre: 'Arena', descripcion: 'Cálido: café, beige y dorado.', tema: { dark: '#231e1a', primary: '#7d5530', cyan: '#d4a85f', white: '#fffdf9', ink: '#6a6058', gold: '#7a5c26' } },
	{ nombre: 'Terracota', descripcion: 'Cálido y mediterráneo.', tema: { dark: '#221714', primary: '#9a3f24', cyan: '#e49a6a', white: '#fffcfa', ink: '#6c5e58' } },
	{ nombre: 'Vino', descripcion: 'Elegante, para propiedades de lujo.', tema: { dark: '#1d1216', primary: '#7a1f3d', cyan: '#d88ba4', ink: '#685a60' } }
];
