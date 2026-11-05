// Pruebas de los clientes interesados y eventos automáticos del portal (admin/js/portal-clientes.js): `npm run test:portal`.
import assert from 'node:assert/strict';
import { clientesInteresados, eventosAuto, canalDe, etapaPortal, MAX_CLIENTES, numerarClientes, combinarClientes } from '../admin/js/portal-clientes.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const ahora = Date.parse('2026-06-15T12:00:00Z');
const d = (s) => new Date(`${s}T12:00:00Z`);

const clientes = [
	{ id: 'zzz-secreto', nombre: 'Ana Pérez', telefono: '5555-1234', email: 'ana@x.gt', fuente: 'Encuentra24', etapa: 'oferta', interes: ['p1'], createdAt: d('2026-05-02') },
	{ id: 'aaa-secreto', nombre: 'Luis', telefono: '4444', etapa: 'contactado', interes: ['p1', 'p2'], createdAt: d('2026-04-10'), leadIds: ['l1'] },
	{ id: 'mmm', nombre: 'Rosa', fuente: 'me lo recomendó un amigo', etapa: 'visita', interes: ['p1'], createdAt: d('2026-05-20') },
	{ id: 'otro', nombre: 'Sin interés', etapa: 'nuevo', interes: ['p9'], createdAt: d('2026-01-01') },
	{ id: 'xq7', nombre: 'Pedro', fuente: 'WhatsApp', etapa: 'perdido', interes: ['p1'], createdAt: d('2026-06-01') }
];
const leads = [{ clienteId: 'aaa-secreto', propertyId: 'p1', origen: 'propiedad', campana: { utm_source: 'google', gclid: 'x' }, createdAt: d('2026-04-09') }];
const visitas = [
	{ clienteId: 'mmm', tipo: 'visita', fecha: d('2026-05-25'), hecha: true },
	{ clienteId: 'mmm', tipo: 'visita', fecha: d('2026-06-05'), hecha: false },
	{ clienteId: 'zzz-secreto', tipo: 'visita', fecha: d('2026-06-20'), hecha: false }
];
const actividades = [{ clienteId: 'zzz-secreto', tipo: 'nota', titulo: 'Etapa: Visita → Oferta', hechaEn: d('2026-06-10') }];
const lista = clientesInteresados({ propertyId: 'p1', clientes, leads, visitas, actividades, ahora });

