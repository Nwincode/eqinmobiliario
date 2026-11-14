// Quién es el dueño de qué y qué le llega a su panel. Módulo puro (sin Firebase ni DOM): lo usan la ficha de la
// persona (views/propietarios.js), el resumen que se le arma (portal.js) y su panel (mis-casas.js);
// se prueba con scripts/test-duenos.mjs.
import { acuerdoDe } from './acuerdo.js';

// Tiene casas por noche (fichas de antes: «tipo: socio»). No confundir con session.esSocio, que es el ROL del usuario
// del panel (todo dueño que entra, tenga o no casas por noche).
export const tieneCasasPorNoche = (d) => Boolean(d?.porNoche) || d?.tipo === 'socio';

// Un enlace o una foto que se puede mostrar: https o del mismo sitio («/…»); nada de javascript:, data: ni «//otro».
export const enlaceSeguro = (u) => (/^(https:\/\/|\/(?!\/))/.test(String(u || '')) ? String(u) : '');

// 32 bytes aleatorios en base64url: 43 caracteres, imposible de adivinar (id del resumen y clave de un acceso nuevo,
// que nadie ve y se descarta).
export function nuevoToken() {
	const b = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ¿Ya están publicadas las reglas nuevas de la base? Se sabe por cómo responde, sin sesión, la lectura de un resumen
// cualquiera: las de antes la dejaban (200, o 404 si no existe); las nuevas la niegan (403). Otra respuesta o sin red:
// se toma como «de antes», el lado seguro.
export const reglasNuevasSegun = (status) => status === 403;

// Cómo se le dice a la persona en el panel (encabezado, Usuarios, su ficha). Entran con el mismo rol («socio»).
export const etiquetaDueno = (tipo) => (tipo === 'colaborador' ? 'Colaborador' : 'Propietario');

// Casas de una persona: las que dicen ser suyas (propietarioId) y las de su lista.
export const casasDe = (p, propiedades) => propiedades.filter((c) => c.propietarioId === p.id || (p.propiedades || []).some((x) => x.propertyId === c.id));

// Al resumen de venta y renta no van las casas por noche: esas el dueño las ve y las cambia en vivo.
export const vaAlResumen = (casa) => Boolean(casa) && casa.operacion !== 'vacacional';

// Hasta cuándo va la exclusiva de UN inmueble. «propio» es su acuerdo (null si no tiene; undefined si quien arma el
// resumen no lo puede leer: entonces vale la fecha que quedó la vez anterior, para que no cambie según quién lo arme).
export function exclusivaHasta(propio, dueno, operacion, anterior = '') {
	if (propio === undefined) return anterior || '';
	const a = acuerdoDe(propio, dueno, operacion);
	return (a.exclusiva && a.exclusivaFin) || '';
}

// Lo que el dueño necesita de su propia ficha. Los datos de pago van tal cual (sin recortar ni limpiar): las reglas
// comparan el mensaje «pago» del chat con la ficha, carácter por carácter.
export function datosDelDueno(p) {
	return {
		nombre: String(p.nombre || '').trim().slice(0, 120),
		tipo: p.tipo === 'colaborador' ? 'colaborador' : 'propietario',
		email: String(p.email || '').trim().toLowerCase(),
		telefono: String(p.telefono || '').trim().slice(0, 40),
		datosPago: typeof p.datosPago === 'string' ? p.datosPago : ''
	};
}
