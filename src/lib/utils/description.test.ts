import { createSqliteCache } from '@xsynaptic/shared/cache';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import { createEntryDescriptionFunction, toDescriptionSource } from '#lib/utils/description.ts';

function setup() {
	const cache = createSqliteCache<string>(
		mkdtempSync(path.join(tmpdir(), 'description-cache-')),
		'entry-descriptions',
	);
	const setSpy = vi.spyOn(cache, 'set');

	return { getEntryDescription: createEntryDescriptionFunction({ cache }), setSpy };
}

function buildEntry(body: string, data: { description?: string } = {}) {
	return { body, collection: 'posts', data, id: 'alpha' };
}

describe('createEntryDescriptionFunction', () => {
	test('keeps punctuation attached to inline component text and parses the markdown around it', async () => {
		const { getEntryDescription } = setup();

		const description = await getEntryDescription(
			buildEntry(
				`<Link id="third-eye">Third Eye</Link>'s *Ancient Future* is the debut release from <Link id="psy-harmonics">Psy-Harmonics</Link>.`,
			),
		);

		expect(description).toBe('Third Eye’s Ancient Future is the debut release from Psy-Harmonics.');
	});

	test('stops at the More marker', async () => {
		const { getEntryDescription } = setup();

		const description = await getEntryDescription(
			buildEntry('The opening paragraph.\n\n<More />\n\nThe rest of the piece.'),
		);

		expect(description).toBe('The opening paragraph.');
	});

	test('skips a block that is only a component', async () => {
		const { getEntryDescription } = setup();

		const description = await getEntryDescription(
			buildEntry(
				'<Img src="2013/09/cover.jpg" />\n\nPhobium’s *Oort Cloud* is an album of deep space music.',
			),
		);

		expect(description).toBe('Phobium’s Oort Cloud is an album of deep space music.');
	});

	test('serves a repeat call from the cache', async () => {
		const { getEntryDescription, setSpy } = setup();
		const entry = buildEntry('The opening paragraph.');

		expect(await getEntryDescription(entry)).toBe('The opening paragraph.');
		expect(await getEntryDescription(entry)).toBe('The opening paragraph.');
		expect(setSpy).toHaveBeenCalledTimes(1);
	});

	test('changed body invalidates the cached excerpt', async () => {
		const { getEntryDescription, setSpy } = setup();

		await getEntryDescription(buildEntry('The opening paragraph.'));

		expect(await getEntryDescription(buildEntry('Another opening.'))).toBe('Another opening.');
		expect(setSpy).toHaveBeenCalledTimes(2);
	});

	test('a frontmatter description bypasses the cache', async () => {
		const { getEntryDescription, setSpy } = setup();

		expect(await getEntryDescription(buildEntry('Body.', { description: 'Written.' }))).toBe(
			'Written.',
		);
		expect(setSpy).not.toHaveBeenCalled();
	});
});

describe('toDescriptionSource', () => {
	test('keeps whole blocks until the word budget is met', () => {
		const paragraph = Array.from({ length: 40 }, () => 'word').join(' ');
		const source = toDescriptionSource(`${paragraph}\n\n${paragraph}\n\n${paragraph}`);

		expect(source.split('\n\n')).toHaveLength(2);
	});
});
