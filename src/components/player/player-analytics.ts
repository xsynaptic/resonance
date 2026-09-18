import type { ControlPress, createPlayerStore, PlayerStatus } from '@xsynaptic/player';

import { LazyModuleError, loadedItem } from '@xsynaptic/player';

import { trackEvent } from '#components/main/main-analytics.ts';
import { isOptedOut } from '#components/player/player-opt-out.ts';

interface PlayerGate {
	isOverlayOpen: boolean;
	isPanelOpen: boolean;
	status: PlayerStatus;
}

type PlayerState = ReturnType<ReturnType<typeof createPlayerStore>['getState']>;

const origins = {
	'play-playlist': 'playlist',
	'play-release': 'release',
	'play-track': 'mix',
} as const;

// Nothing failed on `capped` or `unplayable`, so neither carries a stage
const terminalStatuses: ReadonlySet<PlayerStatus> = new Set(['capped', 'error', 'unplayable']);

// Read once, since none of the three can change while the document is open
const isSuppressed = import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut();

export function bindPlayerAnalytics(store: ReturnType<typeof createPlayerStore>): () => void {
	if (isSuppressed) return doNothing;

	const connection = new AbortController();

	let gate = selectGate(store.getState());

	// Selected and compared rather than read straight, since `currentTimeSeconds` moves about four times a second
	const unsubscribe = store.subscribe((state) => {
		const next = selectGate(state);
		if (isSameGate(gate, next)) return;

		const previous = gate;

		gate = next;
		trackTransitions(previous, next, state);
	});

	window.addEventListener('error', trackChunkError, { signal: connection.signal });

	return () => {
		connection.abort();
		unsubscribe();
	};
}

export function trackControlPress({ itemIds, verb }: ControlPress): void {
	if (isSuppressed || verb === 'toggle-playlist') return;

	// Every other verb plays from the top of what it queued, so the first id is the Mix that starts
	const mix = itemIds[0];
	if (mix === undefined) return;

	if (verb === 'queue-track') {
		trackEvent('player-queue-add', { mix });
		return;
	}

	trackEvent('player-play', { mix, origin: origins[verb] });
}

function doNothing(): void {
	// Nothing was bound, so there is nothing to unbind
}

function isSameGate(left: PlayerGate, right: PlayerGate): boolean {
	return (
		left.isOverlayOpen === right.isOverlayOpen &&
		left.isPanelOpen === right.isPanelOpen &&
		left.status === right.status
	);
}

function selectGate(state: PlayerState): PlayerGate {
	return {
		isOverlayOpen: state.isOverlayOpen,
		isPanelOpen: state.isPanelOpen,
		status: state.status,
	};
}

function trackChunkError(event: ErrorEvent): void {
	const error: unknown = event.error;
	if (!(error instanceof LazyModuleError)) return;

	trackEvent('player-chunk-error', { chunk: error.chunk, reason: error.reason });
}

function trackPlaybackError(state: PlayerState): void {
	const { playbackError } = state;
	const data: Record<string, string> = { status: state.status };
	const itemId = loadedItem(state)?.itemId;

	if (itemId !== undefined) data.mix = itemId;
	if (playbackError) data.stage = playbackError.stage;

	trackEvent('player-error', data);
}

function trackTransitions(previous: PlayerGate, next: PlayerGate, state: PlayerState): void {
	if (next.isPanelOpen && !previous.isPanelOpen) trackEvent('player-panel-open');
	if (next.isOverlayOpen && !previous.isOverlayOpen) trackEvent('player-overlay-open');
	if (next.status !== previous.status && terminalStatuses.has(next.status)) {
		trackPlaybackError(state);
	}
}
