// Política de cancelación de una casa por noche: la única lista, en español e inglés. Puro: lo usan la ficha
// (views/properties.js), «La casa» del dueño (mi-casa.js, views/mis-casas.js), la casa nueva del socio (casa-nueva.js),
// la página de la casa (scripts/lib/templates.mjs) y la respuesta sugerida del chat (netlify/lib/sugerir-respuesta.mjs).
// Se guarda en `vacacional.cancelacionPolitica`; `vacacional.cancelacion` es la nota de la casa (lo que antes se
// escribía como texto libre sigue ahí, como nota). Pruebas: scripts/test-cancelacion.mjs.
export const POLITICAS_CANCELACION = [
	{ valor: 'flexible', es: ['Flexible', 'Cancela hasta 24 h antes de llegar y recibe todo de vuelta.'], en: ['Flexible', 'Cancel up to 24 hours before check-in for a full refund.'] },
	{ valor: 'moderada', es: ['Moderada', 'Hasta 5 días antes, todo de vuelta; después, la mitad.'], en: ['Moderate', 'Full refund up to 5 days before check-in; after that, half.'] },
	{ valor: 'estricta', es: ['Estricta', 'Hasta 14 días antes, la mitad de vuelta; después, nada.'], en: ['Strict', 'Half refunded up to 14 days before check-in; after that, no refund.'] }
];
export const VALORES_CANCELACION = POLITICAS_CANCELACION.map((p) => p.valor);
// Para el tipo «opciones» de form.js: [[valor, título, línea]].
export const opcionesCancelacion = (lng = 'es') => POLITICAS_CANCELACION.map((p) => [p.valor, ...p[lng]]);

// «Moderada: Hasta 5 días antes, todo de vuelta; después, la mitad.» + la nota. Sin política ni nota, vacío (quien
// lo muestra pone lo general). `nota`: la del idioma que se muestra.
export function textoCancelacion(politica, nota = '', lng = 'es') {
	const p = POLITICAS_CANCELACION.find((x) => x.valor === politica);
	return [p ? `${p[lng][0]}: ${p[lng][1]}` : '', String(nota || '').trim()].filter(Boolean).join(' ');
}
