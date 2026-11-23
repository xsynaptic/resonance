import { afterEach, describe, expect, test } from 'vitest';

import { mount, sampleTrack } from '#test/mount.ts';

const artwork = [
	{ src: '/artwork-120.webp', width: 120 },
	{ src: '/artwork-240.webp', width: 240 },
];

afterEach(() => {
	document.body.replaceChildren();
});

describe('<pzm-artwork>', () => {
	test('lists the renditions and collapses once the image fails, until another source arrives', () => {
		const { part, store } = mount('pzm-artwork');

		expect(part.querySelector('img')).toBeNull();

		store.getState().loadQueue([sampleTrack('a', { artwork })]);

		const image = part.querySelector('img');

		expect(image?.getAttribute('srcset')).toBe('/artwork-120.webp 120w, /artwork-240.webp 240w');
		expect(image?.getAttribute('sizes')).toBe('120px');

		image?.dispatchEvent(new Event('error'));

		expect(part.querySelector('img')).toBeNull();

		store
			.getState()
			.loadQueue([sampleTrack('b', { artwork: [{ src: '/other.webp', width: 120 }] })]);

		expect(part.querySelector('img')?.getAttribute('src')).toBe('/other.webp');
	});
});
