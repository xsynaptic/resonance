import type { ShikiConfig } from 'astro';

// Shiki inlines these on every token span, so they are `var()` and the ramp stays the only source
// Ink carries identifiers, lime marks structure, warm is kept for the rarer literal values
const token = {
	comment: 'var(--color-ink-600)',
	identifier: 'var(--color-ink-300)',
	keyword: 'var(--color-accent-400)',
	name: 'var(--color-ink-100)',
	plate: 'var(--color-surface-800)',
	punctuation: 'var(--color-ink-500)',
	type: 'var(--color-ink-200)',
	value: 'var(--color-highlight-300)',
} as const;

export const shikiTheme = {
	bg: token.plate,
	fg: token.punctuation,
	name: 'resonance',
	settings: [
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: { foreground: token.comment },
		},
		{
			scope: ['keyword', 'storage', 'keyword.control', 'keyword.operator.expression'],
			settings: { foreground: token.keyword },
		},
		{
			scope: ['entity.name.function', 'support.function', 'meta.function-call'],
			settings: { foreground: token.name },
		},
		{
			scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
			settings: { foreground: token.type },
		},
		{
			scope: [
				'variable',
				'variable.parameter',
				'meta.definition.variable',
				'meta.object-literal.key',
			],
			settings: { foreground: token.identifier },
		},
		{
			scope: ['string', 'string.quoted', 'string.regexp', 'meta.embedded.line'],
			settings: { foreground: token.value },
		},
		{
			scope: ['constant.numeric', 'constant.language', 'constant.character.escape'],
			settings: { foreground: token.value },
		},
		{ scope: ['entity.name.tag'], settings: { foreground: token.keyword } },
		{ scope: ['entity.other.attribute-name'], settings: { foreground: token.type } },
		{ scope: ['markup.heading', 'markup.bold'], settings: { foreground: token.name } },
		{ scope: ['markup.inserted'], settings: { foreground: token.keyword } },
		{ scope: ['markup.deleted'], settings: { foreground: token.value } },
	],
	type: 'dark',
} satisfies NonNullable<ShikiConfig['theme']>;
