// Lugares de Guatemala: la única tabla de departamentos, municipios, zonas de la capital y sectores. Puro: lo usan la
// ficha de la propiedad (municipio y zona, `form.js` tipo «sugerido»), la casa nueva del socio y su revisión en el
// servidor (casa-nueva.js), el importador, Clientes (zonas de interés) y el sitio (scripts/lib/util.mjs
// `departamentoDe`: Google y los portales). Pruebas: scripts/test-lugares.mjs.
//
// Los 340 municipios, por departamento (INE, división vigente desde 2015). Compilada sin poder consultar la fuente en
// línea (la red de la sesión no llega a Wikipedia ni al INE): la prueba revisa el número de cada departamento.
export const MUNICIPIOS = {
	Guatemala: ['Guatemala', 'Santa Catarina Pinula', 'San José Pinula', 'San José del Golfo', 'Palencia', 'Chinautla', 'San Pedro Ayampuc',
		'Mixco', 'San Pedro Sacatepéquez', 'San Juan Sacatepéquez', 'San Raymundo', 'Chuarrancho', 'Fraijanes', 'Amatitlán', 'Villa Nueva',
		'Villa Canales', 'San Miguel Petapa'],
	'El Progreso': ['Guastatoya', 'Morazán', 'San Agustín Acasaguastlán', 'San Cristóbal Acasaguastlán', 'El Jícaro', 'Sansare', 'Sanarate',
		'San Antonio La Paz'],
	'Sacatepéquez': ['Antigua Guatemala', 'Jocotenango', 'Pastores', 'Sumpango', 'Santo Domingo Xenacoj', 'Santiago Sacatepéquez',
		'San Bartolomé Milpas Altas', 'San Lucas Sacatepéquez', 'Santa Lucía Milpas Altas', 'Magdalena Milpas Altas', 'Santa María de Jesús',
		'Ciudad Vieja', 'San Miguel Dueñas', 'Alotenango', 'San Antonio Aguas Calientes', 'Santa Catarina Barahona'],
	Chimaltenango: ['Chimaltenango', 'San José Poaquil', 'San Martín Jilotepeque', 'San Juan Comalapa', 'Santa Apolonia', 'Tecpán Guatemala',
		'Patzún', 'San Miguel Pochuta', 'Patzicía', 'Santa Cruz Balanyá', 'Acatenango', 'San Pedro Yepocapa', 'San Andrés Itzapa', 'Parramos',
		'Zaragoza', 'El Tejar'],
	Escuintla: ['Escuintla', 'Santa Lucía Cotzumalguapa', 'La Democracia', 'Siquinalá', 'Masagua', 'Tiquisate', 'La Gomera', 'Guanagazapa',
		'San José', 'Iztapa', 'Palín', 'San Vicente Pacaya', 'Nueva Concepción', 'Sipacate'],
	'Santa Rosa': ['Cuilapa', 'Barberena', 'Santa Rosa de Lima', 'Casillas', 'San Rafael Las Flores', 'Oratorio', 'San Juan Tecuaco',
		'Chiquimulilla', 'Taxisco', 'Santa María Ixhuatán', 'Guazacapán', 'Santa Cruz Naranjo', 'Pueblo Nuevo Viñas', 'Nueva Santa Rosa'],
	'Sololá': ['Sololá', 'San José Chacayá', 'Santa María Visitación', 'Santa Lucía Utatlán', 'Nahualá', 'Santa Catarina Ixtahuacán',
		'Santa Clara La Laguna', 'Concepción', 'San Andrés Semetabaj', 'Panajachel', 'Santa Catarina Palopó', 'San Antonio Palopó',
		'San Lucas Tolimán', 'Santa Cruz La Laguna', 'San Pablo La Laguna', 'San Marcos La Laguna', 'San Juan La Laguna', 'San Pedro La Laguna',
		'Santiago Atitlán'],
	'Totonicapán': ['Totonicapán', 'San Cristóbal Totonicapán', 'San Francisco El Alto', 'San Andrés Xecul', 'Momostenango',
		'Santa María Chiquimula', 'Santa Lucía La Reforma', 'San Bartolo'],
	Quetzaltenango: ['Quetzaltenango', 'Salcajá', 'Olintepeque', 'San Carlos Sija', 'Sibilia', 'Cabricán', 'Cajolá', 'San Miguel Sigüilá',
		'San Juan Ostuncalco', 'San Mateo', 'Concepción Chiquirichapa', 'San Martín Sacatepéquez', 'Almolonga', 'Cantel', 'Huitán', 'Zunil',
		'Colomba Costa Cuca', 'San Francisco La Unión', 'El Palmar', 'Coatepeque', 'Génova', 'Flores Costa Cuca', 'La Esperanza',
		'Palestina de Los Altos'],
	'Suchitepéquez': ['Mazatenango', 'Cuyotenango', 'San Francisco Zapotitlán', 'San Bernardino', 'San José El Ídolo',
		'Santo Domingo Suchitepéquez', 'San Lorenzo', 'Samayac', 'San Pablo Jocopilas', 'San Antonio Suchitepéquez', 'San Miguel Panán',
		'San Gabriel', 'Chicacao', 'Patulul', 'Santa Bárbara', 'San Juan Bautista', 'Santo Tomás La Unión', 'Zunilito', 'Pueblo Nuevo',
		'Río Bravo', 'San José La Máquina'],
	Retalhuleu: ['Retalhuleu', 'San Sebastián', 'Santa Cruz Muluá', 'San Martín Zapotitlán', 'San Felipe', 'San Andrés Villa Seca', 'Champerico',
		'Nuevo San Carlos', 'El Asintal'],
	'San Marcos': ['San Marcos', 'San Pedro Sacatepéquez', 'San Antonio Sacatepéquez', 'Comitancillo', 'San Miguel Ixtahuacán',
		'Concepción Tutuapa', 'Tacaná', 'Sibinal', 'Tajumulco', 'Tejutla', 'San Rafael Pie de la Cuesta', 'Nuevo Progreso', 'El Tumbador',
		'El Rodeo', 'Malacatán', 'Catarina', 'Ayutla', 'Ocós', 'San Pablo', 'El Quetzal', 'La Reforma', 'Pajapita', 'Ixchiguán',
		'San José Ojetenam', 'San Cristóbal Cucho', 'Sipacapa', 'Esquipulas Palo Gordo', 'Río Blanco', 'San Lorenzo', 'La Blanca'],
	Huehuetenango: ['Huehuetenango', 'Chiantla', 'Malacatancito', 'Cuilco', 'Nentón', 'San Pedro Necta', 'Jacaltenango', 'San Pedro Soloma',
		'San Ildefonso Ixtahuacán', 'Santa Bárbara', 'La Libertad', 'La Democracia', 'San Miguel Acatán', 'San Rafael La Independencia',
		'Todos Santos Cuchumatán', 'San Juan Atitán', 'Santa Eulalia', 'San Mateo Ixtatán', 'Colotenango', 'San Sebastián Huehuetenango',
		'Tectitán', 'Concepción Huista', 'San Juan Ixcoy', 'San Antonio Huista', 'San Sebastián Coatán', 'Santa Cruz Barillas', 'Aguacatán',
		'San Rafael Petzal', 'San Gaspar Ixchil', 'Santiago Chimaltenango', 'Santa Ana Huista', 'Unión Cantinil', 'Petatán'],
	'Quiché': ['Santa Cruz del Quiché', 'Chiché', 'Chinique', 'Zacualpa', 'Chajul', 'Chichicastenango', 'Patzité', 'San Antonio Ilotenango',
		'San Pedro Jocopilas', 'Cunén', 'San Juan Cotzal', 'Joyabaj', 'Nebaj', 'San Andrés Sajcabajá', 'Uspantán', 'Sacapulas',
		'San Bartolomé Jocotenango', 'Canillá', 'Chicamán', 'Ixcán', 'Pachalum'],
	'Baja Verapaz': ['Salamá', 'San Miguel Chicaj', 'Rabinal', 'Cubulco', 'Granados', 'Santa Cruz El Chol', 'San Jerónimo', 'Purulhá'],
	'Alta Verapaz': ['Cobán', 'Santa Cruz Verapaz', 'San Cristóbal Verapaz', 'Tactic', 'Tamahú', 'Tucurú', 'Panzós', 'Senahú', 'San Pedro Carchá',
		'San Juan Chamelco', 'Lanquín', 'Santa María Cahabón', 'Chisec', 'Chahal', 'Fray Bartolomé de las Casas', 'Santa Catalina La Tinta',
		'Raxruhá'],
	'Petén': ['Flores', 'San José', 'San Benito', 'San Andrés', 'La Libertad', 'San Francisco', 'Santa Ana', 'Dolores', 'San Luis', 'Sayaxché',
		'Melchor de Mencos', 'Poptún', 'Las Cruces', 'El Chal'],
	Izabal: ['Puerto Barrios', 'Livingston', 'El Estor', 'Morales', 'Los Amates'],
	Zacapa: ['Zacapa', 'Estanzuela', 'Río Hondo', 'Gualán', 'Teculután', 'Usumatlán', 'Cabañas', 'San Diego', 'La Unión', 'Huité', 'San Jorge'],
	Chiquimula: ['Chiquimula', 'San José La Arada', 'San Juan Ermita', 'Jocotán', 'Camotán', 'Olopa', 'Esquipulas', 'Concepción Las Minas',
		'Quezaltepeque', 'San Jacinto', 'Ipala'],
	Jalapa: ['Jalapa', 'San Pedro Pinula', 'San Luis Jilotepeque', 'San Manuel Chaparrón', 'San Carlos Alzatate', 'Monjas', 'Mataquescuintla'],
	Jutiapa: ['Jutiapa', 'El Progreso', 'Santa Catarina Mita', 'Agua Blanca', 'Asunción Mita', 'Yupiltepeque', 'Atescatempa', 'Jerez',
		'El Adelanto', 'Zapotitlán', 'Comapa', 'Jalpatagua', 'Conguaco', 'Moyuta', 'Pasaco', 'San José Acatempa', 'Quesada']
};
export const DEPARTAMENTOS = Object.keys(MUNICIPIOS);

