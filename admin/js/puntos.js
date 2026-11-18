// Puntos del bloque «Compradores en EE. UU.» (Contenido): cada punto lleva un ícono que dice de qué habla.
// Los puntos guardados antes como texto solo reciben el ícono que corresponde a lo que dicen; en Contenido se cambia.
const SUGERIDOS = [
	[/video/i, 'icon-video-camera'],
	[/d[oó]lar|dollar|precio|price/i, 'icon-usd'],
	[/firma|sign|poder|attorney|notari/i, 'icon-balance-scale'],
	[/escritura|grav[aá]men|title|lien|document/i, 'icon-file-text-o'],
	[/horario|schedule/i, 'icon-clock-o'],
	[/ingl[eé]s|english|contact/i, 'icon-comments']
];
export const iconoSugerido = (texto) => (SUGERIDOS.find(([re]) => re.test(texto || '')) || [null, 'icon-check-circle'])[1];

export const puntosConIcono = (puntos) => (Array.isArray(puntos) ? puntos : [])
	.map((p) => (typeof p === 'string' ? { texto: p } : { icono: p && p.icono, texto: (p && p.texto) || '' }))
	.map((p) => ({ icono: p.icono || iconoSugerido(p.texto), texto: String(p.texto).trim() }))
	.filter((p) => p.texto);
