// Marca de agua para las fotos de propiedades.
// Uso: await ponerMarca(canvas)  — el canvas ya debe tener la foto dibujada.
//
// Composición: sello centrado (ícono de la casa + "EQINMOBILIARIO.GT" con líneas finas
// a los lados), blanco a opacidad baja y sombra difusa para que se lea en fotos claras
// y oscuras. Está en el centro óptico para que no se pueda recortar sin perder la foto.
// Además, un pequeño crédito de la web en la esquina inferior derecha.

const LOGO_URL = '/Icono_Equipoinmobiliario@0.75x.png';
// Región del ícono (círculo con la casa) dentro del PNG de 340x82.
const ICONO = { x: 0, y: 12, w: 58, h: 58 };
const TEXTO = 'EQINMOBILIARIO.GT';
const FUENTE = '"Work Sans", "Helvetica Neue", Arial, sans-serif';

let iconoBlanco = null; // Promise<HTMLCanvasElement|null>, cacheada

function cargarIcono() {
	if (iconoBlanco) return iconoBlanco;
	iconoBlanco = new Promise((resolve) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => {
			try {
				const escala = img.naturalWidth / 340 || 1;
				const c = document.createElement('canvas');
				c.width = Math.round(ICONO.w * escala);
				c.height = Math.round(ICONO.h * escala);
				const x = c.getContext('2d');
				x.drawImage(img, ICONO.x * escala, ICONO.y * escala, ICONO.w * escala, ICONO.h * escala, 0, 0, c.width, c.height);
				x.globalCompositeOperation = 'source-in';
				x.fillStyle = '#fff';
				x.fillRect(0, 0, c.width, c.height);
				resolve(c);
			} catch { resolve(null); }
		};
		img.onerror = () => { iconoBlanco = null; resolve(null); };
		img.src = LOGO_URL;
	});
	return iconoBlanco;
}

async function cargarFuente(px) {
	try {
		if (document.fonts && document.fonts.load) {
			await Promise.race([
				Promise.all([
					document.fonts.load(`500 ${px}px "Work Sans"`, TEXTO),
					document.fonts.load(`600 ${px}px "Work Sans"`, TEXTO),
				]),
				new Promise((r) => setTimeout(r, 1500)),
			]);
		}
	} catch { /* se usa la pila de respaldo */ }
}

// Texto con tracking, dibujado letra por letra (no todos los navegadores tienen ctx.letterSpacing).
function anchoTracking(ctx, txt, track) {
	let w = 0;
	for (const ch of txt) w += ctx.measureText(ch).width + track;
	return w - track;
}
function textoTracking(ctx, txt, x, y, track) {
	for (const ch of txt) {
		ctx.fillText(ch, x, y);
		x += ctx.measureText(ch).width + track;
	}
}

// Dibuja el sello en blanco opaco sobre un canvas aparte; luego se compone con opacidad.
function dibujarSello(icono, fs) {
	const track = fs * 0.16;                      // tracking amplio, estilo premium
	const iconSize = Math.round(fs * 2.3);
	const gap = Math.round(fs * 0.55);            // entre ícono y texto
	const lineaLargo = Math.round(fs * 1.8);
	const lineaGap = Math.round(fs * 0.75);
	const grosor = Math.max(1, fs * 0.07);

	const m = document.createElement('canvas').getContext('2d');
	m.font = `600 ${fs}px ${FUENTE}`;
	const tw = anchoTracking(m, TEXTO, track);
	// Altura real de las mayúsculas, para centrar el texto y las líneas con precisión.
	const mt = m.measureText('E');
	const cap = mt.actualBoundingBoxAscent || fs * 0.7;
	const ancho = Math.ceil(tw + 2 * (lineaGap + lineaLargo));
	const alto = Math.ceil((icono ? iconSize + gap : 0) + cap);
	const pad = Math.ceil(fs * 1.2);              // aire para la sombra

	const c = document.createElement('canvas');
	c.width = ancho + pad * 2;
	c.height = alto + pad * 2;
	const x = c.getContext('2d');
	x.fillStyle = '#fff';
	x.strokeStyle = '#fff';
	x.imageSmoothingQuality = 'high';
	const cx = c.width / 2;
	let y = pad;
	if (icono) {
		x.drawImage(icono, Math.round(cx - iconSize / 2), y, iconSize, iconSize);
		y += iconSize + gap;
	}
	x.font = `600 ${fs}px ${FUENTE}`;
	x.textBaseline = 'alphabetic';
	textoTracking(x, TEXTO, cx - tw / 2, y + cap, track);
	// Líneas finas a los lados, centradas en la altura de las mayúsculas.
	const ly = y + cap / 2;
	x.fillRect(cx - tw / 2 - lineaGap - lineaLargo, ly - grosor / 2, lineaLargo, grosor);
	x.fillRect(cx + tw / 2 + lineaGap, ly - grosor / 2, lineaLargo, grosor);
	return c;
}

