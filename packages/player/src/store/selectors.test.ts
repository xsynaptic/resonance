import { describe, expect, test } from 'vitest';

import { createPlayerStore } from '#store/player-store.ts';
import { canStepBack, currentCue, restartThresholdSeconds } from '#store/selectors.ts';

function stateAt(
	currentIndex: number | undefined,
	currentTimeSeconds: number,
	playOrder: Array<number>,
) {
	const store = createPlayerStore();

	store.setState({ currentIndex, currentTimeSeconds, playOrder });

	return store.getState();
}

describe('canStepBack', () => {
	test('is inert at the top of the first track, where a restart would change nothing', () => {
		expect(canStepBack(stateAt(0, restartThresholdSeconds, [0, 1]))).toBe(false);
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
		const store = createPlayerStore();

		store.getState().loadQueue([
			{
				artistLine: 'Nebula Drift',
				cuePoints,
				itemId: 'a',
				releaseTitle: 'Cosmic Drift',
				title: 'Mix',
			},
		]);
		store.setState({ currentIndex, currentTimeSeconds });

		return store.getState();
	}

	test('names the cue the loaded item is inside', () => {
		expect(currentCue(cuedState(0, 90))?.title).toBe('Second');
	});
});
