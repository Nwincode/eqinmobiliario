// Casas por noche publicadas sin la dirección exacta (properties/{id}/privado/llegada): sin ella no se confirma una
// reserva ni se marca «Pago recibido». Solo lee, con la cuenta de servicio de lectura (GOOGLE_SA_EMAIL/KEY).
//   node scripts/casas-sin-direccion.mjs
//   En el entorno local: node --import ./scripts/entorno/red-local.mjs scripts/casas-sin-direccion.mjs (desde la copia)
import { listar, leerPrivado, datosConfigurados } from '../netlify/lib/firestore.mjs';
import { faltaDireccion } from '../admin/js/reservas-calculo.js';

if (!datosConfigurados()) { console.error('Falta la cuenta de servicio (GOOGLE_SA_EMAIL y GOOGLE_SA_KEY).'); process.exit(1); }
const casas = (await listar('properties')).filter((p) => p.operacion === 'vacacional' && p.publicado === true);
const sin = [];
for (const p of casas) if (faltaDireccion(await leerPrivado(`properties/${p.id}/privado/llegada`).catch(() => null))) sin.push(p);
console.log(`${casas.length} casas por noche publicadas; ${sin.length} sin dirección exacta${sin.length ? ':' : '.'}`);
for (const p of sin) console.log(`  ${p.id} · ${p.titulo || ''}${p.codigo ? ` · ${p.codigo}` : ''}`);
