import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { QueueItem } from '#types.ts';

import { bindMediaSession } from '#engine/media-session.ts';
import { createPlayerStore } from '#store/player-store.ts';

// jsdom carries no media session, so the projection is read off a stand-in
interface FakeMediaSession {
	handlers: Map<string, MediaSessionActionHandler>;
	metadata: MediaMetadata | null;
	playbackState: MediaSessionPlaybackState;
	setActionHandler: (action: string, handler: MediaSessionActionHandler | null) => void;
}

function createFakeMediaSession(): FakeMediaSession {
	const handlers = new Map<string, MediaSessionActionHandler>();

	return {
		handlers,
		// eslint-disable-next-line unicorn/no-null -- matching the platform API this stands in for
		metadata: null,
		playbackState: 'none',
		setActionHandler: (action, handler) => {
			if (handler === null) {
				handlers.delete(action);
				return;
			}

			handlers.set(action, handler);
		},
	};
}

function makeItem(trackId: string): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		loudness: {},
		releaseTitle: 'Cosmic Drift',
		title: `Track ${trackId}`,
		trackId,
	};
}

const release = [makeItem('a'), makeItem('b')];

let mediaSession: FakeMediaSession;

function loadedStore() {
	const store = createPlayerStore({
		createEngine: () => ({
			analyser: vi.fn(),
			currentTime: vi.fn(() => 0),
			load: vi.fn(() => Promise.resolve()),
			outputDelay: vi.fn(() => 0),
			pause: vi.fn(),
			play: vi.fn(() => Promise.resolve()),
			prepare: vi.fn(),
			reset: vi.fn(),
			seek: vi.fn(),
			setVolume: vi.fn(),
		}),
	});

	store.getState().configure({
		urls: {
			stream: () => Promise.resolve({ status: 'ok', url: 'https://api.test/a' }),
			waveform: () => Promise.resolve(undefined),
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
});
