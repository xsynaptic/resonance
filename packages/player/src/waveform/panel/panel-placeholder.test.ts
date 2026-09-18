import { expect, test, vi } from 'vitest';

import type { WaveformArchive } from '#waveform/panel/waveform-archive.ts';

import { createPanelPlaceholder } from '#waveform/panel/panel-placeholder.ts';

const windowSpan = { fromSeconds: 0, toSeconds: 2 };

function archiveMissing(chunks: Array<number>, askedMs: number): WaveformArchive {
	return {
		landedChunks: () => 0,
		missing: () =>
			chunks.map((chunk) => ({
				askedMs,
				chunk,
				fromPair: chunk * 100,
				toPair: (chunk + 1) * 100,
			})),
		pairsPerSecond: 100,
		pairsTotal: 1000,
		samples: new Int8Array(0),
		want: vi.fn(),
	};
}

function opened(chunks: Array<number>, askedMs: number, frameMs: number) {
	return {
		archive: archiveMissing(chunks, askedMs),
		frameMs,
		fromPair: 0,
		isArchiveOpening: false,
		isDrawn: () => true,
		toPair: 200,
		windowSpan,
	};
}

function opening(frameMs: number) {
	return {
		archive: undefined,
		frameMs,
		fromPair: 0,
		isArchiveOpening: true,
		isDrawn: () => true,
		toPair: 0,
		windowSpan,
	};
}

test('a missing chunk shows its placeholder only once it has waited 400ms', () => {
	const placeholder = createPanelPlaceholder();

	expect(placeholder.frame(opened([0], 1000, 1000)).spans).toHaveLength(0);
	expect(placeholder.frame(opened([0], 1000, 1399)).spans).toHaveLength(0);
	expect(placeholder.frame(opened([0], 1000, 1400)).spans).toMatchObject([
		{ fromSeconds: 0, toSeconds: 1 },
	]);
});

test('the whole window waits on the header, then gives way to the chunks', () => {
	const placeholder = createPanelPlaceholder();

	placeholder.frame(opening(0));

	expect(placeholder.frame(opening(400)).spans).toMatchObject([windowSpan]);
	expect(placeholder.frame(opened([0], 0, 416)).spans).toHaveLength(1);
});

test('a span that draws nothing leaves a still panel unpainted', () => {
	const placeholder = createPanelPlaceholder();
	const hidden = { ...opened([0], 0, 1000), isDrawn: () => false };

	expect(placeholder.frame(hidden).repaintKey).toBe(
		placeholder.frame({ ...hidden, frameMs: 1016 }).repaintKey,
	);
});
