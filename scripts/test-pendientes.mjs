// Pruebas de las reglas de «Datos por completar» (admin/js/pendientes-reglas.js): `npm run test:pendientes`.
import assert from 'node:assert/strict';
import { revisar, incompletos } from '../admin/js/pendientes-reglas.js';

const campos = (tipo, d) => revisar(tipo, d).map((f) => f.campo);
let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

const casa = { titulo: 'Casa', precio: 100, ciudad: 'Antigua', descripcion: 'x', fotos: [{}], tipo: 'casa', m2Construccion: 90, habitaciones: 3, banos: 2, parqueos: 1 };
t('casa completa no pide nada', () => assert.deepEqual(campos('propiedades', casa), []));
t('casa sin cuartos ni fotos', () => assert.deepEqual(campos('propiedades', { ...casa, fotos: [], habitaciones: '', banos: null }), ['fotos', 'habitaciones', 'banos']));
t('precio 0 cuenta como faltante', () => assert.deepEqual(campos('propiedades', { ...casa, precio: 0 }), ['precio']));
t('zona solo en la capital y municipios cercanos', () => {
	assert.deepEqual(campos('propiedades', { ...casa, ciudad: 'Mixco' }), ['zona']);
	assert.deepEqual(campos('propiedades', { ...casa, ciudad: 'Antigua' }), []);
});
t('terreno acepta m² de terreno o de construcción', () => {
	const lote = { ...casa, tipo: 'terreno', m2Construccion: '', habitaciones: '', banos: '', parqueos: '' };
	assert.deepEqual(campos('propiedades', { ...lote, m2Terreno: 300 }), []);
	assert.deepEqual(campos('propiedades', lote), ['m2Terreno']);
});
t('propiedad retirada no se revisa', () => assert.deepEqual(campos('propiedades', { estado: 'retirada' }), []));
t('cliente necesita teléfono o correo', () => {
	assert.deepEqual(campos('clientes', { nombre: 'Ana' }), ['telefono']);
	assert.deepEqual(campos('clientes', { nombre: 'Ana', email: 'a@b.c' }), []);
	assert.deepEqual(campos('clientes', { etapa: 'perdido' }), []);
});
t('asesor con foto como objeto o texto', () => {
	const a = { nombre: 'Luis', whatsapp: '502', email: 'l@x.gt' };
	assert.deepEqual(campos('asesores', { ...a, foto: { url: 'u' } }), []);
	assert.deepEqual(campos('asesores', { ...a, foto: 'u' }), []);
	assert.deepEqual(campos('asesores', a), ['foto']);
	assert.deepEqual(campos('asesores', { activo: false }), []);
});
t('incompletos devuelve solo los que faltan', () => {
	const r = incompletos('propietarios', [{ id: '1', nombre: 'Ok', telefono: '1' }, { id: '2' }]);
	assert.deepEqual(r.map((x) => [x.id, x.nombre]), [['2', 'Propietario sin nombre']]);
});
console.log(`\n${ok} pruebas correctas.`);
