import { describe, expect, test } from 'vitest';

import {
	findComponentTags,
	getBodyLineOffset,
	getTagProp,
} from '#validate-content/component-tags.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const rootPath = import.meta.dirname;

// Mirrors fixtures/offset-sample.mdx, whose frontmatter and the blank line after it run six lines
const fixtureBody = 'Prose above the component.\n\n<Link>no id here</Link>\n';
const fixturePath = 'fixtures/offset-sample.mdx';

describe('findComponentTags', () => {
	test('matches a name exactly, so LinkList is not Link', () => {
		expect(findComponentTags('<LinkList items="a" />', ['Link'])).toEqual([]);
	});

	test('reads a self-closing tag and a tag with no props', () => {
		const tags = findComponentTags('<Link id="twisted" />\n<Link>text</Link>', ['Link']);

		expect(tags.map((tag) => tag.lineNumber)).toEqual([1, 2]);
		expect(tags.map((tag) => getTagProp(tag, 'id'))).toEqual(['twisted', undefined]);
	});

	test('reads a tag whose props span several lines', () => {
		const body = ['<Img', '\tsrc="covers/artwork.jpg"', '\talt="A cover"', '/>'].join('\n');
		const tags = findComponentTags(body, ['Img']);

		expect(tags.map((tag) => tag.lineNumber)).toEqual([1]);
		expect(tags.map((tag) => getTagProp(tag, 'src'))).toEqual(['covers/artwork.jpg']);
	});

	test('returns tags of every requested name in document order', () => {
		const body = ['<Img src="a.jpg" />', '<Link id="b" />'].join('\n');

		expect(findComponentTags(body, ['Img', 'Link']).map((tag) => tag.name)).toEqual([
			'Img',
			'Link',
		]);
	});
});

describe('getTagProp', () => {
	test('does not read `data-id` as the `id` prop', () => {
		const tags = findComponentTags('<Link data-id="twisted">text</Link>', ['Link']);

		expect(tags.map((tag) => getTagProp(tag, 'id'))).toEqual([undefined]);
	});

	test('reads a single-quoted value', () => {
		const tags = findComponentTags("<Link id='twisted'>text</Link>", ['Link']);

		expect(tags.map((tag) => getTagProp(tag, 'id'))).toEqual(['twisted']);
	});
});

describe('getBodyLineOffset', () => {
	test('measures the frontmatter a body was stripped of', () => {
		const entry = makeEntry({ body: fixtureBody, filePath: fixturePath, id: 'a-post' });

		expect(getBodyLineOffset(entry, rootPath)).toBe(6);
	});

	test('is zero for an entry with no file path', () => {
		expect(getBodyLineOffset(makeEntry({ body: fixtureBody, id: 'a-post' }), rootPath)).toBe(0);
	});

	test('is zero for a file path that is not on disk', () => {
		const entry = makeEntry({ body: fixtureBody, filePath: 'fixtures/absent.mdx', id: 'a-post' });

		expect(getBodyLineOffset(entry, rootPath)).toBe(0);
	});

	test('is zero when the body is not found in the file', () => {
		const entry = makeEntry({
			body: 'prose that is not there',
			filePath: fixturePath,
			id: 'a-post',
		});

		expect(getBodyLineOffset(entry, rootPath)).toBe(0);
	});
});
