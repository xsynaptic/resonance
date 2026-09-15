import type { PlayerRoot } from '#elements/player-root.ts';
import type { PlayerUrls, QueueItem } from '#types.ts';

import { labels } from '#components/test-labels.ts';
import { definePlayerElements } from '#elements/define.ts';
import { createFakeEngine } from '#engine/fake-engine.ts';
import { createPlayerStore } from '#store/player-store.ts';

const testUrls: PlayerUrls = {
	stream: ({ trackId }) => Promise.resolve({ status: 'ok', url: `https://api.test/${trackId}` }),
};

export function mount<Tag extends keyof HTMLElementTagNameMap>(
	tag: Tag,
	attributes: Record<string, string> = {},
	options: Partial<Pick<PlayerRoot, 'isArtworkEnabled' | 'isOverlayEnabled' | 'seekSeconds'>> = {},
) {
	// Defined first, so a root created here is upgraded before any part reads its options
	definePlayerElements();

	const fake = createFakeEngine();
	const store = createPlayerStore({ createEngine: fake.createEngine, isPersistent: false });
	const root = document.createElement('player-root');
	const part = document.createElement(tag);

	for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value);

	Object.assign(root, options);
	root.className = 'player';
	root.labels = labels;
	root.store = store;
	root.urls = testUrls;
	root.append(part);
	document.body.append(root);

	return { fake, part, root, store };
}

// No duration unless a test names one, so the clock can be seen waiting on metadata
export function queueItem(trackId: string, overrides: Partial<QueueItem> = {}): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Forest Signal',
		loudness: {},
		releaseTitle: 'Winter Transmissions',
		title: `Mix ${trackId}`,
		trackId,
		...overrides,
	};
}
