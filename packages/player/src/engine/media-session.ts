import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerStatus, QueuedItem } from '#types.ts';

import { loadedItem } from '#store/selectors.ts';

const defaultSeekSeconds = 10;
const mediaSessionArtworkMaxWidth = 512;

// Firefox on Android re-requests Android audio focus on every position report, so one is owed only where the platform is wrong
const positionToleranceSeconds = 2;

// Firefox on Android drops metadata sent before the element counts as audible, and resends none when its controller reactivates
const metadataResendSeconds = 2;

interface ReportedPosition {
	atMilliseconds: number;
	duration: number;
	isAdvancing: boolean;
	position: number;
}

export function bindMediaSession(
	store: StoreApi<PlayerStore>,
	seekSeconds = defaultSeekSeconds,
): () => void {
	if (!('mediaSession' in navigator))
		return () => {
			// Nothing was claimed
		};

	const actions = bindActions(store, seekSeconds);

	let boundQueueId: string | undefined;
	let boundState: MediaSessionPlaybackState | undefined;
	let reported: ReportedPosition | undefined;
	let resendFromSeconds: number | undefined;

	const reportPosition = (state: PlayerStore, playbackState: MediaSessionPlaybackState): void => {
		const position = positionStateFor(state);

		if (position === undefined) {
			if (reported === undefined) return;

			reported = undefined;
			navigator.mediaSession.setPositionState();
			return;
		}

		const isAdvancing = playbackState === 'playing';
		if (!hasLeftProjection(reported, position, isAdvancing)) return;

		reported = {
			atMilliseconds: Date.now(),
			duration: position.duration,
			isAdvancing,
			position: position.position,
		};
		navigator.mediaSession.setPositionState(position);
	};

	const project = (state: PlayerStore): void => {
		const item = loadedItem(state);

		if (item?.queueId !== boundQueueId) {
			boundQueueId = item?.queueId;
			// A switch mid-play passes only through loading, so the next track's start would read as no change
			boundState = undefined;
			reported = undefined;
			setMetadata(item);
		}

		// Loading is a step on the way to a state, not one of its own
		if (state.status === 'loading') return;

		const playbackState = playbackStateFor(state.status);

		if (playbackState !== boundState) {
			boundState = playbackState;
			resendFromSeconds = undefined;

			if (playbackState === 'playing') {
				resendFromSeconds = state.currentTimeSeconds;
				setMetadata(item);
			}

			navigator.mediaSession.playbackState = playbackState;
		}

		if (isResendDue(resendFromSeconds, state.currentTimeSeconds)) {
			resendFromSeconds = undefined;
			setMetadata(item);
		}

		reportPosition(state, playbackState);
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

function bindActions(store: StoreApi<PlayerStore>, seekSeconds: number): Array<MediaSessionAction> {
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
				store.getState().seekBy(-(details.seekOffset ?? seekSeconds));
			},
		],
		[
			'seekforward',
			(details) => {
				store.getState().seekBy(details.seekOffset ?? seekSeconds);
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

function hasLeftProjection(
	reported: ReportedPosition | undefined,
	position: Required<MediaPositionState>,
	isAdvancing: boolean,
): boolean {
	if (reported === undefined) return true;
	if (reported.isAdvancing !== isAdvancing || reported.duration !== position.duration) return true;

	const elapsedSeconds = isAdvancing ? (Date.now() - reported.atMilliseconds) / 1000 : 0;

	return (
		Math.abs(position.position - (reported.position + elapsedSeconds)) > positionToleranceSeconds
	);
}

function isResendDue(fromSeconds: number | undefined, currentSeconds: number): boolean {
	if (fromSeconds === undefined) return false;

	return Math.abs(currentSeconds - fromSeconds) >= metadataResendSeconds;
}

function playbackStateFor(status: PlayerStatus): MediaSessionPlaybackState {
	if (status === 'playing') return 'playing';
	if (status === 'idle') return 'none';

	return 'paused';
}

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

	const artwork = (item.artwork ?? []).findLast(
		({ width }) => width <= mediaSessionArtworkMaxWidth,
	);

	navigator.mediaSession.metadata = new MediaMetadata({
		album: item.releaseTitle,
		artist: item.artistLine,
		artwork:
			artwork === undefined
				? []
				: [
						{
							sizes: `${String(artwork.width)}x${String(artwork.width)}`,
							src: artwork.src,
							...(artwork.type === undefined ? {} : { type: artwork.type }),
						},
					],
		title: item.title,
	});
}
