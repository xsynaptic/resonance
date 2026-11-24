import { createWavedataWriter } from '@xsynaptic/plazmoid-wavedata';
import { WavedataFactsSchema } from '@xsynaptic/shared/schemas';
import { expect, test } from 'vitest';

// Two source channels, then the low, mid and high band of each
const valuesPerFrame = 8;

test('the facts schema takes the writer facts whole, so a field the writer adds fails here instead of being dropped before the player', () => {
	const writer = createWavedataWriter({ hasBands: true, mode: 'overall', sampleRate: 44_100 });
	const frames = new Float32Array(3000 * valuesPerFrame).map((_, index) => {
		const value = index % valuesPerFrame;

		if (value === 0) return 0.25;
		if (value === 1) return -0.25;

		return 0.1;
	});

	writer.push(new Uint8Array(frames.buffer, frames.byteOffset, frames.byteLength));

	expect(WavedataFactsSchema.safeParse(writer.finish().facts).error).toBeUndefined();
});
