// Colores del sitio que se pueden cambiar desde el panel (Contenido → Colores).
// Lo usan el panel y la publicación: cada valor se vuelve una variable CSS de css/tema.css.
// Sin dependencias del navegador para que también lo importe scripts/build.mjs.

export const COLORES_TEMA = [
	{ clave: 'dark', variable: '--eq-dark', label: 'Negro de marca', defecto: '#0e1920', ayuda: 'Menú, pie de página, títulos y texto.' },
	{ clave: 'primary', variable: '--eq-primary', label: 'Azul principal', defecto: '#0e5e8a', ayuda: 'Botones, enlaces y precios. El tono al pasar el mouse se calcula solo.' },
	{ clave: 'cyan', variable: '--eq-cyan', label: 'Celeste del logo', defecto: '#00b7e7', ayuda: 'Acentos: líneas, cifras y el borde de foco.' },
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
	['white', 'primary', 'Texto de los botones azules'],
	['white', 'dark', 'Texto del menú y del pie'],
	['dark', 'white', 'Texto general'],
	['ink', 'white', 'Textos secundarios'],
	['primary', 'white', 'Enlaces y precios'],
	['white', 'gold', 'Botones VIP'],
	['white', 'whatsapp', 'Botones de WhatsApp']
];
