// Reglas de «Datos por completar», sin dependencias del navegador (se prueban en Node).
// Para cambiar qué se pide, edita REGLAS.
const vacio = (v) => v === undefined || v === null || String(v).trim() === '';
const CON_CUARTOS = ['casa', 'apartamento'];
// Ciudades donde se usa «zona»; fuera de ellas basta la ciudad.
const CIUDADES_CON_ZONA = ['guatemala', 'ciudad de guatemala', 'mixco', 'villa nueva'];

// Cada regla: [campo del formulario, texto que ve el usuario, función que dice si falta].
export const REGLAS = {
	propiedades: {
		etiqueta: 'Propiedades', ruta: 'propiedades', icono: 'icon-home2',
		nombre: (p) => p.titulo || p.codigo || 'Propiedad sin título',
		aplica: (p) => p.estado !== 'retirada',
		campos: [
			['titulo', 'Título', (p) => vacio(p.titulo)],
			['propietarioId', 'Propietario o colaborador', (p) => vacio(p.propietarioId)],
			['precio', 'Precio', (p) => vacio(p.precio) || Number(p.precio) <= 0],
			['ciudad', 'Ciudad o municipio', (p) => vacio(p.ciudad)],
			['zona', 'Zona', (p) => vacio(p.zona) && CIUDADES_CON_ZONA.includes(String(p.ciudad || '').trim().toLowerCase())],
			['descripcion', 'Descripción', (p) => vacio(p.descripcion)],
			['fotos', 'Fotos (al menos una)', (p) => !(Array.isArray(p.fotos) && p.fotos.length)],
			['m2Construccion', 'm² de construcción', (p) => CON_CUARTOS.includes(p.tipo) && vacio(p.m2Construccion)],
			['m2Terreno', 'm² de terreno o de construcción', (p) => !CON_CUARTOS.includes(p.tipo) && vacio(p.m2Terreno) && vacio(p.m2Construccion)],
			['habitaciones', 'Habitaciones', (p) => CON_CUARTOS.includes(p.tipo) && vacio(p.habitaciones)],
			['banos', 'Baños', (p) => CON_CUARTOS.includes(p.tipo) && vacio(p.banos)],
			['parqueos', 'Parqueos', (p) => CON_CUARTOS.includes(p.tipo) && vacio(p.parqueos)]
		]
	},
	clientes: {
		etiqueta: 'Clientes', ruta: 'clientes', icono: 'icon-users',
		nombre: (c) => c.nombre || 'Cliente sin nombre',
		aplica: (c) => c.etapa !== 'perdido',
		campos: [
			['nombre', 'Nombre', (c) => vacio(c.nombre)],
			['telefono', 'Teléfono o correo', (c) => vacio(c.telefono) && vacio(c.email)]
		]
	},
	propietarios: {
		etiqueta: 'Propietarios', ruta: 'propietarios', icono: 'icon-key',
		nombre: (p) => p.nombre || 'Propietario sin nombre',
		aplica: () => true,
		campos: [
			['nombre', 'Nombre', (p) => vacio(p.nombre)],
			['telefono', 'Teléfono o correo', (p) => vacio(p.telefono) && vacio(p.email)]
		]
	},
	asesores: {
		etiqueta: 'Asesores', ruta: 'asesores', icono: 'icon-id-card', soloAdmin: true,
		nombre: (a) => a.nombre || 'Asesor sin nombre',
		aplica: (a) => a.activo !== false,
		campos: [
			['nombre', 'Nombre', (a) => vacio(a.nombre)],
			['whatsapp', 'WhatsApp', (a) => vacio(a.whatsapp)],
			['email', 'Correo', (a) => vacio(a.email)],
			['foto', 'Foto', (a) => vacio(a.foto?.url ?? a.foto)]
		]
	}
};

// Lista de lo que falta en un registro: [{ campo, etiqueta }].
export function revisar(tipo, d) {
	const r = REGLAS[tipo];
	if (!r || !d || !r.aplica(d)) return [];
	return r.campos.filter(([, , falta]) => falta(d)).map(([campo, etiqueta]) => ({ campo, etiqueta }));
}

// Registros incompletos de una lista: [{ id, nombre, faltan }].
export function incompletos(tipo, lista) {
	return (lista || []).map((d) => ({ id: d.id, nombre: REGLAS[tipo].nombre(d), faltan: revisar(tipo, d) }))
		.filter((x) => x.faltan.length);
}
