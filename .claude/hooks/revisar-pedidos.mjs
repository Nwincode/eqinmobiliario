// No deja cerrar la respuesta mientras docs/pedidos.md tenga un pedido sin marcar («- [ ]»).
import { existsSync, readFileSync } from 'node:fs';
const archivo = `${process.env.CLAUDE_PROJECT_DIR || '.'}/docs/pedidos.md`;
const abiertos = existsSync(archivo) ? readFileSync(archivo, 'utf8').split('\n').filter((l) => l.startsWith('- [ ]')) : [];
if (abiertos.length) {
	console.log(JSON.stringify({ decision: 'block', reason: `Pedidos sin respuesta en docs/pedidos.md:\n${abiertos.join('\n')}\nHaz cada uno, o márcalo [x] hecho, [~] falta o espera su sí (con la razón), [-] no es de este proyecto; luego responde.` }));
}
