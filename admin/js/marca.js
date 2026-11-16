// Marca de agua para las fotos de propiedades.
// Uso: await ponerMarca(canvas)  — el canvas ya debe tener la foto dibujada.
//
// Composición (decisión del dueño, opción «B»):
//  - En la esquina inferior derecha, una cápsula oscura translúcida con el ícono de la casa y «eqinmobiliario.gt»:
//    se lee siempre y no tapa la foto.
//  - En el centro óptico, el sello (ícono + "EQINMOBILIARIO.GT" con líneas finas) casi invisible (12 % con una sombra
//    suave): no estorba al ver la casa, pero no se puede recortar sin perder la foto y prueba de dónde salió.

// El ícono (círculo con la casa) en vector y en blanco: se dibuja nítido a cualquier tamaño, sin estirarse ni pixelarse.
// docs/marca/logo/icono-blanco.svg es el favicon de la marca sin el fondo (cuadrado, así nunca se deforma).
const ICONO_URL = '/docs/marca/logo/icono-blanco.svg';
const TEXTO = 'EQINMOBILIARIO.GT';
const FUENTE = '"Work Sans", "Helvetica Neue", Arial, sans-serif';

let iconoBlanco = null; // Promise<HTMLImageElement|null>, cacheada

function cargarIcono() {
	if (iconoBlanco) return iconoBlanco;
	iconoBlanco = new Promise((resolve) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => resolve(img.naturalWidth ? img : null);
		img.onerror = () => { iconoBlanco = null; resolve(null); };
		img.src = ICONO_URL;
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

	// 1) Sello central casi invisible (un poco abajo del centro geométrico = centro óptico de la foto).
	const sello = dibujarSello(icono, fs);
	const sx = (W - sello.width) / 2, sy = H * 0.53 - sello.height / 2;
	const luz = luminancia(ctx, sx, sy, sello.width, sello.height);
	componer(ctx, sello, sx, sy, 0.12, fs * 0.9, 0.05 + 0.1 * luz);

	// 2) Cápsula en la esquina inferior derecha: ícono blanco + «eqinmobiliario.gt» sobre fondo oscuro translúcido.
	const fc = Math.max(12, Math.round(base * 0.024));
	const web = 'eqinmobiliario.gt';
	ctx.save();
	ctx.font = `600 ${fc}px ${FUENTE}`;
	const tw = ctx.measureText(web).width;
	const ic = icono ? Math.round(fc * 1.55) : 0;
	const pad = Math.round(fc * 0.7);
	const alto = Math.round(Math.max(ic, fc * 1.2) + pad * 1.1);
	const ancho = Math.round(pad * 2 + (ic ? ic + fc * 0.45 : 0) + tw);
	const margen = Math.max(10, Math.round(base * 0.028));
	const px = W - margen - ancho, py = H - margen - alto;
	ctx.fillStyle = 'rgba(14, 25, 32, 0.5)';
	ctx.beginPath();
	if (ctx.roundRect) ctx.roundRect(px, py, ancho, alto, alto / 2); else ctx.rect(px, py, ancho, alto);
	ctx.fill();
	if (icono) ctx.drawImage(icono, px + pad, Math.round(py + (alto - ic) / 2), ic, ic);
	ctx.fillStyle = '#fff';
	ctx.textBaseline = 'middle';
	ctx.fillText(web, px + pad + (ic ? ic + fc * 0.45 : 0), py + alto / 2 + fc * 0.05);
	ctx.restore();

	return canvas;
}
