import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerStatus, QueuedItem } from '#types.ts';

const defaultSeekOffsetSeconds = 10;

export function bindMediaSession(store: StoreApi<PlayerStore>): () => void {
	if (!('mediaSession' in navigator))
		return () => {
			// Nothing was claimed
		};

	const actions = bindActions(store);

	let boundQueueId: string | undefined;
	let boundState: MediaSessionPlaybackState | undefined;

	const project = ({ currentIndex, queue, status }: PlayerStore): void => {
		const item = currentIndex === undefined ? undefined : queue[currentIndex];

		if (item?.queueId !== boundQueueId) {
			boundQueueId = item?.queueId;
			setMetadata(item);
		}

		// Loading is a step on the way to a state, not one of its own
		if (status === 'loading') return;

		const playbackState = playbackStateFor(status);
		if (playbackState === boundState) return;

		boundState = playbackState;
		navigator.mediaSession.playbackState = playbackState;
	};

	project(store.getState());

	const unsubscribe = store.subscribe(project);

	return () => {
		unsubscribe();

		for (const action of actions) didSetHandler(action, undefined);

		setMetadata(undefined);
		navigator.mediaSession.playbackState = 'none';
	};
}

function bindActions(store: StoreApi<PlayerStore>): Array<MediaSessionAction> {
	const bindings: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
		[
			'play',
			() => {
				store.getState().togglePlay();
			},
		],
		[
			'pause',
			() => {
				store.getState().pause();
			},
		],
		[
			'previoustrack',
			() => {
				store.getState().previous();
			},
		],
		[
			'nexttrack',
			() => {
				store.getState().next();
			},
		],
		[
			'seekbackward',
			(details) => {
				store.getState().seekBy(-(details.seekOffset ?? defaultSeekOffsetSeconds));
			},
		],
		[
			'seekforward',
			(details) => {
				store.getState().seekBy(details.seekOffset ?? defaultSeekOffsetSeconds);
			},
		],
		[
			'seekto',
			(details) => {
				if (details.seekTime === undefined) return;

				store.getState().seek(details.seekTime);
			},
		],
	];

	return bindings
		.filter(([action, handler]) => didSetHandler(action, handler))
		.map(([action]) => action);
}

function didSetHandler(
	action: MediaSessionAction,
	handler: MediaSessionActionHandler | undefined,
): boolean {
	// Throws for an action the browser does not support
	try {
		// eslint-disable-next-line unicorn/no-null -- the platform API clears with null
		navigator.mediaSession.setActionHandler(action, handler ?? null);

		return true;
	} catch {
		return false;
	}
}

function playbackStateFor(status: PlayerStatus): MediaSessionPlaybackState {
	if (status === 'playing') return 'playing';
	if (status === 'idle') return 'none';

	return 'paused';
}

function setMetadata(item: QueuedItem | undefined): void {
	if (item === undefined) {
		// eslint-disable-next-line unicorn/no-null -- the platform API clears with null
		navigator.mediaSession.metadata = null;
		return;
	}

	navigator.mediaSession.metadata = new MediaMetadata({
		album: item.releaseTitle,
		artist: item.artistLine,
		artwork: item.artworkUrl ? [{ src: item.artworkUrl }] : [],
		title: item.title,
	});
}