// La capital (municipio Guatemala) se divide en zonas: no existen la 20, la 22 ni la 23.
export const ZONAS_CAPITAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 24, 25].map((n) => `Zona ${n}`);
// Sectores que los portales de Guatemala usan como zona, en el departamento de Guatemala (cruzan varios municipios).
export const SECTORES = ['Carretera a El Salvador', 'Carretera a Muxbal', 'Carretera a Fraijanes', 'Carretera al Atlántico'];

export const sinTildes = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const clave = (s) => sinTildes(s).replace(/^(municipio|ciudad) de /, '');

// Otros nombres de un municipio (como se escribían antes o como se les dice): → [municipio oficial, departamento].
const OTROS_NOMBRES = {
	'ciudad de guatemala': ['Guatemala', 'Guatemala'], 'guatemala city': ['Guatemala', 'Guatemala'], 'ciudad capital': ['Guatemala', 'Guatemala'],
	antigua: ['Antigua Guatemala', 'Sacatepéquez'], 'la antigua guatemala': ['Antigua Guatemala', 'Sacatepéquez'],
	'san juan alotenango': ['Alotenango', 'Sacatepéquez'], xela: ['Quetzaltenango', 'Quetzaltenango'],
	'puerto san jose': ['San José', 'Escuintla'], 'puerto de san jose': ['San José', 'Escuintla'], 'puerto de iztapa': ['Iztapa', 'Escuintla'],
	tecpan: ['Tecpán Guatemala', 'Chimaltenango'], soloma: ['San Pedro Soloma', 'Huehuetenango'], barillas: ['Santa Cruz Barillas', 'Huehuetenango'],
	'santo tomas chichicastenango': ['Chichicastenango', 'Quiché'], 'santa cruz quiche': ['Santa Cruz del Quiché', 'Quiché'],
	cahabon: ['Santa María Cahabón', 'Alta Verapaz'], 'el chol': ['Santa Cruz El Chol', 'Baja Verapaz'], 'la tinta': ['Santa Catalina La Tinta', 'Alta Verapaz'],
	'cuilapa santa rosa': ['Cuilapa', 'Santa Rosa'], guastatoya: ['Guastatoya', 'El Progreso'], 'el progreso guastatoya': ['Guastatoya', 'El Progreso'],
	'san pedro yepocapa': ['San Pedro Yepocapa', 'Chimaltenango'], yepocapa: ['San Pedro Yepocapa', 'Chimaltenango']
};
// Lugares que no son municipio pero que el inventario usa como zona o ciudad (la tabla de antes): → departamento. Se
// buscan antes que los municipios en la zona: «Monterrico» o «Antigua Guatemala» escritos como zona mandan.
const LUGARES = {
	Guatemala: ['guatemala', 'ciudad de guatemala', 'guatemala city', 'mixco', 'villa nueva', 'villa canales', 'santa catarina pinula',
		'san jose pinula', 'fraijanes', 'san miguel petapa', 'amatitlan', 'chinautla', 'san juan sacatepequez', 'san pedro sacatepequez',
		'san pedro ayampuc', 'palencia', 'chuarrancho', 'san raymundo'],
	'Sacatepéquez': ['antigua', 'antigua guatemala', 'la antigua guatemala', 'jocotenango', 'ciudad vieja', 'san lucas sacatepequez',
		'santiago sacatepequez', 'sumpango', 'pastores', 'santa maria de jesus', 'san antonio aguas calientes', 'alotenango', 'san miguel duenas', 'sacatepequez'],
	'Santa Rosa': ['monterrico', 'taxisco', 'chiquimulilla', 'cuilapa', 'santa rosa', 'barberena'],
	Escuintla: ['escuintla', 'puerto san jose', 'san jose', 'iztapa', 'puerto de iztapa', 'el paredon', 'sipacate', 'palin'],
	'Sololá': ['solola', 'panajachel', 'san pedro la laguna', 'san marcos la laguna', 'santa cruz la laguna', 'san juan la laguna', 'santiago atitlan', 'lago de atitlan', 'atitlan'],
	'Petén': ['peten', 'flores', 'san benito', 'santa elena', 'tikal'],
	Izabal: ['izabal', 'rio dulce', 'livingston', 'puerto barrios', 'el estor'],
	Quetzaltenango: ['quetzaltenango', 'xela'],
	'Alta Verapaz': ['alta verapaz', 'coban', 'semuc champey', 'lanquin'],
	Chimaltenango: ['chimaltenango', 'tecpan', 'el tejar'],
	Retalhuleu: ['retalhuleu', 'champerico'],
	Huehuetenango: ['huehuetenango'],
	Zacapa: ['zacapa', 'estanzuela'],
	Jutiapa: ['jutiapa'],
	'El Progreso': ['el progreso', 'guastatoya', 'sanarate']
};
const LUGAR = new Map(Object.entries(LUGARES).flatMap(([dep, ls]) => ls.map((l) => [l, dep])));

