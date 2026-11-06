import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { toExcerpt } from '#lib/utils/markdown.ts';

const attributeSentinel = 'zq';

const tokens = fc.constantFrom(
	'word',
	'ab',
	'😀',
	'😀😀',
	'>',
	'"',
	'&',
	'*em*',
	'[link](http://x.test "zq>zq")',
	'![zq > zq](a.jpg)',
);

const separators = fc.constantFrom(' ', '', '\n\n');

const markdown = fc
	.array(fc.tuple(tokens, separators), { maxLength: 24, minLength: 1 })
	.map((parts) => parts.map(([token, separator]) => `${token}${separator}`).join(''));

describe('toExcerpt', () => {
	test.prop([markdown, fc.integer({ max: 40, min: 4 })])(
		'stays within the length, keeps surrogate pairs whole and leaks nothing from a tag',
		async (source, maxLength) => {
			const excerpt = await toExcerpt(source, maxLength);

			expect(excerpt.length).toBeLessThanOrEqual(maxLength + 1);
			expect(excerpt.isWellFormed()).toBe(true);
			expect(excerpt).not.toContain(attributeSentinel);
		},
	);

	test.prop([markdown, fc.integer({ max: 40, min: 4 })])(
		'cuts at the last word that fits, or hard at the limit when no space comes before it',
		async (source, maxLength) => {
			const full = await toExcerpt(source, Infinity);
			const excerpt = await toExcerpt(source, maxLength);

			if (full.length <= maxLength) {
				expect(excerpt).toBe(full);
				return;
			}

			expect(excerpt.endsWith('…')).toBe(true);

			const kept = excerpt.slice(0, -1);

			expect(full.startsWith(kept)).toBe(true);

			if (!/\s/.test(full.slice(0, maxLength + 1))) {
				expect(kept.length).toBeGreaterThanOrEqual(maxLength - 1);
				return;
			}

			const rest = full.slice(kept.length);
			const nextWord = /^\s+\S+/.exec(rest)?.[0] ?? '';

			expect(rest).toMatch(/^\s/);
			expect(kept.length + nextWord.length).toBeGreaterThan(maxLength);
		},
	);
});
