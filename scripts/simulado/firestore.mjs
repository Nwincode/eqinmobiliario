// netlify/lib/firestore.mjs simulado (scripts/simulado/cargador.mjs).
import { S, leer, hijos } from './base.mjs';
export const datosConfigurados = () => true;
export const SCOPE_DATOS = 'https://www.googleapis.com/auth/datastore';
export const leerPublico = async (ruta) => leer(ruta);
export const leerPrivado = async (ruta) => { if (S.lecturaFalla) throw new Error('Error 503 al leer'); return leer(ruta); };
export const listar = async (col) => hijos(col);
export const desde = async (col, campo, fecha) => hijos(col).filter((d) => d[campo] instanceof Date && d[campo] > fecha).sort((a, b) => a[campo] - b[campo]);
// Como el real: igualdad (texto) y un rango «desde» ordenado por el campo (texto o número).
const en = (d, campo) => campo.split('.').reduce((o, k) => o?.[k], d);
export const donde = async (col, campo, valor) => hijos(col).filter((d) => (typeof valor === 'boolean' ? en(d, campo) === valor : typeof en(d, campo) === 'string' && en(d, campo) === String(valor)));
export const consultar = async (col, campo, valor, { tope = 3000 } = {}) => hijos(col)
	.filter((d) => (typeof valor === 'number' ? typeof d[campo] === 'number' && d[campo] >= valor : typeof d[campo] === 'string' && d[campo] >= String(valor)))
	.sort((a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0)).slice(0, tope);
