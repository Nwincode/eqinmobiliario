// Pruebas del importador (admin/js/importar.js) con la plantilla que se le manda al socio
// (docs/plantilla-casas-por-noche.csv): que la lea tal cual, guardada desde Google Sheets o desde Excel en español,
// y que las fotos descargadas de Google Drive (.zip con carpetas) caigan en su casa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodificarCsv, parseCsv, filasComoObjetos, filaAPropiedad, agruparFotos } from '../admin/js/importar.js';
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

console.log(`${ok} pruebas del importador pasan.`);
