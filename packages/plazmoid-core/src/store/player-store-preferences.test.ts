import { beforeEach, describe, expect, test, vi } from 'vitest';

import { mutedStorageKey, volumeStorageKey } from '#constants.ts';
import { configured, fake, persisted, release, resetEngine } from '#test/player-store.ts';

beforeEach(resetEngine);

describe('volume', () => {
	test('clamps to the 0..1 range', () => {
		const store = configured();

		store.getState().setVolume(1.5);
		expect(store.getState().volume).toBe(1);

		store.getState().setVolume(-0.2);
		expect(store.getState().volume).toBe(0);
	});

	test('mutes through the engine without touching the level it holds', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().setVolume(0.7);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: true, volume: 0.7 });
		expect(fake.engine.setMuted).toHaveBeenLastCalledWith(true);
		expect(fake.engine.setVolume).toHaveBeenLastCalledWith(0.7);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.7 });
		expect(fake.engine.setMuted).toHaveBeenLastCalledWith(false);
		expect(fake.engine.setVolume).toHaveBeenLastCalledWith(0.7);
	});

	test('unmutes a level of zero into a quarter, dragged there or muted there', () => {
		const store = configured();

		store.getState().setVolume(0);
		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.25 });

		store.getState().toggleMuted();
		store.getState().setVolume(0);
		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.25 });
	});

	test('raising the level while muted unmutes at that level', () => {
		const store = configured();

		store.getState().setVolume(0.7);
		store.getState().toggleMuted();
		store.getState().setVolume(0.2);

		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.2 });
	});

	test('a mute survives a reload and unmutes to the level it held', () => {
		vi.useFakeTimers();

		try {
			const store = persisted();

			store.getState().setVolume(0.3);
			store.getState().toggleMuted();
			vi.runAllTimers();

			const reloaded = persisted();

			expect(reloaded.getState()).toMatchObject({ isMuted: true, volume: 0.3 });

			reloaded.getState().toggleMuted();
			expect(reloaded.getState()).toMatchObject({ isMuted: false, volume: 0.3 });
		} finally {
			vi.useRealTimers();
			localStorage.removeItem(mutedStorageKey);
			localStorage.removeItem(volumeStorageKey);
		}
	});
});
