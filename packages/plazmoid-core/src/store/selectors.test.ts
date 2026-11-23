import { describe, expect, test } from 'vitest';

import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { canStepBack, currentCue, restartThresholdSeconds } from '#store/selectors.ts';

function stateAt(
	currentIndex: number | undefined,
	currentTimeSeconds: number,
	playOrder: Array<number>,
) {
	const store = createWritablePlayerStore({ storage: createMemoryStorage() });

	store.setState({ currentIndex, currentTimeSeconds, playOrder });

	return store.getState();
}

describe('canStepBack', () => {
	test('is inert at the top of the first track, where a restart would change nothing', () => {
		expect(canStepBack(stateAt(0, restartThresholdSeconds, [0, 1]))).toBe(false);
	});

	test('steps back from the top of a later track', () => {
		expect(canStepBack(stateAt(1, 0, [0, 1]))).toBe(true);
	});

	test('restarts a lone track once it is past the threshold', () => {
		expect(canStepBack(stateAt(0, restartThresholdSeconds + 1, [0]))).toBe(true);
	});
});

describe('currentCue', () => {
	const cuePoints = [
		{ artistLine: '', startSeconds: 0, title: 'Opening' },
		{ artistLine: '', startSeconds: 60, title: 'Second' },
	];

	function cuedState(currentIndex: number | undefined, currentTimeSeconds: number) {
		const store = createWritablePlayerStore({ storage: createMemoryStorage() });

		store.getState().loadQueue([
			{
				artistLine: 'Nebula Drift',
				releaseTitle: 'Cosmic Drift',
				title: 'Mix',
				trackId: 'a',
			},
		]);
		store.setState({ currentIndex, currentTimeSeconds, details: new Map([['a', { cuePoints }]]) });

		return store.getState();
	}

	test('names the cue the loaded track is inside', () => {
		expect(currentCue(cuedState(0, 90))?.title).toBe('Second');
	});
});
