// netlify/lib/auth.mjs simulado (scripts/simulado/cargador.mjs): quien llama es S.socio, S.staff o S.sesion.
import { S } from './base.mjs';
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const socioUser = async () => S.socio;
export const staffUser = async () => S.staff;
export const sesionDe = async () => S.sesion;
// Quien llama con su users/{uid}: S.usuario (o el socio o el equipo de arriba con su rol).
export const usuario = async () => S.usuario || (S.socio ? { ...S.socio, rol: 'socio' } : S.staff ? { ...S.staff, rol: S.staff.admin ? 'admin' : 'asesor' } : null);
export { esSocioDelChat } from '../../netlify/lib/auth.mjs';
