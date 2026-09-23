import { afterEach, expect, test, vi } from 'vitest';

import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { bind } from '#lib/bind.ts';
import { createPlayerStore } from '#store/player-store.ts';

afterEach(() => {
	vi.unstubAllGlobals();
});

test('a write that throws is reported and leaves later subscribers their update', () => {
	const failure = new Error('showModal refused');
	const reportError = vi.fn();
	const store = createPlayerStore({
		createEngine: createMockEngine().createEngine,
		isPersistent: false,
	});
	const later = vi.fn();

	vi.stubGlobal('reportError', reportError);
	bind(
		store,
		(state) => state.volume,
		(volume) => {
			if (volume < 1) throw failure;
		},
		new AbortController().signal,
	);
	store.subscribe(later);
	store.getState().setVolume(0.5);

	expect(reportError).toHaveBeenCalledWith(failure);
	expect(later).toHaveBeenCalledOnce();
});
