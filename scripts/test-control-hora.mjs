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

console.log(`${ok} pruebas del control de cada hora pasan.`);
