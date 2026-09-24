import { afterEach, describe, expect, test } from 'vitest';

import { mount, queueItem } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function mountReadout() {
	const mounted = mount('player-scrub-readout');

	mounted.store.getState().playTrack(
		[
			queueItem('a', {
				cuePoints: [
					{ artistLine: 'Night Ferry', startSeconds: 50, title: 'Aurora' },
					{ artistLine: '', startSeconds: 120, title: 'Untitled' },
				],
				durationMs: 200_000,
			}),
		],
		'a',
	);

	return mounted;
}

function slots(part: HTMLElement): Array<string> {
	const layer = part.querySelector('.player-scrub-readout');

	return [...(layer?.children ?? [])].map((slot) => slot.textContent);
}

describe('<player-scrub-readout>', () => {
	test("shows the covering Track and the scrub position in the clock's own mode", () => {
		const { part, store } = mountReadout();

		store.getState().setScrubPreview(100);

		expect(part.dataset.held).toBeDefined();
		expect(part.dataset.track).toBeDefined();
		expect(slots(part)).toStrictEqual(['Aurora', 'Night Ferry', '1:40']);

		store.getState().toggleTimeMode();
		store.getState().setScrubPreview(130);

		expect(slots(part)).toStrictEqual(['Untitled', '', '-1:10']);
	});

	test('keeps the Mix on the text lines before the first Track starts', () => {
		const { part, store } = mountReadout();

		store.getState().setScrubPreview(20);

		expect(part.dataset.held).toBeDefined();
		expect(part.dataset.track).toBeUndefined();
		expect(slots(part)).toStrictEqual(['Mix a', 'Forest Signal', '0:20']);
	});

	test('lets go on release and keeps its text to fade out on', () => {
		const { part, store } = mountReadout();

		store.getState().setScrubPreview(100);
		store.getState().setScrubPreview(undefined);

		expect(part.dataset.held).toBeUndefined();
		expect(slots(part)).toStrictEqual(['Aurora', 'Night Ferry', '1:40']);
	});
});
