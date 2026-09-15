import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

const artwork = [
	{ src: '/artwork-120.webp', width: 120 },
	{ src: '/artwork-240.webp', width: 240 },
];

afterEach(() => {
	document.body.replaceChildren();
});

describe('<player-artwork>', () => {
	test('lists the renditions and collapses once the image fails, until another source arrives', () => {
		const { part, store } = mount('player-artwork');

		expect(part.querySelector('img')).toBeNull();

		store.getState().loadQueue([queueItem('a', { artwork })]);

		const image = part.querySelector('img');

		expect(image?.getAttribute('srcset')).toBe('/artwork-120.webp 120w, /artwork-240.webp 240w');
		expect(image?.getAttribute('sizes')).toMatch(/^auto, /);

		image?.dispatchEvent(new Event('error'));

		expect(part.querySelector('img')).toBeNull();

		store.getState().loadQueue([queueItem('b', { artwork: [{ src: '/other.webp', width: 120 }] })]);

		expect(part.querySelector('img')?.getAttribute('src')).toBe('/other.webp');
	});

	test('takes the sizes its host names', () => {
		const { part, store } = mount('player-artwork', { sizes: '96px' });

		store.getState().loadQueue([queueItem('a', { artwork })]);

		expect(part.querySelector('img')?.getAttribute('sizes')).toBe('96px');
	});
});
