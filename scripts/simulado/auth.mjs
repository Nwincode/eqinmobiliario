// netlify/lib/auth.mjs simulado (scripts/simulado/cargador.mjs): quien llama es S.socio, S.staff o S.sesion.
import { S } from './base.mjs';
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const socioUser = async () => S.socio;
export const staffUser = async () => S.staff;
export const sesionDe = async () => S.sesion;