t('solo los interesados en la propiedad, numerados por primer contacto', () => {
	assert.deepEqual(lista.map((c) => c.n), [1, 2, 3, 4]);
	assert.deepEqual(lista.map((c) => c.desde), ['2026-04-09', '2026-05-02', '2026-05-20', '2026-06-01']);
});
t('no sale ningún dato personal ni id', () => {
	const txt = JSON.stringify(lista);
	for (const x of ['secreto', 'Ana', 'Luis', 'Rosa', 'Pedro', '5555', '4444', '@', 'mmm', 'xq7', 'Encuentra24', 'amigo']) assert.ok(!txt.includes(x), x);
	assert.deepEqual(Object.keys(lista[0]).sort(), ['canal', 'desde', 'etapa', 'etapaFecha', 'n', 'ultimaVisita', 'visitaProxima', 'visitas']);
});
t('canal: anuncio por gclid, portal, referido, whatsapp', () => assert.deepEqual(lista.map((c) => c.canal), ['anuncio', 'portal', 'referido', 'whatsapp']));
t('etapas en palabras sencillas', () => assert.deepEqual(lista.map((c) => c.etapa), ['interesado', 'oferto', 'visito', 'perdido']));
t('visitas hechas y última fecha (pasadas cuentan aunque no estén marcadas)', () => {
	const rosa = lista[2];
	assert.equal(rosa.visitas, 2);
	assert.equal(rosa.ultimaVisita, '2026-06-05');
	assert.equal(lista[1].visitaProxima, true);
	assert.equal(lista[1].visitas, 0);
});
t('fecha de la oferta sale de la nota de etapa', () => assert.equal(lista[1].etapaFecha, '2026-06-10'));
t('numeración estable aunque cambie el orden de entrada', () => {
	const otra = clientesInteresados({ propertyId: 'p1', clientes: clientes.slice().reverse(), leads, visitas, actividades, ahora });
	assert.deepEqual(otra, lista);
});
t('máximo 30, los más recientes con su número real', () => {
	const muchos = Array.from({ length: 45 }, (_, i) => ({ id: `c${i}`, interes: ['p1'], createdAt: new Date(ahora - (45 - i) * 86400000) }));
	const r = clientesInteresados({ propertyId: 'p1', clientes: muchos, ahora });
	assert.equal(r.length, MAX_CLIENTES);
	assert.equal(r[0].n, 16);
	assert.equal(r[r.length - 1].n, 45);
});
t('canalDe y etapaPortal', () => {
	assert.equal(canalDe('Facebook Marketplace'), 'portal');
	assert.equal(canalDe('Instagram'), 'redes');
	assert.equal(canalDe('Google Ads'), 'anuncio');
	assert.equal(canalDe('Rótulo en la casa'), 'llamada');
	assert.equal(canalDe(''), '');
	assert.equal(etapaPortal({ etapa: 'visita' }, { visitasHechas: 1, reuniones: 1 }), 'negociando');
	assert.equal(etapaPortal({ etapa: 'cierre' }), 'cerro');
});
t('eventos automáticos sin repetir la bitácora', () => {
	const ev = eventosAuto({
		enMercadoDesde: '2026-03-01T15:00:00.000Z', enLinea: true,
		portales: [{ nombre: 'Encuentra24', desde: '2026-03-03' }, { nombre: 'Sin fecha', desde: '' }],
		historialPrecio: [{ precio: 200000, moneda: 'USD', fecha: '2026-03-01' }, { precio: 200000, moneda: 'USD', fecha: '2026-03-10' }, { precio: 189000, moneda: 'USD', fecha: '2026-05-01' }],
		visitasHechas: [d('2026-05-25'), d('2026-05-25'), d('2026-06-02')],
		ofertas: [d('2026-06-10')],
		manuales: [{ tipo: 'visita', fecha: '2026-06-02' }, { tipo: 'precio', fecha: '2026-05-01' }]
	});
	assert.deepEqual(ev.map((e) => [e.auto, e.fecha, e.veces || 1]), [
		['web', '2026-03-01', 1], ['portal', '2026-03-03', 1], ['visita', '2026-05-25', 2], ['oferta', '2026-06-10', 1]
	]);
	assert.equal(ev[1].portal, 'Encuentra24');
});
t('sin publicar no hay evento de publicación', () => assert.deepEqual(eventosAuto({ enMercadoDesde: '2026-03-01', enLinea: false }), []));
t('cambio de precio genera evento con el monto', () => {
	const ev = eventosAuto({ historialPrecio: [{ precio: 1000, moneda: 'USD', fecha: '2026-01-01' }, { precio: 900, moneda: 'USD', fecha: '2026-02-01' }] });
	assert.deepEqual(ev, [{ fecha: '2026-02-01', tipo: 'precio', auto: 'precio', precio: 900, moneda: 'USD' }]);
});
t('los números de cliente no cambian al llegar uno más antiguo', () => {
	const a = numerarClientes([{ id: 'x', desde: '2026-05-01' }, { id: 'y', desde: '2026-06-01' }]);
	const b = numerarClientes([{ id: 'z', desde: '2026-01-01' }, { id: 'x', desde: '2026-05-01' }, { id: 'y', desde: '2026-06-01' }], a.numeros);
	assert.deepEqual(b.lista.map((f) => f.n), [1, 2, 3]);
	assert.deepEqual([b.numeros.x, b.numeros.y, b.numeros.z], [1, 2, 3]);
	assert.ok(b.lista.every((f) => !('id' in f)));
});
t('el asesor conserva los clientes que no puede ver', () => {
	const ant = { otro: { canal: 'web', desde: '2026-01-01', etapa: 'interesado' }, mio: { canal: 'web', desde: '2026-02-01', etapa: 'interesado' } };
	const r = combinarClientes([], ant, new Set(['mio']));
	assert.deepEqual(r.map((f) => f.id), ['otro']);
	assert.equal(combinarClientes([], ant, null).length, 0);
});
console.log(`\n${ok} pruebas correctas.`);
