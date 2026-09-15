import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerStatus, QueuedItem } from '#types.ts';

const defaultSkipSeconds = 10;
const mediaSessionArtworkMaxWidth = 512;

export function bindMediaSession(
	store: StoreApi<PlayerStore>,
	skipSeconds = defaultSkipSeconds,
): () => void {
	if (!('mediaSession' in navigator))
		return () => {
			// Nothing was claimed
		};

	const actions = bindActions(store, skipSeconds);

	let boundQueueId: string | undefined;
	let boundState: MediaSessionPlaybackState | undefined;
	let boundPositionKey: string | undefined;

	const project = (state: PlayerStore): void => {
		const item = state.currentIndex === undefined ? undefined : state.queue[state.currentIndex];

		if (item?.queueId !== boundQueueId) {
			boundQueueId = item?.queueId;
			setMetadata(item);
		}

		// Loading is a step on the way to a state, not one of its own
		if (state.status === 'loading') return;

		const playbackState = playbackStateFor(state.status);

		if (playbackState !== boundState) {
			boundState = playbackState;
			navigator.mediaSession.playbackState = playbackState;
		}

		const position = positionStateFor(state);
		const positionKey = positionKeyFor(position, playbackState);
		if (positionKey === boundPositionKey) return;

		boundPositionKey = positionKey;
		navigator.mediaSession.setPositionState(position);
	};

	project(store.getState());

	const unsubscribe = store.subscribe(project);

	return () => {
		unsubscribe();

		for (const action of actions) didSetHandler(action, undefined);

		setMetadata(undefined);
		navigator.mediaSession.setPositionState();
		navigator.mediaSession.playbackState = 'none';
	};
}

function bindActions(store: StoreApi<PlayerStore>, skipSeconds: number): Array<MediaSessionAction> {
	const bindings: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
		[
			'play',
			() => {
				store.getState().play();
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
				store.getState().seekBy(-(details.seekOffset ?? skipSeconds));
			},
		],
		[
			'seekforward',
			(details) => {
				store.getState().seekBy(details.seekOffset ?? skipSeconds);
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

// Whole seconds are enough: the platform advances the position itself while playing
function positionKeyFor(
	position: Required<MediaPositionState> | undefined,
	playbackState: MediaSessionPlaybackState,
): string | undefined {
	if (position === undefined) return undefined;

	return `${playbackState}:${String(position.duration)}:${String(Math.floor(position.position))}`;
}

// The platform throws on a position past the duration
function positionStateFor({
	currentTimeSeconds,
	durationSeconds,
	status,
}: PlayerStore): Required<MediaPositionState> | undefined {
	if (status === 'idle' || durationSeconds === undefined || durationSeconds <= 0) return undefined;

	return {
		duration: durationSeconds,
		playbackRate: 1,
		position: Math.min(durationSeconds, Math.max(0, currentTimeSeconds)),
	};
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
		// WebKit has been reported to take the first entry
		artwork: (item.artwork ?? [])
			.filter(({ width }) => width <= mediaSessionArtworkMaxWidth)
			.toReversed()
			.map(({ src, width }) => ({
				sizes: `${String(width)}x${String(width)}`,
				src,
			})),
		title: item.title,
	});
}
