// netlify/lib/firestore.mjs simulado (scripts/simulado/cargador.mjs).
import { S, leer, hijos } from './base.mjs';
export const datosConfigurados = () => true;
export const leerPublico = async (ruta) => leer(ruta);
export const leerPrivado = async (ruta) => { if (S.lecturaFalla) throw new Error('Error 503 al leer'); return leer(ruta); };
export const listar = async (col) => hijos(col);
export const desde = async (col, campo, fecha) => hijos(col).filter((d) => d[campo] instanceof Date && d[campo] > fecha).sort((a, b) => a[campo] - b[campo]);
