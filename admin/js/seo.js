// Vista previa del resultado en Google y lista de verificación SEO para los editores.
import { h, slugify } from './ui.js';
import { siteConfig } from './firebase.js';

const SITE = (siteConfig.siteUrl || '').replace(/\/$/, '');

function cut(text, max) {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function stripMd(md) {
	return String(md || '').replace(/[#>*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// opts: { title(d), description(d), path(d), checks(d) => [[ok, texto], …] }
export function seoPreviewField(opts) {
	return {
		type: 'custom',
		label: 'Así se verá en Google',
		update(el, d) {
			const title = opts.title(d) || '(sin título)';
			const description = opts.description(d) || '';
			const url = SITE + opts.path(d);
			const checks = [
				[title.length >= 30 && title.length <= 65, `Título de ${title.length} caracteres (ideal 30–65).`],
				[description.length >= 70 && description.length <= 160, `Descripción de ${description.length} caracteres (ideal 70–160).`],
				...(opts.checks ? opts.checks(d) : [])
			];
			el.replaceChildren(
				h('div', { class: 'serp' },
					h('div', { class: 'serp-url' }, url),
					h('div', { class: 'serp-title' }, cut(title, 65)),
					h('div', { class: 'serp-desc' }, cut(description, 160))),
				h('ul', { class: 'seo-checks' }, checks.map(([ok, text]) =>
					h('li', { class: ok ? 'ok' : 'warn' }, ok ? '✓ ' : '! ', text))));
		}
	};
}

export { slugify, stripMd };
