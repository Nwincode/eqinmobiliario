// Pruebas de lo puro del hilo (admin/js/hilo.js): qué foto del cliente ve el socio (estadoDeFoto), los eventos que salen
// del chat y sus mensajes (eventosDe) y lo que se guarda al citar.
import assert from 'node:assert/strict';
import { estadoDeFoto, eventosDe, citaDe, ESPERA_REVISION } from '../admin/js/hilo.js';

let n = 0;
const t = (nombre, fn) => { fn(); n++; console.log('✓', nombre); };
const ahora = Date.parse('2026-11-23T12:00:00Z');
const foto = { id: 'm1', tipo: 'foto', de: 'cliente', texto: 'https://x', createdAt: ahora - 60_000 };
const chat = { comprobanteMensaje: 'm1' };

t('sin IA: como siempre (el socio la ve; el equipo, «Sin revisar»)', () => {
	assert.deepEqual(estadoDeFoto(foto, { chat, ia: false, ahora }), { ver: true, marca: 'Sin revisar' });
});
t('con IA y sin veredicto todavía: «en revisión» para el socio', () => {
	const f = estadoDeFoto(foto, { chat, rv: { mensaje: 'm1', texto: '' }, ia: true, ahora });
	assert.equal(f.ver, false); assert.equal(f.enRevision, true);
});
t('la revisión tarda más de lo esperado o falló 3 veces: se ve como siempre (no se traba el pago)', () => {
	assert.equal(estadoDeFoto({ ...foto, createdAt: ahora - ESPERA_REVISION - 1 }, { chat, rv: null, ia: true, ahora }).ver, true);
	assert.equal(estadoDeFoto(foto, { chat, rv: { mensaje: 'm1', fallos: 3 }, ia: true, ahora }).ver, true);
});
t('comprobante sin contacto: el socio la ve', () => {
	assert.deepEqual(estadoDeFoto(foto, { chat, rv: { mensaje: 'm1', texto: 'El comprobante cuadra', oculta: false, fotos: { fm1: { oculta: false, motivo: '' } } }, ia: true, ahora }), { ver: true, marca: '' });
});
t('con un dato de contacto o sin ser comprobante: oculta, con su motivo para el equipo', () => {
	const f = estadoDeFoto(foto, { chat, rv: { mensaje: 'm1', texto: 'x', oculta: true, fotos: { fm1: { oculta: true, motivo: 'Posible dato de contacto' } } }, ia: true, ahora });
	assert.deepEqual(f, { ver: false, oculta: true, marca: 'Posible dato de contacto' });
});
t('«Mostrar al socio» del equipo manda sobre la revisión', () => {
	assert.equal(estadoDeFoto(foto, { chat: { ...chat, fotosVisibles: ['m1'] }, rv: { fotos: { fm1: { oculta: true } } }, ia: true, ahora }).ver, true);
});
t('una foto que no es el comprobante de la reserva y nadie revisó: oculta (la ve el equipo y decide)', () => {
	assert.equal(estadoDeFoto({ ...foto, id: 'otra' }, { chat, rv: null, ia: true, ahora }).ver, false);
	// Una de antes con su veredicto guardado sigue con él.
	assert.equal(estadoDeFoto({ ...foto, id: 'vieja' }, { chat, rv: { mensaje: 'm1', fotos: { fvieja: { oculta: false } } }, ia: true, ahora }).ver, true);
});
t('eventos: pidió, confirmó y datos de pago por el mensaje de pago; «No se dio» solo con estadoEn (uno de antes no inventa)', () => {
	const pago = { id: 'p', tipo: 'pago', de: 'socio', createdAt: ahora - 1000 };
	const ev = eventosDe({ createdAt: ahora - 5000, estado: 'no' }, [pago]).map((e) => e.clave);
	assert.deepEqual(ev, ['pidio', 'confirmo', 'datosPago']);
	assert.ok(eventosDe({ createdAt: ahora - 5000, estadoEn: { no: ahora } }, []).some((e) => e.clave === 'no'));
});
t('citar guarda solo el id y quién (el texto sale del mensaje citado)', () => {
	assert.deepEqual(citaDe({ id: 'm9', de: 'cliente', texto: 'Hola' }), { id: 'm9', de: 'cliente' });
});
console.log(`\n${n} pruebas del hilo pasan.`);
