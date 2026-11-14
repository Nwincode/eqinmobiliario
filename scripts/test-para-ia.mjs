// Pruebas de admin/js/para-ia.js: lo que sale a la IA o al traductor lleva solo lo público.
import assert from 'node:assert/strict';
import { paraIA, propiedadParaIA, leadParaIA, sinContacto } from '../admin/js/para-ia.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };

const sucia = {
	id: 'c1', slug: 'casa-lago', titulo: 'Casa en el lago', descripcion: 'Linda', operacion: 'vacacional', tipo: 'casa',
	estado: 'disponible', precio: 120, moneda: 'USD', zona: '', ciudad: 'Panajachel', direccion: 'Calle Real 12', mapa: '<iframe src="https://maps…">',
	amenidades: ['Piscina'], propietarioId: 'p9', agentId: 'a1', createdBy: 'uid-1', updatedBy: 'uid-2', difusion: { instagram: { estado: 'publicada' } },
	historialEstado: [{ estado: 'disponible', por: 'Ana López', porUid: 'uid-1' }], historialPrecio: [{ precio: 100 }],
	socio: { precioBase: 100, margen: 20 }, acuerdo: { comisionPct: 5 }, fotos: [{ url: 'x' }], en: { titulo: 'Lake house' },
	vacacional: { base: 120, huespedesMax: 6, comoLlegar: 'Por la carretera', reglas: 'No fiestas', cancelacion: '', reservadas: [{ desde: '2026-12-01' }], bloqueos: [{ desde: '2026-12-05' }], minimos: [] },
	mantenimiento: 50
};

t('casa por noche: sin dirección ni mapa, sin dueño, asesor, uids, historial, difusión, socio ni acuerdo', () => {
	const d = propiedadParaIA(sucia);
	const texto = JSON.stringify(d);
	for (const x of ['Calle Real', 'maps', 'p9', 'uid-', 'Ana López', 'publicada', 'comisionPct', 'precioBase', 'reservadas', 'bloqueos', 'mantenimiento']) {
		assert.ok(!texto.includes(x), `no debe ir: ${x}`);
	}
	for (const k of ['propietarioId', 'agentId', 'historialEstado', 'historialPrecio', 'difusion', 'socio', 'acuerdo', 'fotos', 'en', 'createdBy']) assert.ok(!(k in d), k);
	assert.equal(d.id, 'c1', 'el id de la propiedad sí: con él vuelven los resultados');
	assert.equal(d.vacacional.comoLlegar, 'Por la carretera');
	assert.equal(d.vacacional.huespedesMax, 6);
});

t('venta: la dirección sí (es pública); VIP con precio oculto no manda el precio', () => {
	const v = propiedadParaIA({ ...sucia, operacion: 'venta', vip: true, vipLanding: { titular: 'Vive', ocultarPrecio: true, portada: 'x' }, precio: 900000 });
	assert.equal(v.direccion, 'Calle Real 12');
	assert.ok(!('precio' in v));
	assert.ok(!('vacacional' in v));
	assert.deepEqual(v.vipLanding, { titular: 'Vive', ocultarPrecio: true });
});

t('lead: primer nombre y lo que busca, sin teléfono ni correo (tampoco dentro del mensaje)', () => {
	const l = leadParaIA({ nombre: 'María José Pérez', telefono: '+502 5555 1234', email: 'maria@example.com', mensaje: 'Busco casa en zona 15, llámeme al 5555-1234 o maria@example.com. Llego el 2026-05-01.', notas: ['Su esposo: +1 (305) 555-0199'], estado: 'nuevo' });
	assert.equal(l.nombre, 'María');
	const texto = JSON.stringify(l);
	for (const x of ['5555', 'example.com', 'Pérez', '305']) assert.ok(!texto.includes(x), `no debe ir: ${x}`);
	assert.ok(l.mensaje.includes('zona 15') && l.mensaje.includes('2026-05-01'), 'la necesidad y las fechas se quedan');
});

t('sinContacto deja montos y fechas', () => {
	assert.equal(sinContacto('US$ 250,000 el 15/12/2026 a las 10:30'), 'US$ 250,000 el 15/12/2026 a las 10:30');
	assert.equal(sinContacto('hasta 1500000 quetzales'), 'hasta 1500000 quetzales');
	assert.equal(sinContacto('Q 2 500 000 de presupuesto'), 'Q 2 500 000 de presupuesto');
	assert.equal(sinContacto('mi cel 55551234'), 'mi cel [teléfono]');
});

t('paraIA limpia cada parte de una tarea (propiedad, inventario, lead y requerimientos)', () => {
	const d = paraIA({ texto: 'busco casa', propiedad: sucia, inventario: [sucia], lead: { nombre: 'Luis Gómez', email: 'l@x.com' }, requerimientos: [{ id: 'r1', cliente: 'Luis Gómez', telefono: '5555 1234', texto: 'casa zona 16' }] });
	assert.equal(d.texto, 'busco casa');
	assert.ok(!JSON.stringify(d).includes('Calle Real'));
	assert.ok(!JSON.stringify(d).includes('l@x.com'));
	assert.deepEqual(d.requerimientos[0], { id: 'r1', cliente: 'Luis', texto: 'casa zona 16', criterios: {}, estado: '' });
});

t('Un texto suelto al traductor (chat de Solicitudes) sale sin teléfono ni correo', () => {
	assert.equal(paraIA({ texto: 'escribime a ana@example.com o al 5555 1234' }).texto, 'escribime a [correo] o al [teléfono]');
});

console.log(`${ok} pruebas de para-ia pasan.`);
