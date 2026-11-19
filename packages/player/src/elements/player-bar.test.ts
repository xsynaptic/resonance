import { getByRole } from '@testing-library/dom';
import { afterEach, describe, expect, test } from 'vitest';

import { labels } from '#test/labels.ts';
import { mount } from '#test/mount.ts';

afterEach(() => {
	document.body.replaceChildren();
});

function transportLabels(part: Element): Array<null | string> {
	return [...part.querySelectorAll(':scope .player-transport button')].map((button) =>
		button.getAttribute('aria-label'),
	);
}

describe('<player-bar>', () => {
	test('places the seek pair inside the step buttons, under one named region', () => {
		const { part } = mount('player-bar');

		getByRole(part, 'region', { name: labels.nowPlaying });
		expect(transportLabels(part)).toEqual([
			labels.previous,
			labels.seekBack,
			labels.play,
			labels.seekForward,
			labels.next,
		]);
		expect(part.querySelector('player-artwork')).not.toBeNull();
		expect(part.querySelector('dialog')).not.toBeNull();
		expect(part.querySelector('player-scope')).toBeNull();
	});

	test('leaves out what the root turns off', () => {
		const { part } = mount('player-bar', {
			root: { isArtworkEnabled: false, isOverlayEnabled: false, isPanelEnabled: false },
		});

		expect(transportLabels(part)).toEqual([
			labels.previous,
			labels.seekBack,
			labels.play,
			labels.seekForward,
			labels.next,
		]);
		expect(part.querySelector('player-artwork')).toBeNull();
		expect(part.querySelector('player-overlay-toggle')).toBeNull();
		expect(part.querySelector('dialog')).toBeNull();
		expect(part.querySelector('player-panel, player-panel-toggle')).toBeNull();
	});

	test('keeps its one bar across a reconnect', async () => {
		const { part, root } = mount('player-bar');

		root.remove();
		// The disconnect settles on a microtask; a same-task reconnect never reaches the bar
		await Promise.resolve();
		document.body.append(root);

		expect(part.querySelectorAll('.player-bar')).toHaveLength(1);
		expect(transportLabels(part)).toHaveLength(5);
	});
});
