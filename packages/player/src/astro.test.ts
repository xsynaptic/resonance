import { afterEach, describe, expect, test, vi } from 'vitest';

import { bindAstroRouter, loadPersistedStylesheet } from '#astro.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createPlayerStore } from '#store/player-store.ts';

// Inline, so happy-dom has nothing to fetch
const stylesheet = 'data:text/css,';

afterEach(() => {
	document.head.replaceChildren();
	vi.restoreAllMocks();
});

describe('bindAstroRouter', () => {
	test('closes the overlay before the router prepares, and refreshes the page after the swap', () => {
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const controls = { refresh: vi.fn(), unbind: vi.fn() };
		const unbind = bindAstroRouter(store, controls);

		store.getState().setOverlayOpen(true);
		document.dispatchEvent(new Event('astro:before-preparation'));

		expect(store.getState().isOverlayOpen).toBe(false);
		expect(controls.refresh).not.toHaveBeenCalled();

		document.dispatchEvent(new Event('astro:after-swap'));

		expect(controls.refresh).toHaveBeenCalledOnce();

		unbind();
		document.dispatchEvent(new Event('astro:after-swap'));

		expect(controls.refresh).toHaveBeenCalledOnce();
	});
});

describe('loadPersistedStylesheet', () => {
	test('carries the sheet into every incoming head, so the router keeps it', () => {
		void loadPersistedStylesheet(stylesheet);

		const newDocument = document.implementation.createHTMLDocument();

		document.dispatchEvent(Object.assign(new Event('astro:before-swap'), { newDocument }));

		expect(newDocument.head.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(
			stylesheet,
		);
	});

	// Kept out of the head, where happy-dom would load even a broken sheet before the error could matter
	test('settles when the sheet fails to load', { timeout: 2000 }, async () => {
		let link: Node | undefined;

		vi.spyOn(document.head, 'append').mockImplementation((node) => {
			if (node instanceof Node) link = node;
		});

		const loaded = loadPersistedStylesheet(stylesheet);

		link?.dispatchEvent(new Event('error'));

		await expect(loaded).resolves.toBeUndefined();
	});
});
