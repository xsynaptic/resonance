import type { ShikiConfig } from 'astro';

// Shiki inlines these on every token span, so they are `var()` and the ramp stays the only source
const token = {
	base: 'var(--color-ink-500)',
	comment: 'var(--color-ink-700)',
	keyword: 'var(--color-accent-500)',
	modifier: 'var(--color-crimson-300)',
	name: 'var(--color-ink-300)',
	plate: 'var(--color-surface-800)',
	punctuation: 'var(--color-surface-200)',
	type: 'var(--color-ink-400)',
	value: 'var(--color-highlight-400)',
} as const;

export const shikiTheme = {
	bg: token.plate,
	fg: token.base,
	name: 'resonance',
	settings: [
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: { foreground: token.comment },
		},
		{
			scope: ['punctuation', 'meta.brace', 'meta.tag', 'keyword.operator'],
			settings: { foreground: token.punctuation },
		},
		{
			scope: ['keyword', 'storage', 'entity.name.tag', 'keyword.operator.expression'],
			settings: { foreground: token.keyword },
		},
		{
			scope: [
				'entity.name.function',
				'entity.name.command',
				'support.function',
				'meta.function-call',
			],
			settings: { foreground: token.name },
		},
		{
			scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
			settings: { foreground: token.type },
		},
		{
			// Bare `string` would catch `string.unquoted.argument.shell`, colouring every path
			scope: [
				'string.quoted',
				'string.template',
				'string.regexp',
				'punctuation.definition.string',
				'constant.numeric',
				'constant.language',
				'meta.embedded.line',
			],
			settings: { foreground: token.value },
		},
		{
			scope: [
				'constant.other.option',
				'entity.other.attribute-name',
				'constant.character.escape',
				'constant.other.character-class',
			],
			settings: { foreground: token.modifier },
		},
		{ scope: ['markup.heading', 'markup.bold'], settings: { foreground: token.name } },
		{ scope: ['markup.inserted'], settings: { foreground: token.keyword } },
		{ scope: ['markup.deleted'], settings: { foreground: token.modifier } },
	],
	type: 'dark',
} satisfies NonNullable<ShikiConfig['theme']>;
