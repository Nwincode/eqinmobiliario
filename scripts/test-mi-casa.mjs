// Pruebas de admin/js/mi-casa.js: lo que el dueño cambia él solo de su casa por noche y cómo se deshace.
import assert from 'node:assert/strict';
import { revisarCambiosDueno, valoresDueno, paraDeshacer, fotoDeLaCasa, textoValor } from '../admin/js/mi-casa.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const B = 'eqinmobiliariobd.firebasestorage.app';
const url = (path, bucket = B) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=x`;
const f1 = { url: url('properties/c1/1-a.webp'), path: 'properties/c1/1-a.webp', ancho: 1600, alto: 1200, marca: true };
const f2 = { url: url('properties/c1/2-b.webp'), path: 'properties/c1/2-b.webp', ancho: 1600, alto: 1200 };
const casa = { titulo: 'Casa de playa', descripcion: 'Casa frente al mar con piscina privada.', amenidades: ['Piscina'], fotos: [f1, f2], habitaciones: 3, banos: 2,
	estado: 'disponible', vacacional: { camas: 4, checkIn: '15:00', deposito: 300, mascotas: 'si', reservadas: [{ desde: '2026-12-01', hasta: '2026-12-03' }] } };
const actual = valoresDueno({ casa, socio: { icalUrl: '' }, llegada: { direccion: 'Lote 4', mapa: '' } });
const revisar = (pedido) => revisarCambiosDueno({ casaId: 'c1', bucket: B, actual, pedido });

t('lee lo guardado con los nombres del formulario (y valores por omisión)', () => {
	assert.equal(actual.camas, 4);
	assert.equal(actual.checkOut, '11:00');
	assert.equal(actual.parqueos, 0);
	assert.equal(actual.direccion, 'Lote 4');
	assert.equal(actual.estado, 'disponible');
});

t('solo se escribe lo que cambió, en su documento y su ruta', () => {
	const r = revisar({ titulo: 'Casa de playa', descripcion: 'Casa frente al mar con piscina privada y rancho.', camas: 5, icalUrl: 'https://www.airbnb.com/calendar/ical/1.ics?s=x', direccion: 'Lote 5' });
	assert.deepEqual(r.escribir.casa, { descripcion: 'Casa frente al mar con piscina privada y rancho.', 'vacacional.camas': 5 });
	assert.deepEqual(r.escribir.socio, { icalUrl: 'https://www.airbnb.com/calendar/ical/1.ics?s=x' });
	assert.deepEqual(r.escribir.llegada, { direccion: 'Lote 5' });
	assert.deepEqual(r.cambios.map((c) => c.campo), ['descripcion', 'camas', 'icalUrl', 'direccion']);
	assert.equal(r.cambios[1].antes, 4);
});

t('lo que no está en la lista no se puede cambiar (precio, dueño, margen, noches reservadas, visible)', () => {
	for (const campo of ['precio', 'propietarioId', 'margen', 'reservadas', 'publicado', 'agentId', 'precioBase', 'en']) assert.throws(() => revisar({ [campo]: 1 }), /no se puede cambiar/);
});

t('cada dato con su revisión', () => {
	assert.throws(() => revisar({ titulo: 'x' }), /Título/);
	assert.throws(() => revisar({ banos: -1 }), /Baños/);
	assert.throws(() => revisar({ limpieza: 100 }), /no se puede cambiar/);
	assert.throws(() => revisar({ deposito: 99999 }), /Depósito/);
	for (const t of ['Escríbeme a rosa@correo.com', 'Reserva en www.micasa.gt', 'Mira [aquí](https://x.gt)', 'wa.me/50255551234', 'Más en micasa.com',
		// El mismo filtro del chat (V.tieneContacto): también teléfonos y números escritos con letras.
		'Escríbeme al WhatsApp 5512 3456 y te hago descuento', 'cinco cinco uno dos tres cuatro cinco seis', 'arroba gmail punto com']) assert.throws(() => revisar({ descripcion: `Casa frente al mar con piscina privada. ${t}` }), /sin teléfonos, correos, enlaces/);
	// Cada amenidad, igual.
	for (const a of ['www.micasa.com', 'WhatsApp +502 5512-3456', 'yo@gmail.com']) assert.throws(() => revisar({ amenidades: ['Piscina', a] }), /Amenidades: sin teléfonos/);
	// Lo de siempre pasa: horas, montos, kilómetros y coordenadas.
	assert.equal(revisar({ reglas: 'Silencio de 22:00 a 7:00. Depósito Q 1,500.00. Máximo 8 personas.' }).cambios.length, 1);
	assert.equal(revisar({ comoLlegar: 'En el Km 98.5, coordenadas 14.5586, -90.7295, a 2 km del pueblo.' }).cambios.length, 1);
	// Depósito con centavos: redondeo a centavos, sin errores de coma flotante.
	assert.equal(revisar({ deposito: 100.1 }).escribir.casa['vacacional.deposito'], 100.1);
	assert.equal(revisar({ deposito: '250.555' }).escribir.casa['vacacional.deposito'], 250.56);
	assert.throws(() => revisar({ checkIn: '25:00' }), /entrada/);
	assert.throws(() => revisar({ mascotas: 'tal vez' }), /Mascotas/);
	assert.throws(() => revisar({ estado: 'vendida' }), /En la página/);
	assert.equal(revisar({ banos: 2.5 }).escribir.casa.banos, 2.5);
	assert.equal(revisar({ banos: 2.3 }).escribir.casa.banos, 2.5);
});

t('calendarios: solo https y de su plataforma (el servidor los descarga)', () => {
	assert.throws(() => revisar({ icalUrl: 'http://www.airbnb.com/x.ics' }), /Airbnb/);
	assert.throws(() => revisar({ icalUrl: 'https://airbnb.com.atacante.net/x.ics' }), /Airbnb/);
	assert.throws(() => revisar({ icalBooking: 'https://169.254.169.254/latest' }), /Booking/);
	assert.equal(revisar({ icalBooking: 'https://admin.booking.com/hotel/ical.ics?t=1' }).escribir.socio.icalBooking, 'https://admin.booking.com/hotel/ical.ics?t=1');
	assert.equal(revisar({ icalUrl: '' }).cambios.length, 0);
});

t('mapa: enlace de Google Maps o dirección escrita; nada de código ni otros enlaces', () => {
	assert.equal(revisar({ mapa: 'https://maps.app.goo.gl/abc123' }).escribir.llegada.mapa, 'https://maps.app.goo.gl/abc123');
	assert.equal(revisar({ mapa: 'https://www.google.com/maps/place/@13.9,-90.4,17z' }).cambios.length, 1);
	assert.equal(revisar({ mapa: '13.9012, -90.4321' }).cambios.length, 1);
	assert.throws(() => revisar({ mapa: '<iframe src="https://evil.example"></iframe>' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'https://evil.example/maps' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'https://www.google.com/url?q=https://evil.example' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'javascript:alert(1)' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'src="https://evil.example/pay"' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'Lote 4 https://evil.example/pay' }), /Mapa/);
	assert.throws(() => revisar({ mapa: 'Lote 4 evil.example/pay' }), /Mapa/);
});

t('fotos: ordenar, quitar y agregar solo de la carpeta de la casa en nuestro almacenamiento', () => {
	const nueva = { url: url('properties/c1/3-c.webp'), path: 'properties/c1/3-c.webp', ancho: 1000, alto: 800, extra: 'x' };
	const r = revisar({ fotos: [f2, nueva] });
	assert.deepEqual(r.escribir.casa.fotos, [f2, { url: nueva.url, path: nueva.path, ancho: 1000, alto: 800 }]);
	// «sinMarca» de una foto nueva no se acepta (el panel la borraría junto con la foto).
	assert.equal(revisar({ fotos: [f1, { ...nueva, sinMarca: 'site/logo.png' }] }).escribir.casa.fotos[1].sinMarca, undefined);
	assert.throws(() => revisar({ fotos: [{ ...nueva, url: url('properties/c1/3-c.webp', 'atacante.firebasestorage.app') }] }), /no es de esta casa/);
	assert.throws(() => revisar({ fotos: [{ url: url('properties/otra/1.webp'), path: 'properties/otra/1.webp' }] }), /no es de esta casa/);
	assert.throws(() => revisar({ fotos: [{ url: 'https://evil.example/1.webp', path: 'properties/c1/9.webp' }] }), /no es de esta casa/);
	assert.throws(() => revisar({ fotos: [] }), /al menos una/);
	assert.throws(() => revisar({ fotos: [f1, f1] }), /repetida/);
	// Una que ya estaba se guarda como estaba (el panel no le puede cambiar la dirección).
	assert.deepEqual(revisar({ fotos: [{ ...f1, url: 'https://evil.example/x' }, f2] }).cambios.length, 0);
	assert.equal(fotoDeLaCasa({ url: url('properties/c1/../c2/a.webp'), path: 'properties/c1/../c2/a.webp' }, 'c1', B), false);
});

t('pausar: solo entre disponible y pausada; si el administrador la retiró, el dueño no la vuelve a poner', () => {
	assert.equal(revisar({ estado: 'pausada' }).escribir.casa.estado, 'pausada');
	const retirada = valoresDueno({ casa: { ...casa, estado: 'retirada' } });
	assert.throws(() => revisarCambiosDueno({ casaId: 'c1', bucket: B, actual: retirada, pedido: { estado: 'disponible' } }), /administrador/);
	const pausada = valoresDueno({ casa: { ...casa, estado: 'pausada' } });
	assert.throws(() => revisarCambiosDueno({ casaId: 'c1', bucket: B, actual: pausada, pedido: { estado: 'disponible' } }), /administrador/);
	assert.equal(revisarCambiosDueno({ casaId: 'c1', bucket: B, actual: pausada, pedido: { estado: 'disponible' }, pausaPropia: true }).escribir.casa.estado, 'disponible');
});

t('deshacer: solo lo que sigue como lo dejó el dueño; lo que alguien cambió después no se pisa', () => {
	const { cambios } = revisar({ camas: 6, titulo: 'Casa de playa linda', fotos: [f2] });
	const despues = { ...actual, camas: 6, titulo: 'Casa del administrador', fotos: [f2] };
	const d = paraDeshacer(cambios, despues);
	assert.deepEqual(d.escribir.casa, { 'vacacional.camas': 4, fotos: [f1, f2] });
	assert.deepEqual(d.hechos, ['camas', 'fotos']);
	assert.deepEqual(d.saltados, ['Título']);
	assert.deepEqual(paraDeshacer(cambios, despues, ['camas']).hechos, ['camas']);
});

t('textos cortos para el aviso', () => {
	assert.equal(textoValor('fotos', [f1, f2]), '2 fotos');
	assert.equal(textoValor('mascotas', 'no'), 'No se aceptan');
	assert.equal(textoValor('estado', 'pausada'), 'Pausada (no sale en la página)');
	assert.equal(textoValor('reglas', ''), '—');
});

console.log(`${ok} pruebas de mi-casa correctas`);
