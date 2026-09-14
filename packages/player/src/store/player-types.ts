import type { CreateAudioEngine } from '#engine/audio-engine.ts';
import type {
	PlaybackError,
	PlayerStatus,
	PlayerTimeMode,
	PlayerUrls,
	QueuedItem,
	QueueItem,
} from '#types.ts';

// Property syntax so a component can select one action without tripping `unbound-method`
export interface PlayerActions {
	clearQueue: () => void;
	// Accepts the host's resolvers and nothing else; a host passing an inline object re-runs it on every render
	configure: (config: { urls: PlayerUrls | undefined }) => void;
	// Read inside a rAF loop, never as a render input
	getAnalyser: () => AnalyserNode | undefined;
	// The element's own clock, far finer than the `timeupdate` behind `currentTimeSeconds`; also rAF-only
	getCurrentTime: () => number | undefined;
	// Seconds the element's clock runs ahead of the sound; a display reading that clock owes this back
	getOutputDelay: () => number;
	// Reads the listener's persisted preferences; separate from `configure` so a re-render cannot re-run it
	hydratePreferences: () => void;
	// Puts back the queue this browser left: positioned, with nothing loaded and nothing playing
	hydrateQueue: () => void;
	// Replaces the queue without touching the engine; nothing plays until a gesture asks
	loadQueue: (items: ReadonlyArray<QueueItem>) => void;
	// Refused on a sectioned queue, the way shuffle is; a shuffled play order moves with the item rather than reshuffling
	moveItem: (from: number, to: number) => void;
	next: () => void;
	pause: () => void;
	// Never pauses, for a remote that sends play and pause as separate actions
	play: () => void;
	playAt: (index: number) => void;
	// Replaces the queue with these items and plays from the top
	playQueue: (items: ReadonlyArray<QueueItem>) => void;
	// Empty queue plays from the top; a running queue appends every track and jumps to the first appended
	playRelease: (releaseItems: ReadonlyArray<QueueItem>) => void;
	// Empty queue loads the whole release at the clicked track; a running queue appends that track and jumps to it
	playTrack: (
		releaseItems: ReadonlyArray<QueueItem>,
		trackId: string,
		startSeconds?: number,
	) => void;
	previous: () => void;
	// Appends the way `playTrack` does and stops there; a track already in the queue stays where it is
	queueTrack: (releaseItems: ReadonlyArray<QueueItem>, trackId: string) => void;
	removeAt: (index: number) => void;
	// Swaps out everything after `index`, leaving the loaded track and what came before it alone
	replaceAfter: (index: number, items: ReadonlyArray<QueueItem>) => void;
	seek: (seconds: number) => void;
	// Clamped into the loaded track, so the skip buttons and the lock screen cannot run past either end
	seekBy: (deltaSeconds: number) => void;
	setOverlayOpen: (isOpen: boolean) => void;
	setVolume: (volume: number) => void;
	stop: () => void;
	// Drops to silence and back to the level held at the last mute, or to full before any mute
	toggleMute: () => void;
	toggleOverlay: () => void;
	// The scrolling detail panel above the bar; session state, not a persisted preference
	togglePanel: () => void;
	togglePlay: () => void;
	toggleShuffle: () => void;
	toggleTimeMode: () => void;
	toggleTray: () => void;
	zoomPanel: (steps: number) => void;
}

export interface PlayerState {
	// Index into `queue`, not `playOrder`
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	durationSeconds: number | undefined;
	isOverlayOpen: boolean;
	isPanelOpen: boolean;
	isPlayIntended: boolean;
	isShuffling: boolean;
	isTrayOpen: boolean;
	// How many CSS pixels of the panel one second of audio takes
	panelPxPerSecond: number;
	// The last terminal failure, cleared as a new load starts
	playbackError: PlaybackError | undefined;
	// A permutation of queue indices; reshuffled when shuffle toggles or items are appended
	playOrder: Array<number>;
	queue: Array<QueuedItem>;
	status: PlayerStatus;
	// A listener preference rather than playback state, so it is persisted beside the volume
	timeMode: PlayerTimeMode;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
	volume: number;
}

export type PlayerStore = PlayerActions & PlayerState;

export interface PlayerStoreOptions {
	createEngine?: CreateAudioEngine | undefined;
	// Off for a secondary mount, which must neither show the listener's saved queue and volume nor write over them
	isPersistent?: boolean | undefined;
}
