// Guardas del panel que viven en pantallas con Firebase (no se pueden correr en Node): se revisa que sigan en su lugar.
// Lo que sí se puede correr está en sus pruebas (test-funciones, test-reportes…); esto evita que un cambio las quite.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import '../js/calc-vacacional.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
const fuente = (f) => readFileSync(new URL(`../admin/js/${f}`, import.meta.url), 'utf8');

t('calendario del socio: un segundo toque sin días elegidos no guarda (sumarDias("") lanzaba «Invalid time value»)', () => {
	assert.throws(() => globalThis.EQVacacional.sumarDias('', 1));
	const s = fuente('views/mis-casas.js');
	assert.match(s, /function aplicar\(que, valor, cada = ''\) \{\n\t\tconst \{ desde, hasta \} = e;\n\t\tif \(!desde \|\| !hasta \|\| e\.guardando\) return;/);
	assert.match(s, /soltar\(\);\n\t\te\.guardando = true;\n\t\tcalendario\(\);/);
	assert.match(s, /if \(e\.pide !== pide\) return;/);
});

t('campana: si /api/mi-casa no responde, lo dice (no lo traga como «nada por atender»)', () => {
	const s = fuente('avisos.js');
	assert.doesNotMatch(s, /seguro\(cambiosDeDuenos\(\)\)/);
	assert.match(s, /fallas\.push\('los cambios de los dueños'\)/);
});

t('Clientes: borrar un cliente pone al día el resumen de los dueños', () => {
	assert.match(fuente('views/clientes.js'), /await deleteDoc\(ref\); refrescarPorCliente\(c\);/);
});

t('Clientes: cada lead se une en una transacción que lo vuelve a leer (dos pestañas no crean dos clientes)', () => {
	const s = fuente('crm.js');
	assert.match(s, /runTransaction\(db, async \(tx\) => \{\n\t\t\tconst ahora = await tx\.get\(refLead\);/);
	assert.match(s, /if \(ahora\.data\(\)\.clienteId\) return \{ salto: ahora\.data\(\)\.clienteId \};/);
	assert.doesNotMatch(s, /writeBatch/);
});

t('el panel publica por el servidor (sin no-cors) y dice el mismo tiempo en todas partes', () => {
	const s = fuente('session.js');
	assert.doesNotMatch(s, /no-cors/);
	assert.match(s, /fetch\('\/api\/publicar'/);
	assert.doesNotMatch(fuente('views/publish.js'), /1–2 minutos/);
});

t('el token de la sesión para «publicar al cerrar» (sendBeacon) vive solo en memoria: nunca en localStorage ni sessionStorage', () => {
	const s = fuente('session.js');
	assert.match(s, /^let autoToken = '';$/m);
	assert.match(s, /navigator\.sendBeacon\('\/api\/publicar', new Blob\(\[JSON\.stringify\(\{ token: autoToken/);
	const dir = new URL('../admin/js/', import.meta.url);
	const archivos = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.js'));
	for (const f of archivos) assert.doesNotMatch(fuente(f), /(localStorage|sessionStorage)\.setItem\([^)]*(token|Token|idToken)/, f);
});

t('comprobante del huésped: se prepara con la misma pieza que las fotos del panel (admin/js/imagen.js) antes de subirse', () => {
	const chat = readFileSync(new URL('../js/reserva-chat.js', import.meta.url), 'utf8');
	assert.match(chat, /window\.EQImagen\.procesarImagen\(f\)/);
	assert.match(chat, /body: p\.blob/);
	assert.match(fuente('form.js'), /import \{ procesarImagen as procesar \} from '\.\/imagen\.js';/);
	assert.doesNotMatch(fuente('form.js'), /createImageBitmap/, 'una sola pieza: form.js no tiene su propia copia');
	assert.match(readFileSync(new URL('./lib/assets.mjs', import.meta.url), 'utf8'), /'\.\/admin\/js\/imagen\.js', \['procesarImagen'\], 'EQImagen'/);
});

t('confirmar y lo que depende del día de llegada usan la hora del servidor, no la del dispositivo (un reloj adelantado no da por pasado el día de llegada)', () => {
	assert.match(fuente('ui.js'), /export async function ahoraServidor\(\)[\s\S]*headers\.get\('date'\)/);
	assert.match(fuente('reservas.js'), /const ahora = await ahoraServidor\(\);\n\tconst no = motivoParaNoConfirmar\(l, p, montos\?\.moneda \? montos : null, ahora\);/);
	const sol = fuente('views/solicitudes.js');
	assert.doesNotMatch(sol, /llegadaPasada\([^)]*\.llegada\)/, 'toda llegadaPasada de Solicitudes lleva la hora del servidor');
	assert.match(sol, /await ahoraServidor\(\);/);
});

console.log(`\n${ok} guardas del panel en su lugar.`);
