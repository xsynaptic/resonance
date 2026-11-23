import { afterEach, describe, expect, test } from 'vitest';

import { landDetail, mount, sampleTrack } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function mountReadout() {
	const mounted = mount('pzm-scrub-readout');

	mounted.store.getState().playTrack([sampleTrack('a', { durationMs: 200_000 })], 'a');
	landDetail(mounted.store, 'a', {
		cuePoints: [
			{ artistLine: 'Night Ferry', startSeconds: 50, title: 'Aurora' },
			{ artistLine: '', startSeconds: 120, title: 'Untitled' },
		],
	});

	return mounted;
}

function slots(part: HTMLElement): Array<string> {
	const layer = part.querySelector('.pzm-scrub-readout');

	return [...(layer?.children ?? [])].map((slot) => slot.textContent);
}

describe('<pzm-scrub-readout>', () => {
	test("shows the covering cue point and the scrub position in the clock's own mode", () => {
		const { part, view } = mountReadout();

		view.getState().setScrubPreview(100);

		expect(part.dataset.held).toBeDefined();
		expect(part.dataset.cue).toBeDefined();
		expect(slots(part)).toStrictEqual(['Aurora', 'Night Ferry', '1:40']);

		view.getState().toggleTimeMode();
		view.getState().setScrubPreview(130);

		expect(slots(part)).toStrictEqual(['Untitled', '', '−1:10']);
	});

	test('keeps the track on the text lines before the first cue point starts', () => {
		const { part, view } = mountReadout();

		view.getState().setScrubPreview(20);

		expect(part.dataset.held).toBeDefined();
		expect(part.dataset.cue).toBeUndefined();
		expect(slots(part)).toStrictEqual(['Mix a', 'Forest Signal', '0:20']);
	});

	test('lets go on release and keeps its text to fade out on', () => {
		const { part, view } = mountReadout();

		view.getState().setScrubPreview(100);
		view.getState().setScrubPreview(undefined);

		expect(part.dataset.held).toBeUndefined();
		expect(slots(part)).toStrictEqual(['Aurora', 'Night Ferry', '1:40']);
	});
});
