import { createMemoryStorage } from '@xsynaptic/plazmoid-core';
import { describe, expect, test } from 'vitest';

import { panelOpenStorageKey, panelZoomStorageKey, timeModeStorageKey } from '#constants.ts';
import { createViewStore } from '#view/view-store.ts';

describe('time mode', () => {
	test('persists the choice and restores it on reload', () => {
		createViewStore().getState().toggleTimeMode();

		expect(localStorage.getItem(timeModeStorageKey)).toBe('remaining');

		const restored = createViewStore();

		expect(restored.getState().timeMode).toBe('remaining');

		localStorage.removeItem(timeModeStorageKey);
	});

	test('ignores a stored value that is not a mode', () => {
		localStorage.setItem(timeModeStorageKey, 'sideways');

		const store = createViewStore();

		expect(store.getState().timeMode).toBe('elapsed');

		localStorage.removeItem(timeModeStorageKey);
	});
});

describe('panel state', () => {
	test('persists the open state and restores it on reload', () => {
		createViewStore().getState().togglePanel();

		expect(localStorage.getItem(panelOpenStorageKey)).toBe('true');

		const restored = createViewStore();

		expect(restored.getState().isPanelOpen).toBe(true);

		localStorage.removeItem(panelOpenStorageKey);
	});

	test('persists the zoom step and restores it on reload', () => {
		createViewStore().getState().zoomPanel(1);

		expect(localStorage.getItem(panelZoomStorageKey)).toBe('105');

		const restored = createViewStore();

		expect(restored.getState().panelPxPerSecond).toBe(105);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test('persists a zoom between two steps and restores it on reload', () => {
		createViewStore().getState().setPanelZoom(83.25);

		expect(localStorage.getItem(panelZoomStorageKey)).toBe('83.25');
		expect(createViewStore().getState().panelPxPerSecond).toBe(83.25);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test.each(['19', '241', 'wide'])('ignores a stored zoom of %s, outside the ladder', (stored) => {
		localStorage.setItem(panelZoomStorageKey, stored);

		expect(createViewStore().getState().panelPxPerSecond).toBe(70);

		localStorage.removeItem(panelZoomStorageKey);
	});

	test('steps from between two steps to the nearest one in that direction', () => {
		const store = createViewStore();

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
		const store = createViewStore({ storage: createMemoryStorage() });
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
