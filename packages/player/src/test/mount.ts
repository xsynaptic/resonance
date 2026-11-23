import type { StoreApi } from 'zustand/vanilla';

import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerUrls, Track, TrackDetail } from '#types.ts';

import { definePlayerElements } from '#elements/define.ts';
import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createMemoryStorage } from '#lib/storage.ts';
import { createWritablePlayerStore } from '#store/player-store.ts';
import { labels } from '#test/labels.ts';

const testUrls: PlayerUrls = {
	stream: ({ trackId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${trackId}` }),
};

export function landDetail(
	store: StoreApi<PlayerStore>,
	trackId: string,
	detail: TrackDetail,
): void {
	store.setState({ details: new Map(store.getState().details).set(trackId, detail) });
}

interface MountOptions {
	attributes?: Record<string, string>;
	root?: Partial<
		Pick<
			PlayerRoot,
			'isArtworkEnabled' | 'isOverlayEnabled' | 'isPanelEnabled' | 'isScopeEnabled' | 'labels'
		>
	>;
}

export function mount<Tag extends keyof HTMLElementTagNameMap>(
	tag: Tag,
	{ attributes = {}, root: rootProperties = {} }: MountOptions = {},
) {
	// Defined first, so a root created here is upgraded before any part reads its options
	definePlayerElements();

	const fake = createMockEngine();
	const store = createWritablePlayerStore({
		createEngine: fake.createEngine,
		storage: createMemoryStorage(),
	});
	const root = document.createElement('pzm-root');
	const part = document.createElement(tag);

	for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value);

	store.getState().configure({ urls: testUrls });
	root.labels = labels;
	Object.assign(root, rootProperties);
	root.store = store;
	root.append(part);
	document.body.append(root);

	return { fake, part, root, store };
}

// No duration unless a test names one, so the clock can be seen waiting on metadata
export function sampleTrack(trackId: string, overrides: Partial<Track> = {}): Track {
	return {
		artistLine: 'Forest Signal',
		releaseTitle: 'Winter Transmissions',
		title: `Mix ${trackId}`,
		trackId,
		...overrides,
	};
}