// Nombre (sin tildes) → los municipios que se llaman así: hay nombres repetidos en dos departamentos (San José,
// La Libertad, San Pedro Sacatepéquez…), por eso la casa guarda también su departamento.
const POR_NOMBRE = new Map();
for (const [dep, ms] of Object.entries(MUNICIPIOS)) for (const m of ms) {
	const k = clave(m);
	if (!POR_NOMBRE.has(k)) POR_NOMBRE.set(k, []);
	POR_NOMBRE.get(k).push({ municipio: m, departamento: dep });
}
const depValido = (d) => DEPARTAMENTOS.find((x) => clave(x) === clave(d)) || '';

// El municipio oficial de un texto («antigua», «Ciudad de Guatemala», «San José» + Petén) o null si no es uno.
// Con un nombre repetido y sin departamento, el de la tabla de antes (San José → Escuintla) o el primero.
export function municipioDe(texto, departamento = '') {
	const k = clave(texto);
	if (!k) return null;
	const dep = depValido(departamento);
	const lista = POR_NOMBRE.get(k) || (OTROS_NOMBRES[k] ? [{ municipio: OTROS_NOMBRES[k][0], departamento: OTROS_NOMBRES[k][1] }] : []);
	if (!lista.length) return null;
	return lista.find((x) => x.departamento === dep) || lista.find((x) => x.departamento === LUGAR.get(k)) || lista[0];
}
export const esMunicipio = (municipio, departamento) => Boolean((MUNICIPIOS[departamento] || []).includes(municipio));
// Un nombre que tienen dos municipios (San José, La Libertad…): sin su departamento no se sabe cuál es.
export const nombreRepetido = (texto) => (POR_NOMBRE.get(clave(texto)) || []).length > 1;
// ¿Es el mismo municipio? «Ciudad de Guatemala» y «Guatemala, Guatemala» lo son: al pasar uno de antes al de la lista
// no se pierde la zona.
export function mismoMunicipio(a = {}, b = {}) {
	const ma = municipioDe(a.ciudad, a.departamento), mb = municipioDe(b.ciudad, b.departamento);
	if (ma && mb) return ma.municipio === mb.municipio && ma.departamento === mb.departamento;
	return clave(a.ciudad) === clave(b.ciudad);
}
// La ciudad capital: el municipio Guatemala (sin departamento guardado, se entiende el de Guatemala).
export const esCapital = (p = {}) => clave(p.ciudad) === 'guatemala' && (!p.departamento || p.departamento === 'Guatemala')
	|| ['ciudad de guatemala', 'guatemala city', 'ciudad capital'].includes(clave(p.ciudad));

