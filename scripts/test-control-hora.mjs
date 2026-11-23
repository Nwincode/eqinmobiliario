// El control de cada hora (netlify/functions/solicitudes-sin-respuesta.mjs) con la base y el correo simulados
// (scripts/simulado/): sin listar todos los chats, igual reintenta los avisos pendientes de un chat viejo, encuentra los
// pagos reabiertos vencidos y lee el chat de cada confirmada sin pago por su id.
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); ok++; console.log('✓', nombre); };
const { default: control } = await import('../netlify/functions/solicitudes-sin-respuesta.mjs');

await t('a las 7: pago reabierto vencido y confirmada sin pago de chats viejos; el aviso pendiente de un chat viejo se reintenta', async () => {
	S.reloj = Date.parse('2026-11-25T07:10:00-06:00');
	const reabierto = 'ChatConPagoReabierto000001', sinPago = 'ChatConfirmadaSinPago00001', viejo = 'ChatViejoConAvisoPendiente1';
	poner(`chats/${reabierto}`, { codigo: 'EQ-REAB', nombre: 'Rita', estado: 'confirmada', llegada: '2026-11-21', salida: '2026-11-23', pagoReabierto: S.reloj - 5 * 86400000, vencePago: S.reloj - 3 * 86400000, moneda: 'USD', total: 300 });
	poner(`chats/${sinPago}`, { codigo: 'EQ-SINPAGO', nombre: 'Sol', estado: 'confirmada', leadId: 'l-sp', llegada: '2026-11-21', salida: '2026-11-23' });
	poner('reservas/l-sp', { estado: 'confirmada', leadId: 'l-sp', chat: sinPago, codigo: 'EQ-SINPAGO', llegada: '2026-11-21', salida: '2026-11-23', huesped: 'Sol', moneda: 'USD', alojamiento: 300,
		createdAt: new Date(Date.parse('2026-11-20T10:00:00-06:00')), comision: { monto: 40, vence: '2026-11-21', pagada: false }, revisadoAMano: ['Airbnb'] });
	poner(`chats/${viejo}`, { codigo: 'EQ-VIEJO', estado: 'pagada', llegada: '2026-10-01', salida: '2026-10-03', avisoPendiente: 'm1' });
	await control();
	const alerta = S.salida.find((c) => /^Reservas:/.test(c.asunto));
	assert.ok(alerta, S.salida.map((c) => c.asunto).join(' | '));
	assert.match(alerta.asunto, /1 sin pago marcado/);
	assert.match(alerta.asunto, /1 pago reabierto vencido/);
	assert.match(alerta.texto, /EQ-SINPAGO[\s\S]*Se confirmó sin leer Airbnb \(revisado a mano\)/);
	assert.match(alerta.texto, /EQ-REAB/);
	assert.notEqual(leer(`chats/${viejo}`).avisoPendiente, 'm1', 'el aviso pendiente del chat viejo se reintentó (y se quitó)');
});

await t('fuera de las 7 no se leen los pagos reabiertos ni las confirmadas sin pago', async () => {
	S.reloj = Date.parse('2026-11-25T12:10:00-06:00');
	poner('chats/ChatConPagoReabierto000001', { codigo: 'EQ-REAB', estado: 'confirmada', llegada: '2026-11-21', salida: '2026-11-23', pagoReabierto: S.reloj - 5 * 86400000, vencePago: S.reloj - 3 * 86400000 });
	await control();
	assert.ok(!S.salida.some((c) => /pago reabierto/.test(c.asunto)));
});

await t('con 3,500 reservas de otras casas: el recordatorio de comisiones de hoy y «No se dio» con fechas ocupadas igual salen (consultan por su campo)', async () => {
	S.reloj = Date.parse('2026-11-25T07:10:00-06:00');
	for (let i = 0; i < 3500; i++) poner(`reservas/a${String(i).padStart(5, '0')}`, { estado: 'confirmada', propertyId: `otra${i % 40}`, llegada: '2025-01-01', salida: '2025-01-03', comision: { monto: 10, vence: '2025-01-01', pagada: true } });
	poner('propietarios/s1', { nombre: 'Socia', email: 'socia@ejemplo.test' });
	poner('reservas/zz-hoy', { estado: 'confirmada', propertyId: 'c1', propietarioId: 's1', codigo: 'EQ-HOY', propertyTitulo: 'Casa', moneda: 'USD', llegada: '2026-11-25', salida: '2026-11-27', comision: { monto: 50, vence: '2026-11-25', pagada: false } });
	// «No se dio» y después esas fechas se anotaron a mano en la misma casa.
	poner('leads/l-no', { propertyId: 'c9', propietarioId: 's1', nombre: 'Nora', reserva: { codigo: 'EQ-NO', llegada: '2026-12-10', salida: '2026-12-12' }, solicitud: { estado: 'no', motivo: 'Fechas ocupadas' }, updatedAt: new Date(S.reloj - 3600000), createdAt: new Date(S.reloj - 86400000) });
	poner('properties/c9', { titulo: 'Casa 9', operacion: 'vacacional', vacacional: {} });
	poner('reservas/zz-mano', { estado: 'confirmada', propertyId: 'c9', llegada: '2026-12-10', salida: '2026-12-12' });
	await control();
	assert.ok(S.salida.some((c) => c.asunto === 'Comisiones de hoy: 1' && c.para.includes('socia@ejemplo.test')), S.salida.map((c) => c.asunto).join(' | '));
	// La misma cifra que antes (prefijo y miles), en el texto plano una línea por comisión.
	assert.match(S.salida.find((c) => c.asunto === 'Comisiones de hoy: 1').texto, /\nEQ-HOY · Casa · US\$ 50\n/);
	assert.ok(S.salida.some((c) => /cerrada\(s\) con fechas ocupadas/.test(c.asunto)), S.salida.map((c) => c.asunto).join(' | '));
});

await t('a las 2 h: «sin responder» no incluye la que confirma el equipo (el socio no puede; ya le llegó «Te toca confirmar»)', async () => {
	S.reloj = Date.parse('2026-11-25T12:10:00-06:00');
	const lead = (id, min) => poner(`leads/${id}`, { nombre: 'Ana', propertyId: 'c1', propertyTitulo: 'Casa', propietarioId: '', createdAt: new Date(S.reloj - min * 60000), reserva: { codigo: `EQ-${id.toUpperCase()}`, llegada: '2026-12-20', salida: '2026-12-23' } });
	lead('socio', 150); lead('equipo', 150);
	poner('chats/ChatDeLaDelSocio000000000001', { leadId: 'socio', codigo: 'EQ-SOCIO', salida: '2026-12-23', llegada: '2026-12-20' });
	poner('chats/ChatDeLaDelEquipo00000000001', { leadId: 'equipo', codigo: 'EQ-EQUIPO', salida: '2026-12-23', llegada: '2026-12-20', confirmaEquipo: true });
	await control();
	const alerta = S.salida.find((c) => /^Reservas:/.test(c.asunto));
	assert.ok(alerta);
	assert.match(alerta.texto, /EQ-SOCIO/);
	assert.doesNotMatch(alerta.texto, /EQ-EQUIPO/);
});

console.log(`${ok} pruebas del control de cada hora pasan.`);
