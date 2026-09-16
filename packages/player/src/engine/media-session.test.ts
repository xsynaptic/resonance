import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { QueueItem } from '#types.ts';

import { createFakeEngine } from '#engine/fake-engine.ts';
import { bindMediaSession } from '#engine/media-session.ts';
import { createPlayerStore } from '#store/player-store.ts';

// jsdom carries no media session, so the projection is read off a stand-in
interface FakeMediaSession {
	handlers: Map<string, MediaSessionActionHandler>;
	metadata: MediaMetadata | null;
	playbackState: MediaSessionPlaybackState;
	positions: Array<MediaPositionState | undefined>;
	setActionHandler: (action: string, handler: MediaSessionActionHandler | null) => void;
	setPositionState: (state?: MediaPositionState) => void;
}

function createFakeMediaSession(): FakeMediaSession {
	const handlers = new Map<string, MediaSessionActionHandler>();
	const positions: Array<MediaPositionState | undefined> = [];

	return {
		handlers,
		// eslint-disable-next-line unicorn/no-null -- matching the platform API this stands in for
		metadata: null,
		playbackState: 'none',
		positions,
		setActionHandler: (action, handler) => {
			if (handler === null) {
				handlers.delete(action);
				return;
			}

			handlers.set(action, handler);
		},
		setPositionState: (state) => {
			positions.push(state);
		},
	};
}

function makeItem(itemId: string): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		itemId,
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${itemId}`,
	};
}

const release = [makeItem('a'), makeItem('b')];

let mediaSession: FakeMediaSession;

function loadedStore() {
	const store = createPlayerStore({ createEngine: createFakeEngine().createEngine });

	store.getState().configure({
		urls: {
			stream: () => Promise.resolve({ status: 'ok', url: 'https://api.test/a' }),
		},
	});
	store.getState().loadQueue(release);

	return store;
}

function setStatus(store: ReturnType<typeof loadedStore>, status: PlayerStore['status']): void {
	store.setState({ status });
}

beforeEach(() => {
	mediaSession = createFakeMediaSession();
	vi.stubGlobal('navigator', Object.create(navigator, { mediaSession: { value: mediaSession } }));
	vi.stubGlobal(
		'MediaMetadata',
		class {
			init: MediaMetadataInit;

			constructor(init: MediaMetadataInit) {
				this.init = init;
			}
		},
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('bindMediaSession', () => {
	test('registers the transport actions the lock screen offers', () => {
		const store = loadedStore();
		const unbind = bindMediaSession(store);

		expect([...mediaSession.handlers.keys()]).toStrictEqual([
			'play',
			'pause',
			'previoustrack',
			'nexttrack',
			'seekbackward',
			'seekforward',
			'seekto',
		]);

		unbind();
		expect(mediaSession.handlers.size).toBe(0);
	});

	test('projects the loaded track as metadata', () => {
		const store = loadedStore();
		const unbind = bindMediaSession(store);

		store.setState({ currentIndex: 1 });

		expect(mediaSession.metadata).toMatchObject({
			init: { album: 'Cosmic Drift', artist: 'Nebula Drift', title: 'Track b' },
		});

		unbind();
		// eslint-disable-next-line unicorn/no-null -- the platform API clears with null
		expect(mediaSession.metadata).toBe(null);
	});

	test('hands over renditions up to 512px, largest first', () => {
		const store = loadedStore();
		const [first] = store.getState().queue;
		if (!first) throw new Error('The queue loaded nothing');

		bindMediaSession(store);
		store.setState({
			currentIndex: 0,
			queue: [
				{
					...first,
					artwork: [120, 240, 512, 900, 1800].map((width) => ({
						src: `/artwork-${String(width)}.webp`,
						width,
					})),
				},
			],
		});

		expect(mediaSession.metadata).toMatchObject({
			init: {
				artwork: [
					{ sizes: '512x512', src: '/artwork-512.webp' },
					{ sizes: '240x240', src: '/artwork-240.webp' },
					{ sizes: '120x120', src: '/artwork-120.webp' },
				],
			},
		});
	});

	test('maps every terminal status onto a playback state', () => {
		const store = loadedStore();

		bindMediaSession(store);
		store.setState({ currentIndex: 0 });

		setStatus(store, 'playing');
		expect(mediaSession.playbackState).toBe('playing');

		setStatus(store, 'paused');
		expect(mediaSession.playbackState).toBe('paused');

		setStatus(store, 'error');
		expect(mediaSession.playbackState).toBe('paused');

		setStatus(store, 'capped');
		expect(mediaSession.playbackState).toBe('paused');

		setStatus(store, 'idle');
		expect(mediaSession.playbackState).toBe('none');
	});

	test('leaves the playback state alone while loading', () => {
		const store = loadedStore();

		bindMediaSession(store);
		store.setState({ currentIndex: 0 });
		setStatus(store, 'playing');
		setStatus(store, 'loading');

		expect(mediaSession.playbackState).toBe('playing');
	});

	test('drives the store from a lock-screen action', () => {
		const store = loadedStore();

		bindMediaSession(store);
		store.setState({ currentIndex: 0 });
		mediaSession.handlers.get('nexttrack')?.({ action: 'nexttrack' });

		expect(store.getState().currentIndex).toBe(1);
	});

	test('projects the position on each whole second and each change of state', () => {
		const store = loadedStore();

		bindMediaSession(store);
		store.setState({
			currentIndex: 0,
			currentTimeSeconds: 12.3,
			durationSeconds: 600,
			status: 'playing',
		});
		store.setState({ currentTimeSeconds: 12.6 });
		store.setState({ currentTimeSeconds: 13.1 });
		store.setState({ status: 'paused' });
		store.setState({ status: 'idle' });

		expect(mediaSession.positions).toStrictEqual([
			{ duration: 600, playbackRate: 1, position: 12.3 },
			{ duration: 600, playbackRate: 1, position: 13.1 },
			{ duration: 600, playbackRate: 1, position: 13.1 },
			undefined,
		]);
	});

	test('seeks by the host interval where the platform names no offset', () => {
		const store = loadedStore();

		bindMediaSession(store, 30);
		store.setState({ currentIndex: 0, currentTimeSeconds: 100, durationSeconds: 600 });
		mediaSession.handlers.get('seekbackward')?.({ action: 'seekbackward' });

		expect(store.getState().currentTimeSeconds).toBe(70);
	});
});