// Departamento de una casa (Google: addressRegion; portales: provincia). Primero el que guardó la ficha; después la zona
// si es un lugar conocido (Monterrico), la ciudad en la tabla completa y, si la ciudad no dice nada, la zona como
// municipio. El nombre tiene que ser completo: «Colonia Las Flores» no es Flores (Petén). Si no se sabe, vacío.
export function departamentoDe(p = {}) {
	const guardado = depValido(p.departamento);
	if (guardado) return guardado;
	const porLugar = (t) => LUGAR.get(clave(t)) || '';
	return porLugar(p.zona) || porLugar(p.ciudad) || municipioDe(p.ciudad)?.departamento || municipioDe(p.zona)?.departamento || '';
}

// «Municipio, Departamento» para mostrar («Guatemala, Guatemala»: dice que es el municipio, no el departamento).
export const municipioTexto = (municipio, departamento) => (!municipio ? '' : departamento ? `${municipio}, ${departamento}` : municipio);

// Opciones del campo Municipio, agrupadas por departamento: [[departamento, [{ texto, valor }]]]. Lo guardado que no
// está en la tabla (un texto de antes) va primero, tal cual, para no perderlo.
export function opcionesMunicipio(guardado = {}) {
	const grupos = Object.entries(MUNICIPIOS).map(([dep, ms]) => [dep, ms.map((m) => ({ texto: municipioTexto(m, dep), valor: { ciudad: m, departamento: dep } }))]);
	const c = String(guardado.ciudad || '').trim();
	if (c && !esMunicipio(c, guardado.departamento)) grupos.unshift(['Guardado', [{ texto: c, valor: { ciudad: c, departamento: guardado.departamento || '' } }]]);
	return grupos;
}

