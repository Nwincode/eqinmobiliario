// netlify/lib/ia-cliente.mjs simulado (scripts/simulado/cargador.mjs): la IA responde lo que diga S.ia(pedido) y
// guarda cada pedido en S.pedidosIA. Sin S.ia, falla (nadie llama a la IA de verdad desde una prueba).
import { S } from './base.mjs';
export const MODEL = 'modelo-de-prueba';
export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);
class APIError extends Error {}
export const Anthropic = { APIError, RateLimitError: class extends APIError {}, AuthenticationError: class extends APIError {}, APIConnectionTimeoutError: class extends APIError {} };
export const client = { beta: { messages: { create: async (pedido) => {
	(S.pedidosIA ||= []).push(pedido);
	if (!S.ia) throw new APIError('Sin IA simulada');
	const texto = await S.ia(pedido);
	return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof texto === 'string' ? texto : JSON.stringify(texto) }] };
} } } };
