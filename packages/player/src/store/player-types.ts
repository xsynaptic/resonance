import type { CreateAudioEngine } from '#engine/audio-engine.ts';
import type {
	PlaybackDiagnostic,
	PlaybackError,
	PlayerStatus,
	PlayerTimeMode,
	PlayerUrls,
	QueuedItem,
	QueueItem,
} from '#types.ts';

// Property syntax so an element can select one action without tripping `unbound-method`
export interface PlayerActions {
	clearQueue: () => void;
	// Accepts the host's resolvers and nothing else; an unchanged object writes nothing
	configure: (config: { urls: PlayerUrls | undefined }) => void;
	// The element's own clock, far finer than the `timeupdate` behind `currentTimeSeconds`; read inside a rAF loop rather than subscribed to
	getCurrentTime: () => number | undefined;
	// Created on the first load, so an observer waits for it
	getMediaElement: () => HTMLMediaElement | undefined;
	// The root hydrates each store once, however often it reconnects
	hydratePreferences: () => void;
	// Positioned, with nothing loaded and nothing playing
	hydrateQueue: () => void;
	// Replaces the queue and unloads whatever played; nothing plays until a gesture asks
	loadQueue: (items: ReadonlyArray<QueueItem>) => void;
	// A shuffled play order moves with the item rather than reshuffling
	moveItem: (from: number, to: number) => void;
	next: () => void;
	pause: () => void;
	// Never pauses, for a remote that sends play and pause as separate actions
	play: () => void;
	playAt: (index: number) => void;
	playQueue: (items: ReadonlyArray<QueueItem>) => void;
	// Empty queue loads the whole release at the clicked track; a running queue appends that track and jumps to it
	playTrack: (releaseItems: ReadonlyArray<QueueItem>, itemId: string) => void;
	previous: () => void;
	// Appends the way `playTrack` does and stops there; a track already in the queue stays where it is
	queueTrack: (releaseItems: ReadonlyArray<QueueItem>, itemId: string) => void;
	// Swaps in the page's copy of every queued item it carries, so a queue restored from an older build picks up new fields
	refreshQueue: (items: ReadonlyArray<QueueItem>) => void;
	removeAt: (index: number) => void;
	seek: (seconds: number) => void;
	// Clamped into the loaded track, so the seek buttons and the lock screen cannot run past either end
	seekBy: (deltaSeconds: number) => void;
	setOverlayOpen: (isOpen: boolean) => void;
	setPanelOpen: (isOpen: boolean) => void;
	setTrayOpen: (isOpen: boolean) => void;
	// Clamped into 0..1; a level above zero ends a mute
	setVolume: (volume: number) => void;
	// Unmuting a level of zero lands at a quarter, so the press is never answered with silence
	toggleMuted: () => void;
	toggleOverlay: () => void;
	// Its open state is persisted, as the time mode is
	togglePanel: () => void;
	togglePaused: () => void;
	toggleShuffle: () => void;
	toggleTimeMode: () => void;
	toggleTray: () => void;
	zoomPanel: (steps: number) => void;
}

export interface PlayerState {
	// Index into `queue`, not `playOrder`
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	// A fresh object per report, so its identity marks each one; never persisted
	diagnostic: PlaybackDiagnostic | undefined;
	durationSeconds: number | undefined;
	// Beside `volume` rather than a volume of zero, so an unmute after a reload returns to the level
	isMuted: boolean;
	isOverlayOpen: boolean;
	isPanelOpen: boolean;
	// Intent, as `HTMLMediaElement.paused` is: false from the press, before any sound
	isPaused: boolean;
	isShuffling: boolean;
	isTrayOpen: boolean;
	// How many CSS pixels of the panel one second of audio takes
	panelPxPerSecond: number;
	// The last terminal failure, cleared as a new load starts
	playbackError: PlaybackError | undefined;
	// A permutation of queue indices
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
