// netlify/lib/correo.mjs simulado (scripts/simulado/cargador.mjs): los correos quedan en S.salida.
import { S } from './base.mjs';
export const SITE_URL = 'https://eqinmobiliario.gt';
export const servicioCorreo = () => 'zeptomail';
export const destinatariosEquipo = () => ['equipo@ejemplo.test'];
export const correoConfigurado = () => true;
export const esc = (v) => String(v ?? '');
export const plantilla = async ({ titulo }) => `<h1>${titulo}</h1>`;
export const boton = () => ''; export const datos = () => ''; export const pasos = () => '';
export async function enviarCorreo({ para, asunto, texto = '' }) { if (S.correoFalla) throw new Error('El correo falló'); S.salida.push({ para: [].concat(para).join(','), asunto, texto }); }
