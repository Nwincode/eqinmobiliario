// Prueba de scripts/netlify-ignorar.sh en un repositorio de prueba: salta la publicación cuando solo cambian documentos
// o pruebas, y no cuando cambia un logo de docs/marca/logo/ (el sitio lo sirve) o el código.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'netlify-ignorar.sh');
const dir = mkdtempSync(path.join(tmpdir(), 'eq-ignorar-'));
const git = (...a) => execFileSync('git', ['-c', 'user.email=prueba@ejemplo.test', '-c', 'user.name=Prueba', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' }).trim();
const escribir = (f, t) => { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), t); };
const commit = (f, t) => { escribir(f, t); git('add', '-A'); git('commit', '-qm', f); return git('rev-parse', 'HEAD'); };
// 0 = no se genera; 1 = se genera.
const salida = (antes, ahora, extra = {}) => spawnSync('sh', [SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, CONTEXT: 'production', CACHED_COMMIT_REF: antes, COMMIT_REF: ahora, ...extra } }).status;

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('✓', nombre); };
try {
	git('init', '-q');
	const base = commit('admin/js/app.js', 'uno');
	const soloDocs = commit('docs/mapa-del-sistema.md', 'texto');
	const logo = commit('docs/marca/logo/icono-blanco.svg', '<svg/>');
	const codigo = commit('admin/js/app.js', 'dos');

	t('solo documentos: no se genera', () => assert.equal(salida(base, soloDocs), 0));
	t('un logo de docs/marca/logo: sí se genera (marca de agua, logo del panel, portada del PDF)', () => assert.equal(salida(soloDocs, logo), 1));
	t('código: sí se genera', () => assert.equal(salida(logo, codigo), 1));
	t('«Publicar» del panel (gancho): siempre se genera', () => assert.equal(salida(base, soloDocs, { INCOMING_HOOK_URL: 'x' }), 1));
	t('vista previa: nunca', () => assert.equal(salida(base, codigo, { CONTEXT: 'deploy-preview' }), 0));
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${ok} pruebas de netlify-ignorar pasan.`);
