import { describe, expect, test } from 'vitest';

import { getEntryDescription, toDescriptionSource } from '#lib/utils/description.ts';

describe('getEntryDescription', () => {
	test('frontmatter description wins over the body', async () => {
		const description = await getEntryDescription({
			body: 'A body that should not be used.',
			data: { description: 'Written by hand.' },
		});

		expect(description).toBe('Written by hand.');
	});

	test('keeps punctuation attached to inline component text and parses the markdown around it', async () => {
		const description = await getEntryDescription({
			body: `<Link id="third-eye">Third Eye</Link>'s *Ancient Future* is the debut release from <Link id="psy-harmonics">Psy-Harmonics</Link>.`,
			data: {},
		});

		expect(description).toBe('Third Eye’s Ancient Future is the debut release from Psy-Harmonics.');
	});

	test('stops at the More marker', async () => {
		const description = await getEntryDescription({
			body: 'The opening paragraph.\n\n<More />\n\nThe rest of the piece.',
			data: {},
		});

		expect(description).toBe('The opening paragraph.');
	});

	test('skips a block that is only a component', async () => {
		const description = await getEntryDescription({
			body: '<Img src="2013/09/cover.jpg" />\n\nPhobium’s *Oort Cloud* is an album of deep space music.',
			data: {},
		});

		expect(description).toBe('Phobium’s Oort Cloud is an album of deep space music.');
	});

	test('separates list items rather than running them together', async () => {
		const description = await getEntryDescription({
			body: '- Recorded live in Taipei.\n- Cover shot at Badouzi.',
			data: {},
		});

		expect(description).toBe('Recorded live in Taipei. Cover shot at Badouzi.');
	});

	test('returns undefined for an empty body', async () => {
		expect(await getEntryDescription({ body: '\n\n', data: {} })).toBeUndefined();
		expect(await getEntryDescription({ data: {} })).toBeUndefined();
	});
});

describe('toDescriptionSource', () => {
	test('keeps whole blocks until the word budget is met', () => {
		const paragraph = Array.from({ length: 40 }, () => 'word').join(' ');
		const source = toDescriptionSource(`${paragraph}\n\n${paragraph}\n\n${paragraph}`);

		expect(source.split('\n\n')).toHaveLength(2);
	});
});
