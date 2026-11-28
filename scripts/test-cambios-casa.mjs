// Pruebas de admin/js/cambios-casa.js: guardar solo lo que cambió la ficha y el historial de estado y de precio.
import assert from 'node:assert/strict';
import { cambiosEntre, aplicarCambios, historialCon, huespedesMaxDe, guardarSobre, historialSinNombres } from '../admin/js/cambios-casa.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const quien = { fecha: 'AHORA', por: 'Ana', porUid: 'u1' };

t('lo que la ficha no tocó queda como lo dejó otra pantalla (noches reservadas, precio y bloqueos del dueño, difusión)', () => {
	const alAbrir = { titulo: 'Casa', estado: 'disponible', vacacional: { nochesMin: 2, bloqueos: [], reservadas: [] } };
	const mio = { titulo: 'Casa linda', estado: 'disponible', vacacional: { nochesMin: 2, bloqueos: [], reservadas: [] } };
	const ahora = {
		titulo: 'Casa', estado: 'disponible', difusion: { instagram: { estado: 'publicada' } },
		vacacional: { nochesMin: 2, bloqueos: [{ desde: '2026-12-01', hasta: '2026-12-03' }], reservadas: [{ desde: '2026-12-20', hasta: '2026-12-24' }], minimos: [{ desde: '2026-12-24', hasta: '2026-12-31', noches: 3 }] }
	};
	const c = cambiosEntre(alAbrir, mio);
	assert.deepEqual(c, { titulo: 'Casa linda' });
	const g = aplicarCambios(ahora, c);
	assert.equal(g.titulo, 'Casa linda');
	assert.deepEqual(g.vacacional.reservadas, ahora.vacacional.reservadas);
	assert.deepEqual(g.vacacional.bloqueos, ahora.vacacional.bloqueos);
	assert.deepEqual(g.vacacional.minimos, ahora.vacacional.minimos);
	assert.deepEqual(g.difusion, ahora.difusion);
});

t('lo que sí cambió la ficha dentro de «vacacional» va campo por campo; lo quitado se borra', () => {
	const c = cambiosEntre({ vacacional: { limpieza: 10, camas: 2 }, vip: true }, { vacacional: { limpieza: 25, camas: 2 } });
	assert.deepEqual(c, { vacacional: { limpieza: 25 }, vip: undefined });
	const g = aplicarCambios({ vip: true, vacacional: { limpieza: 10, camas: 2, reservadas: [1] } }, c);
	assert.deepEqual(g, { vacacional: { limpieza: 25, camas: 2, reservadas: [1] } });
	assert.ok(!('vip' in g));
});

t('pantallas simples (asesor, reseña, página): una pestaña vieja guarda solo lo suyo, sin borrar lo que otra guardó', () => {
	const alAbrir = { nombre: 'Ana', cargo: 'Asesora', bio: 'Vieja', en: { cargo: 'Advisor', bio: '' }, seo: { titulo: 'a' }, orden: 1 };
	// Mientras tanto, otra pestaña cambió la bio, la bio en inglés y el título SEO, y agregó la foto.
	const ahora = { nombre: 'Ana', cargo: 'Asesora', bio: 'Nueva', foto: '/f.webp', en: { cargo: 'Advisor', bio: 'New' }, seo: { titulo: 'b' }, orden: 1 };
	// La pestaña vieja solo cambió el cargo, el cargo en inglés y quitó el orden.
	const mio = { nombre: 'Ana', cargo: 'Gerente', bio: 'Vieja', en: { cargo: 'Manager', bio: '' }, seo: { titulo: 'a' } };
	assert.deepEqual(guardarSobre(ahora, alAbrir, mio), { nombre: 'Ana', cargo: 'Gerente', bio: 'Nueva', foto: '/f.webp', en: { cargo: 'Manager', bio: 'New' }, seo: { titulo: 'b' } });
	// Sin cambios propios, lo guardado queda tal cual (también fechas que el formulario copió como objeto).
	const fecha = { seconds: 1, nanoseconds: 0 };
	assert.deepEqual(guardarSobre({ ...ahora, createdAt: fecha }, { ...alAbrir, createdAt: fecha }, { ...alAbrir, createdAt: fecha }), { ...ahora, createdAt: fecha });
});

