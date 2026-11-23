import { fc, test } from '@fast-check/vitest';
import { beforeEach, describe, expect } from 'vitest';

import type { PlayerStore } from '#store/player-types.ts';

import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { fake, hidePage, makeTrack, resetEngine } from '#test/player-store.ts';

beforeEach(resetEngine);

type ListenerStep =
	| { at: number; kind: 'play-at' | 'remove' }
	| { from: number; kind: 'move'; to: number }
	| { kind: 'listen'; quarters: number }
	| { kind: 'load'; trackIds: Array<string> }
	| { kind: 'play-track' | 'queue-track'; pick: number; trackIds: Array<string> }
	| { kind: 'shuffle' };

const catalogIds = ['a', 'b', 'c', 'd'];

const releaseOfIds = fc.subarray(catalogIds, { minLength: 1 });

const listenerSteps = fc.array(
	fc.oneof(
		fc.record({ kind: fc.constant('load' as const), trackIds: releaseOfIds }),
		fc.record({
			kind: fc.constantFrom('play-track' as const, 'queue-track' as const),
			pick: fc.nat(),
			trackIds: releaseOfIds,
		}),
		fc.record({ from: fc.nat(), kind: fc.constant('move' as const), to: fc.nat() }),
		fc.record({ at: fc.nat(), kind: fc.constantFrom('play-at' as const, 'remove' as const) }),
		fc.record({
			kind: fc.constant('listen' as const),
			quarters: fc.integer({ max: 2400, min: 1 }),
		}),
		fc.constant({ kind: 'shuffle' } as const),
	),
	{ maxLength: 14, minLength: 1, size: 'max' },
);

function takeStep(store: ReturnType<typeof createWritablePlayerStore>, step: ListenerStep): void {
	const state = store.getState();
	const length = Math.max(1, state.queue.length);

	switch (step.kind) {
		case 'listen': {
			// Stands in for the engine's `timeupdate`, which sets the position while a track plays
			if (state.currentIndex !== undefined)
				store.setState({ currentTimeSeconds: step.quarters / 4 });
			return;
		}
		case 'load': {
			state.loadQueue(step.trackIds.map(makeTrack));
			return;
		}
		case 'move': {
			state.moveTrack(step.from % length, step.to % length);
			return;
		}
		case 'play-at': {
			if (state.queue.length > 0) state.playAt(step.at % length);
			return;
		}
		case 'play-track':
		case 'queue-track': {
			const release = step.trackIds.map(makeTrack);
			const trackId = step.trackIds[step.pick % step.trackIds.length];
			if (trackId === undefined) return;

			const action = step.kind === 'play-track' ? state.playTrack : state.queueTrack;

			action(release, trackId);
			return;
		}
		case 'remove': {
			state.removeAt(step.at % length);
			return;
		}
		case 'shuffle': {
			state.toggleShuffle();
		}
	}
}

// Shuffle is only saved along with a queue, and an empty queue saves nothing, so shuffle counts only when a queue is left
function toRestorable(state: PlayerStore) {
	return {
		currentIndex: state.currentIndex,
		currentTimeSeconds: state.currentIndex === undefined ? 0 : state.currentTimeSeconds,
		isShuffling: state.queue.length > 0 && state.isShuffling,
		playOrder: state.playOrder,
		queue: state.queue.map(({ queueId: _queueId, ...track }) => track),
	};
}

describe('queue persistence over any listening session', () => {
	test.prop([listenerSteps])(
		'a reload restores the queue, the loaded track, its position and the shuffled order the page left',
		(steps) => {
			const storage = createMemoryStorage();
			const open = () => {
				const store = createWritablePlayerStore({ createEngine: fake.createEngine, storage });

				store.getState().configure({
					urls: {
						stream: ({ trackId }) =>
							Promise.resolve({ sources: [{ url: `https://api.test/${trackId}` }], status: 'ok' }),
					},
				});

				return store;
			};
			const before = open();

			for (const step of steps) takeStep(before, step);

			hidePage();

			const restored = open().getState();

			expect(restored.status).toBe('idle');
			expect(toRestorable(restored)).toStrictEqual(toRestorable(before.getState()));
		},
	);
});
