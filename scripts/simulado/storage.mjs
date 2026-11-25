// netlify/lib/storage.mjs simulado (scripts/simulado/cargador.mjs): los archivos en S.archivos (ruta → { tipo, datos, llave }).
import { S } from './base.mjs';

const archivos = () => (S.archivos ||= new Map());
export const BUCKET = 'eqinmobiliariobd.firebasestorage.app';
const no = () => Object.assign(new Error('Storage 404'), { status: 404 });
export async function bajar(ruta) { const a = archivos().get(ruta); if (!a) throw no(); return { tipo: a.tipo, datos: Buffer.from(a.datos) }; }
export async function listar(prefijo) { return [...archivos()].filter(([k]) => k.startsWith(prefijo)).map(([ruta, a]) => ({ ruta, tipo: a.tipo, llave: a.llave || '' })); }
export async function copiar(de, a) { const x = archivos().get(de); if (!x) throw no(); archivos().set(a, { tipo: x.tipo, datos: x.datos, llave: '' }); }
export async function borrar(ruta) { archivos().delete(ruta); }
export async function quitarLlave(ruta) { const a = archivos().get(ruta); if (!a) throw no(); a.llave = ''; }
