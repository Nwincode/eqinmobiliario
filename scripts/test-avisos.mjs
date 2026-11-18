// Pruebas de admin/js/avisos-reglas.js: qué avisos salen en la campana, en qué orden y cuándo se van.
import assert from 'node:assert/strict';
import { armarAvisos, clavesPorRevisar, claveListo, hace } from '../admin/js/avisos-reglas.js';

const AHORA = Date.parse('2026-11-17T12:00:00-06:00');
const H = 3600000, D = 24 * H;
let n = 0;
const prueba = (nombre, fn) => { fn(); n++; console.log(`ok · ${nombre}`); };

prueba('una solicitud sin responder avisa; con mensaje del cliente, un solo aviso', () => {
	const a = armarAvisos({ ahora: AHORA,
		solicitudes: [{ leadId: 'l1', codigo: 'EQ-1', nombre: 'Ana', casa: 'Casa Playa', creado: AHORA - H, estado: 'pendiente', alerta: '' }],
		mensajes: [{ codigo: 'EQ-1', nombre: 'Ana', casa: 'Casa Playa', fecha: AHORA - 10 * 60000 }] });
	assert.equal(a.length, 1);
	assert.equal(a[0].tipo, 'solicitud');
	assert.equal(a[0].href, '#/solicitudes/EQ-1');
	assert.match(a[0].detalle, /te escribió/);
	assert.equal(a[0].urgente, false);
});

prueba('sin responder a tiempo va primero y en rojo', () => {
	const a = armarAvisos({ ahora: AHORA,
		solicitudes: [{ codigo: 'EQ-2', nombre: 'Luis', creado: AHORA - 5 * H, estado: 'pendiente', alerta: 'tarde' }],
		mensajes: [{ codigo: 'EQ-9', nombre: 'Bea', fecha: AHORA - 60000 }] });
	assert.deepEqual(a.map((x) => x.tipo), ['solicitud', 'mensaje']);
	assert.equal(a[0].urgente, true);
	assert.match(a[0].detalle, /sin responder/);
});

prueba('confirmada, «No se dio» o cancelada sin alerta: no avisa', () => {
	const a = armarAvisos({ ahora: AHORA, solicitudes: ['confirmada', 'no', 'cancelada', 'vieja'].map((estado, i) => ({ codigo: `EQ-${i}`, estado, alerta: '', creado: AHORA })) });
	assert.equal(a.length, 0);
});

prueba('«No se dio» con fechas ocupadas avisa con «Listo»; marcado, se va', () => {
	const s = [{ leadId: 'l7', codigo: 'EQ-7', estado: 'no', alerta: 'bloqueada', creado: AHORA - D }];
	const a = armarAvisos({ ahora: AHORA, solicitudes: s });
	assert.equal(a[0].tipo, 'robo');
	assert.deepEqual(a[0].listo, { tipo: 'robo', objeto: 'l7', agentId: '' });
	assert.deepEqual(clavesPorRevisar({ solicitudes: s }), ['robo_l7']);
	assert.equal(armarAvisos({ ahora: AHORA, solicitudes: s, atendidos: new Set(['robo_l7']) }).length, 0);
});

prueba('ganancia de EQ atrasada (+72 h) y comprobante por revisar', () => {
	const a = armarAvisos({ ahora: AHORA,
		solicitudes: [{ codigo: 'EQ-3', estado: 'confirmada', alerta: 'mora', creado: AHORA - 9 * D }],
		comprobantes: [{ codigo: 'EQ-4', socio: 'Chalets', fecha: AHORA - H }] });
	assert.deepEqual(a.map((x) => x.tipo), ['mora', 'comprobante']);
	assert.ok(!a.some((x) => x.listo));
});

prueba('pedido de cambios del dueño: de los últimos 30 días, con su texto y «Listo»', () => {
	const c = [
		{ id: 'c1', propietarioId: 'p1', dueno: 'Carlos', casa: 'Casa Antigua', texto: 'Cambien la foto de la sala', fecha: AHORA - D, agentId: 'a1' },
		{ id: 'c2', propietarioId: 'p1', dueno: 'Carlos', texto: 'Viejo', fecha: AHORA - 40 * D, agentId: 'a1' }];
	const a = armarAvisos({ ahora: AHORA, comentarios: c });
	assert.equal(a.length, 1);
	assert.equal(a[0].href, '#/propietarios/p1');
	assert.match(a[0].detalle, /Casa Antigua: «Cambien la foto/);
	assert.equal(armarAvisos({ ahora: AHORA, comentarios: c, atendidos: new Set(['cambios_c1']) }).length, 0);
});

prueba('exclusiva: de 30 días antes a 30 después; renovada (otra fecha) vuelve a avisar', () => {
	const e = (dias, fin = '2026-12-01') => ({ casaId: 'casa-1', casa: 'Casa 1', dueno: 'Rosa', fin, dias, agentId: 'a1' });
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(31)] }).length, 0);
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(-31)] }).length, 0);
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(null)] }).length, 0);
	const [x] = armarAvisos({ ahora: AHORA, exclusivas: [e(14)] });
	assert.equal(x.titulo, 'La exclusiva vence en 14 días');
	assert.equal(x.href, '#/propiedades/casa-1');
	assert.equal(x.urgente, false);
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(5)] })[0].urgente, true);
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(-3)] })[0].titulo, 'La exclusiva venció hace 3 días');
	assert.equal(claveListo(x.listo), 'exclusiva_casa-1_2026-12-01');
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(14)], atendidos: new Set(['exclusiva_casa-1_2026-12-01']) }).length, 0);
	assert.equal(armarAvisos({ ahora: AHORA, exclusivas: [e(14, '2027-06-01')], atendidos: new Set(['exclusiva_casa-1_2026-12-01']) }).length, 1);
});

prueba('socio: su pago a EQ vencido', () => {
	const a = armarAvisos({ ahora: AHORA, comisiones: [{ codigo: 'EQ-5', casa: 'Chalet 3', nivel: 1, vence: '2026-11-15' }, { codigo: 'EQ-6', nivel: 3, vence: '2026-11-10' }] });
	assert.equal(a[0].titulo, 'Tu pago a EQ tiene más de 72 h de atraso');
	assert.equal(a[1].titulo, 'Tu pago a EQ ya venció');
});

prueba('solo se buscan los «Listo» que pueden salir', () => {
	const k = clavesPorRevisar({ ahora: AHORA,
		comentarios: [{ id: 'nuevo', fecha: AHORA - D }, { id: 'viejo', fecha: AHORA - 90 * D }],
		exclusivas: [{ casaId: 'c1', fin: '2026-12-01', dias: 14 }, { casaId: 'c2', fin: '2025-01-01', dias: -400 }] });
	assert.deepEqual(k, ['cambios_nuevo', 'exclusiva_c1_2026-12-01']);
});

prueba('«hace…» en minutos, horas y días', () => {
	assert.equal(hace(AHORA - 5 * 60000, AHORA), 'hace 5 min');
	assert.equal(hace(AHORA - 3 * H, AHORA), 'hace 3 h');
	assert.equal(hace(AHORA - 2 * D, AHORA), 'hace 2 d');
});

console.log(`\n${n} pruebas de avisos bien.`);
