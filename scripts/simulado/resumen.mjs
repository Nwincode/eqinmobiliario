// netlify/lib/resumen.mjs simulado (scripts/simulado/cargador.mjs): anota a quién iría el resumen.
import { S } from './base.mjs';
export async function enviarResumen(opciones = {}) { S.resumenes.push(opciones); return { enviados: [opciones.para || 'equipo'], total: 1 }; }
export async function datosResumen() { return { secciones: {}, asesores: [] }; }
