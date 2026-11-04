// Estados de una propiedad y qué pasa en el sitio con cada uno.
// Lo usan el panel y la publicación (scripts/build.mjs): sin dependencias del navegador.
//
// visibilidad:
//   'visible' → aparece en portada, listados, buscador, destacadas, sitemap y catálogos.
//   'cerrada' → sale de todo lo anterior, pero su enlace sigue funcionando con el aviso
//               «Vendida» / «Rentada», un botón de contacto y propiedades parecidas.
//   'oculta'  → no aparece en ningún lado; su enlace muestra «Ya no está disponible»
//               (sin fotos ni datos) con propiedades parecidas, y Google no la indexa.
// «Visible en la página» (campo publicado) apagado oculta todo, como un borrador.
export const ESTADOS_PROPIEDAD = [
	{ valor: 'disponible', label: 'Disponible', es: 'Disponible', en: 'Available', visibilidad: 'visible',
		ayuda: 'Se muestra en todo el sitio.' },
	{ valor: 'proximamente', label: 'Próximamente', es: 'Próximamente', en: 'Coming soon', visibilidad: 'visible',
		ayuda: 'Pre-lanzamiento: se muestra con la etiqueta «Próximamente» para recibir interesados antes de salir.' },
	{ valor: 'reservada', label: 'Reservada / con oferta', es: 'Reservada', en: 'Under contract', visibilidad: 'visible',
		ayuda: 'Tiene oferta, arras o promesa firmada: se sigue mostrando con la etiqueta «Reservada».' },
	{ valor: 'vendida', label: 'Vendida', es: 'Vendida', en: 'Sold', visibilidad: 'cerrada',
		ayuda: 'Sale de portada, listados y buscador. Su enlace sigue abriendo con el aviso «Vendida» y propiedades parecidas.' },
	{ valor: 'rentada', label: 'Rentada', es: 'Rentada', en: 'Rented', visibilidad: 'cerrada',
		ayuda: 'Sale de portada, listados y buscador. Su enlace sigue abriendo con el aviso «Rentada» y propiedades parecidas.' },
	{ valor: 'pausada', label: 'Pausada', es: 'No disponible', en: 'Not available', visibilidad: 'oculta',
		ayuda: 'El dueño pidió pausar un tiempo (viaje, remodelación, inquilino actual). No aparece en ningún lado; vuelve a «Disponible» para mostrarla.' },
	{ valor: 'retirada', label: 'Retirada del mercado', es: 'No disponible', en: 'Not available', visibilidad: 'oculta',
		ayuda: 'El dueño ya no vende o renta, la vendió por su cuenta o venció la exclusiva. No aparece en ningún lado.' }
];

const POR_VALOR = Object.fromEntries(ESTADOS_PROPIEDAD.map((e) => [e.valor, e]));

// Estado de una propiedad (los valores desconocidos o vacíos cuentan como «disponible»).
export function estadoDe(p) {
	return POR_VALOR[(p && p.estado) || 'disponible'] || POR_VALOR.disponible;
}

// 'borrador' (visible apagado) · 'visible' · 'cerrada' · 'oculta'
export function visibilidadDe(p) {
	if (!p || !p.publicado) return 'borrador';
	return estadoDe(p).visibilidad;
}

// Se puede ofrecer (sitio, catálogos, portales, IA): visible y no vendida/rentada/pausada/retirada.
export const seOfrece = (p) => visibilidadDe(p) === 'visible';
