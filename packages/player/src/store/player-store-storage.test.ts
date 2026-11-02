import { beforeEach, describe, expect, test, vi } from 'vitest';

import { queueStorageKey, volumeStorageKey } from '#constants.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createPlayerStore } from '#store/player-store.ts';
import {
	fake,
	hidePage,
	makeItem,
	persisted,
	release,
	resetEngine,
	storeQueue,
} from '#test/player-store.ts';

beforeEach(resetEngine);

describe('storage', () => {
	test('survives a browser where reaching for localStorage throws', () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('SecurityError');
			},
		});

		try {
			const store = persisted();

			expect(() => {
				store.getState().setVolume(0.3);
			}).not.toThrow();
			expect(() => {
				store.getState().toggleTimeMode();
			}).not.toThrow();
			expect(store.getState().volume).toBe(0.3);
		} finally {
			if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
		}
	});

	test('a store given its own storage neither reads nor writes localStorage', () => {
		vi.useFakeTimers();
		localStorage.setItem(volumeStorageKey, '0.4');
		storeQueue(release, { currentIndex: 0, currentTimeSeconds: 42, isShuffling: false });

		const setItem = vi.spyOn(localStorage, 'setItem');
		const storage = createMemoryStorage();

		try {
			const store = createPlayerStore({ createEngine: fake.createEngine, storage });

			expect(store.getState().volume).toBe(1);
			expect(store.getState().queue).toHaveLength(0);

			store.getState().setVolume(0.7);
			store.getState().loadQueue([makeItem('x')]);
			vi.runAllTimers();

			expect(setItem).not.toHaveBeenCalled();
			expect(storage.getItem(volumeStorageKey)).toBe('0.7');
			expect(storage.getItem(queueStorageKey)).toBeDefined();
		} finally {
			setItem.mockRestore();
			vi.useRealTimers();
			localStorage.removeItem(volumeStorageKey);
			localStorage.removeItem(queueStorageKey);
		}
	});

	test('flushes a pending volume when the page goes hidden', () => {
		vi.useFakeTimers();
		localStorage.removeItem(volumeStorageKey);

		try {
			persisted().getState().setVolume(0.3);
			hidePage();

			expect(localStorage.getItem(volumeStorageKey)).toBe('0.3');
		} finally {
			vi.useRealTimers();
			localStorage.removeItem(volumeStorageKey);
		}
	});

	test('writes the volume once for a run of changes', () => {
		vi.useFakeTimers();
		localStorage.removeItem(volumeStorageKey);

		try {
			const store = persisted();
			const setItem = vi.spyOn(localStorage, 'setItem');

			for (const volume of [0.1, 0.2, 0.3, 0.4]) store.getState().setVolume(volume);

			expect(setItem).not.toHaveBeenCalled();

			vi.runAllTimers();
			expect(setItem).toHaveBeenCalledTimes(1);
			expect(localStorage.getItem(volumeStorageKey)).toBe('0.4');

			setItem.mockRestore();
		} finally {
			vi.useRealTimers();
			localStorage.removeItem(volumeStorageKey);
		}
	});
});
