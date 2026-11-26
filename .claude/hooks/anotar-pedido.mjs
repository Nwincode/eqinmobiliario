// Cada mensaje del usuario entra solo a docs/pedidos.md como «- [ ]». Claude lo marca al responder:
// «- [x]» hecho, «- [~]» falta o espera su sí (con la razón), «- [-]» no es para este proyecto.
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
let txt = '';
process.stdin.on('data', (d) => (txt += d)).on('end', () => {
	let prompt = '';
	try { prompt = JSON.parse(txt).prompt || ''; } catch { return; }
	const linea = prompt.replace(/\s+/g, ' ').trim();
	if (!linea || linea.startsWith('/') || linea.startsWith('<')) return; // comandos y avisos del sistema
	const archivo = `${process.env.CLAUDE_PROJECT_DIR || '.'}/docs/pedidos.md`;
	if (!existsSync(archivo)) writeFileSync(archivo, '# Pedidos del usuario\n\n`- [ ]` sin respuesta · `- [x]` hecho · `- [~]` falta o espera su sí · `- [-]` no es de este proyecto.\n\n');
	const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Guatemala' });
	appendFileSync(archivo, `- [ ] ${dia} «${linea.slice(0, 400)}${linea.length > 400 ? '…' : ''}»\n`);
});
