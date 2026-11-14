// Quién es el dueño de qué y qué le llega a su panel. Módulo puro (sin Firebase ni DOM): lo usan la ficha de la
// persona (views/propietarios.js), el resumen que se le arma (portal.js) y su panel (mis-casas.js);
// se prueba con scripts/test-duenos.mjs.
import { acuerdoDe } from './acuerdo.js';

// Socio de renta vacacional: quien tiene casas por noche («tipo: socio» = fichas de antes).
export const esSocio = (d) => Boolean(d?.porNoche) || d?.tipo === 'socio';

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
