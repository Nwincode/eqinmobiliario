// La versión en inglés de una casa: qué textos se traducen y cuándo hace falta volver a traducir. Sin DOM ni Firebase
// (la usan la ficha de la casa, el importador y «Cambios de los dueños», y sus pruebas corren en Node).

// Las casas por noche suman cómo llegar, reglas y cancelación (solo si los tienen).
export const TEXTOS_VAC = ['comoLlegar', 'reglas', 'cancelacion'];

// Los textos de la página VIP (solo de las VIP) y la clave con que vuelven del traductor.
export const TEXTOS_VIP = { titular: 'vipTitular', subtitular: 'vipSubtitular', ctaTexto: 'ctaTexto' };

// "fuente" guarda el texto en español traducido, para saber si cambió después. Todas suman sus amenidades y las VIP los
// textos de su página (solo lo que tienen): si cambia cualquiera de ellos, el inglés se rehace.
export const fuenteEs = (d) => [d.titulo || '', d.descripcion || '', ...TEXTOS_VAC.map((k) => d.vacacional?.[k]).filter(Boolean),
	(d.amenidades || []).join(', '),
	...(d.vip ? [...Object.keys(TEXTOS_VIP).map((k) => d.vipLanding?.[k]), (d.vipLanding?.puntosClave || []).join(', ')] : [])].filter(Boolean).join('\n');

// ¿Hay que traducir? Falta el inglés, o el español cambió y el inglés no se corrigió a mano.
export const faltaIngles = (d) => {
	const en = d.en || {};
	return Boolean(d.titulo) && (!String(en.titulo || '').trim() || (!en.manual && (!String(en.descripcion || '').trim() || en.fuente !== fuenteEs(d))));
};

// Lo que tiene texto en español y volvió vacío de la traducción (r: lo que respondió el traductor).
const lleno = (v) => Boolean(String(v || '').trim());
export const textosSinTraducir = (d, r) => [
	...['titulo', 'descripcion'].filter((k) => lleno(d[k]) && !lleno(r[k])),
	...TEXTOS_VAC.filter((k) => lleno(d.vacacional?.[k]) && !lleno(r[k])),
	...(d.vip ? Object.entries(TEXTOS_VIP).filter(([k, rk]) => lleno(d.vipLanding?.[k]) && !lleno(r[rk])).map(([k]) => k) : [])];

// La "fuente" que se guarda con la traducción: si un texto volvió vacío, ninguna. Así la casa no cuenta como traducida
// y el sitio en inglés no publica ese texto en español como si fuera la traducción: se vuelve a traducir al guardar.
export const fuenteTraducida = (d, r) => (textosSinTraducir(d, r).length ? '' : fuenteEs(d));
