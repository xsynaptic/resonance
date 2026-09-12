import { describe, expect, test } from 'vitest';

import { createGhostMarker } from '#waveform/ghost-marker.ts';

function setup() {
	const root = document.createElement('div');

	root.toggleAttribute('hidden', true);

	return { marker: createGhostMarker(root, 70), root };
}

describe('createGhostMarker', () => {
	test('hides the ghost without disturbing where it was placed', () => {
		const { marker, root } = setup();

		marker.place(0.5);
		marker.place(undefined);

		expect(root.hidden).toBe(true);
		expect(root.style.translate).toBe('35.00px');
	});

	test('writes nothing on a frame that did not move', () => {
		const { marker, root } = setup();

		marker.place(0.5);
		root.style.translate = 'untouched';
		marker.place(0.5);

		expect(root.style.translate).toBe('untouched');
	});

	test('shows the ghost again at an offset it has already written', () => {
		const { marker, root } = setup();

		marker.place(0.5);
		marker.place(undefined);
		marker.place(0.5);

		expect(root.hidden).toBe(false);
	});
});
