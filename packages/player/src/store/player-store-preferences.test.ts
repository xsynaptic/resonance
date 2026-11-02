import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
	mutedStorageKey,
	panelOpenStorageKey,
	panelZoomStorageKey,
	timeModeStorageKey,
	volumeStorageKey,
} from '#constants.ts';
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

describe('time mode', () => {
	test('persists the choice and restores it on reload', () => {
		persisted().getState().toggleTimeMode();

		expect(localStorage.getItem(timeModeStorageKey)).toBe('remaining');

		const restored = persisted();

		expect(restored.getState().timeMode).toBe('remaining');

		localStorage.removeItem(timeModeStorageKey);
	});

	test('ignores a stored value that is not a mode', () => {
		localStorage.setItem(timeModeStorageKey, 'sideways');

		const store = persisted();

		expect(store.getState().timeMode).toBe('elapsed');

		localStorage.removeItem(timeModeStorageKey);
	});
});

describe('panel state', () => {
	test('persists the open state and restores it on reload', () => {
		persisted().getState().togglePanel();

		expect(localStorage.getItem(panelOpenStorageKey)).toBe('true');

		const restored = persisted();

		expect(restored.getState().isPanelOpen).toBe(true);

		localStorage.removeItem(panelOpenStorageKey);
	});

	test('persists the zoom step and restores it on reload', () => {
		persisted().getState().zoomPanel(1);

		expect(localStorage.getItem(panelZoomStorageKey)).toBe('105');

		const restored = persisted();

		expect(restored.getState().panelPxPerSecond).toBe(105);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test('persists a zoom between two steps and restores it on reload', () => {
		persisted().getState().setPanelZoom(83.25);

		expect(localStorage.getItem(panelZoomStorageKey)).toBe('83.25');
		expect(persisted().getState().panelPxPerSecond).toBe(83.25);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test.each(['19', '241', 'wide'])('ignores a stored zoom of %s, outside the ladder', (stored) => {
		localStorage.setItem(panelZoomStorageKey, stored);

		expect(persisted().getState().panelPxPerSecond).toBe(70);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test('steps from between two steps to the nearest one in that direction', () => {
		const store = persisted();

		store.getState().setPanelZoom(83.25);
		store.getState().zoomPanel(1);
		expect(store.getState().panelPxPerSecond).toBe(105);

		store.getState().setPanelZoom(83.25);
		store.getState().zoomPanel(-1);
		expect(store.getState().panelPxPerSecond).toBe(70);

		store.getState().setPanelZoom(239);
		store.getState().zoomPanel(1);
		expect(store.getState().panelPxPerSecond).toBe(240);

		localStorage.removeItem(panelZoomStorageKey);
	});
});

describe('scrub preview', () => {
	test('writes once per whole second a held finger crosses', () => {
		const store = configured();
		const written: Array<number | undefined> = [];

		store.subscribe((state) => {
			written.push(state.scrubPreviewSeconds);
		});
		for (const seconds of [65.2, 65.9, 66.1, undefined, undefined]) {
			store.getState().setScrubPreview(seconds);
		}

		expect(written).toStrictEqual([65, 66, undefined]);
	});
});