const plural = (n) => `${n} ${n === 1 ? 'propiedad' : 'propiedades'}`;
// Las zonas del inventario en ese municipio, con cuántas casas: [[zona, n]] de la más usada a la menos.
export function zonasGuardadas(props = [], lugar = {}) {
	const capital = esCapital(lugar);
	const cuenta = new Map();
	for (const p of props) {
		const z = String(p.zona || '').trim().replace(/\s+/g, ' ');
		if (!z) continue;
		const mismo = capital ? esCapital(p) : clave(p.ciudad) === clave(lugar.ciudad) && (!lugar.departamento || !p.departamento || p.departamento === lugar.departamento);
		if (!mismo) continue;
		const k = sinTildes(z);
		const x = cuenta.get(k) || { z, n: 0 };
		x.n += 1;
		cuenta.set(k, x);
	}
	return [...cuenta.values()].sort((a, b) => b.n - a.n || a.z.localeCompare(b.z, 'es', { numeric: true })).map((x) => [x.z, x.n]);
}

// Opciones del campo Zona según el municipio: arriba las del inventario (con cuántas casas), después las zonas de la
// capital y los sectores del departamento de Guatemala. Lo guardado en esta casa siempre está.
export function opcionesZona(lugar = {}, props = []) {
	const usadas = zonasGuardadas(props, lugar);
	const ya = new Set(usadas.map(([z]) => sinTildes(z)));
	const actual = String(lugar.zona || '').trim();
	const grupos = [];
	if (actual && !ya.has(sinTildes(actual))) { grupos.push(['Guardada', [{ texto: actual }]]); ya.add(sinTildes(actual)); }
	if (usadas.length) grupos.push(['En tu inventario', usadas.map(([z, n]) => ({ texto: z, nota: plural(n) }))]);
	const fijas = [...(esCapital(lugar) ? ZONAS_CAPITAL : []), ...(departamentoDe(lugar) === 'Guatemala' && lugar.ciudad ? SECTORES : [])].filter((z) => !ya.has(sinTildes(z)));
	if (fijas.length) grupos.push([usadas.length ? 'Las demás' : '', fijas.map((z) => ({ texto: z }))]);
	return grupos;
}

