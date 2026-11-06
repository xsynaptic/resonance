import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { Thing } from '#lib/utils/seo-structured-data.ts';

import { serializeGraph } from '#lib/utils/seo-structured-data.ts';

const entities = [
	{
		'@id': 'https://djbasilisk.com/mixes/test/#article',
		'@type': 'Article',
		author: { '@id': 'https://djbasilisk.com/profile/#/schema.org/Person' },
		datePublished: '2026-01-01T00:00:00.000Z',
		headline: '</script><img onerror=alert(1) src=x> & more',
	},
] satisfies Array<Thing>;

const hostilePiece = fc.constantFrom(
	'</script>',
	'<!--',
	'-->',
	'&amp;',
	'\u{2028}',
	'\u{2029}',
	'\u{D800}',
	'\u{DFFF}',
);

const anyBinaryString = fc
	.array(
		fc.oneof(
			{ arbitrary: fc.string({ unit: 'binary' }), weight: 3 },
			{ arbitrary: hostilePiece, weight: 2 },
		),
		{ maxLength: 4 },
	)
	.map((pieces) => pieces.join(''));

const stringWithAHostilePiece = fc
	.tuple(anyBinaryString, hostilePiece, anyBinaryString)
	.map((pieces) => pieces.join(''));

const article = fc.record(
	{
		'@id': anyBinaryString,
		'@type': fc.constant('Article' as const),
		author: fc.record({ '@id': anyBinaryString }, { noNullPrototype: true }),
		datePublished: anyBinaryString,
		headline: stringWithAHostilePiece,
	},
	{ noNullPrototype: true },
);

const breadcrumbList = fc.record(
	{
		'@id': anyBinaryString,
		'@type': fc.constant('BreadcrumbList' as const),
		itemListElement: fc.array(
			fc.record(
				{
					'@type': fc.constant('ListItem' as const),
					item: anyBinaryString,
					name: stringWithAHostilePiece,
					position: fc.integer(),
				},
				{ noNullPrototype: true },
			),
			{ maxLength: 3 },
		),
	},
	{ noNullPrototype: true },
);

const graphOfStrings = fc.array(fc.oneof(article, breadcrumbList), { maxLength: 4, minLength: 1 });

describe('serializeGraph', () => {
	test.prop([graphOfStrings], { numRuns: 1000 })(
		'parses back unchanged and holds no <, > or &, for any strings',
		(graph: Array<Thing>) => {
			const serialized = serializeGraph(graph);

			expect(serialized).not.toMatch(/[<>&]/u);
			expect(JSON.parse(serialized)).toStrictEqual({
				'@context': 'https://schema.org',
				'@graph': graph,
			});
		},
	);

	test('escapes every character that could end the script element', () => {
		const serialized = serializeGraph(entities);

		expect(serialized).not.toContain('<');
		expect(serialized).not.toContain('>');
		expect(serialized).not.toContain('&');
		expect(serialized).toContain(String.raw`\u003c/script\u003e`);
	});

	test('escapes as JSON, so the payload parses back unchanged', () => {
		const parsed: unknown = JSON.parse(serializeGraph(entities));

		expect(parsed).toEqual({ '@context': 'https://schema.org', '@graph': entities });
	});
});
