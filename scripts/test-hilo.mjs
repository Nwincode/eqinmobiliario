// Pruebas de lo puro del hilo (admin/js/hilo.js): qué foto del cliente ve el socio (estadoDeFoto), los eventos que salen
// del chat y sus mensajes (eventosDe) y lo que se guarda al citar.
import assert from 'node:assert/strict';
import { estadoDeFoto, fotosOcultas, fotoDe, eventosDe, citaDe, ESPERA_REVISION } from '../admin/js/hilo.js';
import { chatAbierto } from '../admin/js/reservas-calculo.js';

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
t('la revisión tarda más de lo esperado (sin fallos ni tope): se ve como siempre', () => {
	assert.equal(estadoDeFoto({ ...foto, createdAt: ahora - ESPERA_REVISION - 1 }, { chat, rv: null, ia: true, ahora }).ver, true);
});
t('ya no se va a revisar (falló 3 veces, o el chat llegó al tope de revisiones o de intentos): oculta, «Sin revisar» para el equipo', () => {
	const oculta = { ver: false, oculta: true, marca: 'Sin revisar' };
	assert.deepEqual(estadoDeFoto(foto, { chat, rv: { mensaje: 'm1', fallos: 3 }, ia: true, ahora }), oculta);
	assert.deepEqual(estadoDeFoto(foto, { chat, rv: { mensaje: 'm0', revisiones: 3 }, ia: true, ahora }), oculta);
	assert.deepEqual(estadoDeFoto(foto, { chat, rv: { mensaje: 'm0', intentos: 6 }, ia: true, ahora }), oculta);
	assert.deepEqual(estadoDeFoto({ ...foto, createdAt: ahora - ESPERA_REVISION - 1 }, { chat, rv: { mensaje: 'm0', revisiones: 3 }, ia: true, ahora }), oculta);
	// Con 1 fallo, pasados los 20 minutos: sigue «en revisión» (se reintenta), no se muestra por tiempo.
	assert.equal(estadoDeFoto({ ...foto, createdAt: ahora - ESPERA_REVISION - 1 }, { chat, rv: { mensaje: 'm1', fallos: 1 }, ia: true, ahora }).enRevision, true);
	// El último intento, en curso (apartada hace poco): «en revisión».
	assert.equal(estadoDeFoto({ ...foto, createdAt: ahora - ESPERA_REVISION - 1 }, { chat, rv: { mensaje: 'm1', intentos: 6, apartado: ahora - 60_000 }, ia: true, ahora }).enRevision, true);
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
t('sin IA, una foto con veredicto «oculta» sigue oculta (la IA se apagó después)', () => {
	assert.equal(estadoDeFoto(foto, { chat, rv: { fotos: { fm1: { oculta: true, motivo: 'Posible dato de contacto' } } }, ia: false, ahora }).ver, false);
});
t('fotosOcultas: las del cliente que el socio no ve, la más nueva primero, solo esperando el pago', () => {
	const c = { ...chat, estado: 'confirmada' };
	const rv = { fotos: { fm1: { oculta: true, motivo: 'Posible dato de contacto' }, fm2: { oculta: false } } };
	const fotos = [foto, { ...foto, id: 'm2' }, { ...foto, id: 'm3', createdAt: ahora - 30_000 }, { ...foto, id: 'm4', de: 'socio' }];
	assert.deepEqual(fotosOcultas(fotos, { chat: c, rv, ia: true, ahora }).map((x) => [x.m.id, x.marca]), [['m3', 'Sin revisar'], ['m1', 'Posible dato de contacto']]);
	assert.deepEqual(fotosOcultas(fotos, { chat: { ...c, fotosVisibles: ['m1', 'm3'] }, rv, ia: true, ahora }), []);
	assert.deepEqual(fotosOcultas(fotos, { chat: { ...c, estado: 'pagada' }, rv, ia: true, ahora }), []);
});
t('chatAbierto: ni cancelada ni «No se dio» esperan respuesta (Solicitudes ya no dice «Mensaje sin responder»)', () => {
	assert.equal(chatAbierto({ estado: 'cancelada', salida: '2099-01-01' }), false);
	assert.equal(chatAbierto({ estado: 'no', salida: '2099-01-01' }), false);
	assert.equal(chatAbierto({ estado: 'confirmada', salida: '2099-01-01' }), true);
	assert.equal(chatAbierto({ estado: '', salida: '2000-01-01' }), false);
	assert.equal(chatAbierto(null), false);
});
// fotoDe: un error que no es 403 (503, 429, sin red) no se vuelve a pedir en cada repintada.
{
	const real = globalThis.fetch;
	let pedidos = 0;
	globalThis.fetch = async () => { pedidos++; return new Response('{}', { status: 503 }); };
	const fotos = {}, T = 'TokenDeFotoLargoYAlAzar12345', m = { id: 'm1', texto: 'fotosChat/l1/1' }, chat = { token: T, leadId: 'l1' };
	let repintadas = 0;
	// Cada vez que llega, se vuelve a pintar (y a pedir la foto), como el hilo.
	const pintar = () => { repintadas++; fotoDe(fotos, chat, m, { alListo: pintar }); };
	fotoDe(fotos, chat, m, { alListo: pintar });
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(repintadas, 1);
	globalThis.fetch = real;
	assert.equal(pedidos, 1);
	assert.deepEqual(fotos['fotosChat/l1/1'], { fallo: true });
	n++; console.log('✓ fotoDe: un 503 se pide una sola vez (queda { fallo } hasta que quien llama la suelta)');
}
console.log(`\n${n} pruebas del hilo pasan.`);
