// El cliente de la IA (Anthropic) y su modelo: uno solo para todo el servidor (netlify/functions/ia.mjs y la revisión de
// comprobantes, netlify/lib/comprobantes.mjs). Requiere ANTHROPIC_API_KEY en Netlify.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';
export const client = new Anthropic({ timeout: 25_000, maxRetries: 0 });
export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);
export { Anthropic };