// Luminancia media (0–1) de una zona del canvas; 0.5 si no se puede leer.
function luminancia(ctx, x, y, w, h) {
	try {
		const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
		let t = 0, n = 0;
		for (let i = 0; i < d.length; i += 4 * 16) { t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
		return n ? t / n / 255 : 0.5;
	} catch { return 0.5; }
}

// Compone la capa en dos pasadas: 1) solo un halo oscuro difuso (la capa se dibuja fuera
// del canvas y se desplaza únicamente su sombra), para separar el blanco de fondos claros;
// 2) la capa blanca con su opacidad.
function componer(ctx, capa, dx, dy, alpha, sombra, halo) {
	dx = Math.round(dx); dy = Math.round(dy);
	const lejos = capa.width + dx + 10000;
	ctx.save();
	ctx.shadowOffsetX = lejos;
	ctx.shadowOffsetY = 0;
	// Halo amplio y suave + contorno corto más denso (define la letra sin verse como caja).
	ctx.shadowColor = `rgba(0,0,0,${halo * 0.7})`;
	ctx.shadowBlur = sombra;
	ctx.drawImage(capa, dx - lejos, dy);
	ctx.shadowColor = `rgba(0,0,0,${halo})`;
	ctx.shadowBlur = sombra * 0.25;
	ctx.drawImage(capa, dx - lejos, dy);
	ctx.restore();
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.drawImage(capa, dx, dy);
	ctx.restore();
}

export async function ponerMarca(canvas) {
	const ctx = canvas.getContext('2d');
	const W = canvas.width, H = canvas.height;
	if (!ctx || !W || !H) return canvas;
	const base = Math.min(W, H);
	// El sello ocupa ~58 % del ancho de la foto para que la web se lea aun en la vista
	// de celular (375 px), sin pasar de 5.5 % del alto en panorámicas.
	const m = document.createElement('canvas').getContext('2d');
	let fs = Math.round(base * 0.042);
	const [icono] = await Promise.all([cargarIcono(), cargarFuente(fs)]);
	m.font = `600 100px ${FUENTE}`;
	const anchoPor100 = anchoTracking(m, TEXTO, 16) + 510; // ancho del sello con fs = 100
	fs = Math.max(10, Math.round(Math.min((W * 0.58) / anchoPor100 * 100, H * 0.055)));

	// 1) Sello central (un poco abajo del centro geométrico = centro óptico de la foto).
	const sello = dibujarSello(icono, fs);
	const sx = (W - sello.width) / 2, sy = H * 0.53 - sello.height / 2;
	// En zonas claras sube el halo y la opacidad para que el blanco siga leyéndose.
	const luz = luminancia(ctx, sx, sy, sello.width, sello.height);
	componer(ctx, sello, sx, sy, 0.55 + 0.25 * luz, fs * 0.9, 0.15 + 0.45 * luz);

	// 2) Crédito pequeño en la esquina inferior derecha.
	const fc = Math.max(12, Math.round(base * 0.019));
	const track = fc * 0.16;
	const c = document.createElement('canvas');
	const mc = c.getContext('2d');
	mc.font = `600 ${fc}px ${FUENTE}`;
	const tw = anchoTracking(mc, TEXTO, track);
	const pad = Math.ceil(fc);
	c.width = Math.ceil(tw) + pad * 2;
	c.height = Math.ceil(fc * 1.4) + pad * 2;
	const x = c.getContext('2d');
	x.font = `600 ${fc}px ${FUENTE}`;
	x.fillStyle = '#fff';
	x.textBaseline = 'middle';
	textoTracking(x, TEXTO, pad, c.height / 2, track);
	const margen = Math.max(12, base * 0.032);
	const cxp = W - margen - tw - pad, cyp = H - margen - c.height / 2 - fc * 0.2;
	const luzC = luminancia(ctx, cxp, cyp, c.width, c.height);
	componer(ctx, c, cxp, cyp, 0.8, fc * 0.6, 0.35 + 0.4 * luzC);

	return canvas;
}
