import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const commentParser = new MarkdownIt('zero', { breaks: true, html: false, linkify: true }).enable([
	'backticks',
	'emphasis',
	'escape',
	'link',
	'linkify',
	'newline',
]);

const allowedProtocols = new Set(['http:', 'https:']);

// The parser allows protocol-relative and mailto: through, which are outside the stated syntax
commentParser.validateLink = isSafeUrl;

commentParser.renderer.rules.link_open = function linkOpen(tokens, index, options, _env, renderer) {
	tokens[index]?.attrSet('rel', 'nofollow ugc noopener');

	return renderer.renderToken(tokens, index, options);
};

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedAttributes: { a: ['href', 'rel'] },
	allowedSchemes: ['http', 'https'],
	allowedTags: ['a', 'br', 'code', 'em', 'p', 'strong'],
	allowProtocolRelative: false,
};

export function isSafeUrl(url: string): boolean {
	if (url.startsWith('//')) return false;

	try {
		return allowedProtocols.has(new URL(url, 'https://base.invalid').protocol);
	} catch {
		return false;
	}
}

// An independent second gate, so a parser bug is a broken comment rather than stored XSS
export function renderCommentBody(body: string): string {
	return sanitizeHtml(commentParser.render(body), sanitizeOptions);
}

// Absolute only; a relative author URL would render as a link back into this site
export function toAuthorHref(url: string | undefined): string | undefined {
	if (url === undefined) return undefined;

	try {
		const { href, protocol } = new URL(url);

		return allowedProtocols.has(protocol) ? href : undefined;
	} catch {
		return undefined;
	}
}
