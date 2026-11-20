// Guardas del panel que viven en pantallas con Firebase (no se pueden correr en Node): se revisa que sigan en su lugar.
// Lo que sí se puede correr está en sus pruebas (test-funciones, test-reportes…); esto evita que un cambio las quite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

console.log(`\n${ok} guardas del panel en su lugar.`);