t('el orden de las llaves no cuenta como cambio', () => {
	assert.deepEqual(cambiosEntre({ seo: { titulo: 'a', descripcion: 'b' } }, { seo: { descripcion: 'b', titulo: 'a' } }), {});
});

t('historial: cambia el estado → una entrada nueva sobre lo guardado AHORA (no sobre lo que se leyó al abrir)', () => {
	const ahora = { estado: 'disponible', historialEstado: [{ estado: 'disponible' }, { estado: 'reservada' }, { estado: 'disponible' }] };
	const h = historialCon(ahora, { estado: 'vendida' }, quien);
	assert.equal(h.cambioEstado, true);
	assert.equal(h.historialEstado.length, 4);
	// Sin el nombre (la casa publicada la lee cualquiera), aunque se lo pasen: solo el uid.
	assert.deepEqual(h.historialEstado.at(-1), { estado: 'vendida', fecha: 'AHORA', porUid: 'u1' });
	assert.equal(ahora.historialEstado.length, 3, 'no cambia lo de antes');
	assert.equal(historialCon(ahora, { estado: 'disponible' }, quien).cambioEstado, false);
});

t('historial de precio: solo si cambia precio o moneda; el primero de una casa vieja entra con su fecha de alta', () => {
	const vieja = { precio: 100000, moneda: 'USD', createdAt: 'ALTA' };
	assert.deepEqual(historialCon(vieja, { precio: 90000, moneda: 'USD' }, quien).historialPrecio,
		[{ precio: 100000, moneda: 'USD', fecha: 'ALTA' }, { precio: 90000, moneda: 'USD', fecha: 'AHORA' }]);
	assert.deepEqual(historialCon(vieja, { precio: 100000, moneda: 'USD' }, quien).historialPrecio, [{ precio: 100000, moneda: 'USD', fecha: 'ALTA' }]);
	const conHist = { precio: 90000, moneda: 'USD', historialPrecio: [{ precio: 90000, moneda: 'USD', fecha: 'X' }] };
	assert.equal(historialCon(conHist, { precio: 90000, moneda: 'USD' }, quien).historialPrecio.length, 1);
	assert.equal(historialCon(conHist, { precio: 90000, moneda: 'GTQ' }, quien).historialPrecio.length, 2);
	assert.equal(conHist.historialPrecio.length, 1, 'no cambia lo de antes');
});

t('historial sin nombres: quita `por` de cada entrada (lo demás igual); sin ninguno, null', () => {
	const f = new Date(0);
	assert.deepEqual(historialSinNombres([{ estado: 'disponible', fecha: f, por: 'Ana', porUid: 'u1' }, { estado: 'vendida', fecha: 'X', porUid: 'u2' }]),
		[{ estado: 'disponible', fecha: f, porUid: 'u1' }, { estado: 'vendida', fecha: 'X', porUid: 'u2' }]);
	assert.equal(historialSinNombres([{ estado: 'disponible', porUid: 'u1' }]), null);
	assert.equal(historialSinNombres(undefined), null);
	assert.equal(historialSinNombres([null, { estado: 'x', por: '' }]).length, 2);
});

t('una propiedad que nace: su estado y su primer precio', () => {
	const h = historialCon(null, { estado: 'disponible', precio: 500, moneda: 'GTQ' }, quien);
	assert.equal(h.historialEstado.length, 1);
	assert.deepEqual(h.historialPrecio, [{ precio: 500, moneda: 'GTQ', fecha: 'AHORA' }]);
	assert.deepEqual(historialCon(null, { estado: 'disponible' }, quien).historialPrecio, []);
});

t('huéspedes máximos: al menos 1 y entero, igual en la ficha y en «Mis propiedades»', () => {
	assert.equal(huespedesMaxDe(''), 1);
	assert.equal(huespedesMaxDe(0), 1);
	assert.equal(huespedesMaxDe(80), 50, 'tope de 50 (el mismo de las reglas)');
	assert.equal(huespedesMaxDe('6.7'), 6);
	assert.equal(huespedesMaxDe(null), 1);
});

console.log(`${ok} pruebas de cambios-casa pasan.`);
