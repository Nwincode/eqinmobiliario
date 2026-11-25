// La migración de los chats a la forma nueva desde la terminal: la misma pieza que el botón «Pasar datos al formato
// nuevo» de Publicar (netlify/lib/migrar-chats.mjs, que dice qué cambia). En producción se usa el botón: no hace falta
// tener las llaves de las cuentas de servicio en esta máquina.
//   node scripts/migrar-chats.mjs              dice qué cambiaría, sin escribir nada
//   node scripts/migrar-chats.mjs --aplicar    lo hace
// En el entorno local: node --import ./scripts/entorno/red-local.mjs scripts/migrar-chats.mjs [--aplicar]
import { migrarChats } from '../netlify/lib/migrar-chats.mjs';

migrarChats({ aplicar: process.argv.includes('--aplicar') }).catch((err) => { console.error(err.message); process.exit(1); });
