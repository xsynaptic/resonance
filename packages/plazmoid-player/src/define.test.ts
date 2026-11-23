import { getByRole } from '@testing-library/dom';
import { createMemoryStorage, createPlayerStore } from '@xsynaptic/plazmoid-core';
import { describe, expect, test } from 'vitest';

import { defaultLabels } from '#labels.ts';
import { createViewStore } from '#view/view-store.ts';

type PartName<Tag = keyof HTMLElementTagNameMap> = Tag extends `pzm-${infer Name}` ? Name : never;

const partNames = {
	'artist-line': true,
	artwork: true,
	bar: true,
	'cue-list': true,
	'mute-button': true,
	overlay: true,
	'overlay-content': true,
	'overlay-toggle': true,
	panel: true,
	'panel-toggle': true,
	'panel-zoom': true,
	'play-button': true,
	progress: true,
	'queue-actions': true,
	'queue-button': true,
	root: true,
	scope: true,
	'scrub-readout': true,
	'seek-button': true,
	status: true,
	'step-button': true,
	time: true,
	'time-slider': true,
	title: true,
	tray: true,
	volume: true,
} satisfies Record<PartName, true>;

const entries = import.meta.glob('./define/*.ts');

function byName(first: string, second: string): number {
	return first.localeCompare(second);
}

function partNameOf(path: string): string {
	return path.slice('./define/'.length, -'.ts'.length);
}

describe('the define entries', () => {
	test('registers a part from its own entry alone, with the control it renders', async () => {
		const root = Object.assign(document.createElement('pzm-root'), {
			labels: defaultLabels,
			store: createPlayerStore({ storage: createMemoryStorage() }),
			view: createViewStore({ storage: createMemoryStorage() }),
		});

		await import('#define/volume.ts');

		expect(customElements.get('pzm-root')).toBeUndefined();

		root.append(document.createElement('pzm-volume'));
		document.body.append(root);

		expect(getByRole(root, 'slider', { name: defaultLabels.volume })).toBeDefined();
		root.remove();
	});

	test('has one entry for each tag, named for it, and each registers that tag', async () => {
		const paths = Object.keys(entries);

		expect(paths.map((path) => partNameOf(path)).toSorted(byName)).toStrictEqual(
			Object.keys(partNames).toSorted(byName),
		);

		for (const path of paths) {
			await entries[path]?.();

			expect(customElements.get(`pzm-${partNameOf(path)}`), path).toBeDefined();
		}
	});
});
