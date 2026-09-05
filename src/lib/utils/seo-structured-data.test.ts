import { describe, expect, test } from 'vitest';

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

describe('serializeGraph', () => {
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