// La zona es obligatoria donde el municipio se divide en zonas (la capital, Mixco y Villa Nueva); en otro municipio, la
// aldea o colonia es opcional. Lo usan la ficha, la casa nueva del socio y «Faltan» (pendientes-reglas.js).
export const pideZona = (lugar = {}) => esCapital(lugar)
	|| (['mixco', 'villa nueva'].includes(clave(lugar.ciudad)) && (!lugar.departamento || lugar.departamento === 'Guatemala'));

// Zonas de interés de un cliente: guardadas antes como texto («Zona 16, Carretera a El Salvador») o como lista.
export const zonasDeCliente = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\n]/)).map((z) => String(z).trim()).filter(Boolean);

// Opciones de «Zonas de interés»: zonas de la capital, sectores, las del inventario con su municipio y cada municipio
// entero, agrupados por departamento.
export function opcionesZonasInteres(props = []) {
	const deInventario = new Map();
	for (const p of props) {
		const z = String(p.zona || '').trim();
		if (!z || esCapital(p) || SECTORES.includes(z)) continue;
		const m = municipioDe(p.ciudad, p.departamento);
		const texto = m && clave(m.municipio) !== clave(z) ? `${z} · ${m.municipio}` : z;
		deInventario.set(sinTildes(texto), { texto, dep: m?.departamento || departamentoDe(p) || 'Otros' });
	}
	return Object.entries(MUNICIPIOS).map(([dep, ms]) => [dep, [
		...(dep === 'Guatemala' ? [...ZONAS_CAPITAL, ...SECTORES].map((z) => ({ texto: z })) : []),
		...[...deInventario.values()].filter((x) => x.dep === dep).map((x) => ({ texto: x.texto })),
		...ms.map((m) => ({ texto: m, nota: 'todo el municipio' }))
	]]);
}
