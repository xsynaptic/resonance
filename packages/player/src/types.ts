export interface PlaybackError {
	stage: PlaybackErrorStage;
	trackId: string;
}

export type PlaybackErrorStage = 'decode' | 'network' | 'resolve' | 'unsupported';

export interface PlayerLabels {
	capped: string;
	clearQueue: string;
	empty: string;
	error: string;
	loading: string;
	// Carries `{position}` and `{total}`, filled in as a row lands
	moved: string;
	mute: string;
	next: string;
	nowPlaying: string;
	pause: string;
	play: string;
	previous: string;
	queue: string;
	removeFromQueue: string;
	reorder: string;
	seek: string;
	shuffle: string;
	skipBack: string;
	skipForward: string;
	toggleTimeMode: string;
	unmute: string;
	volume: string;
}

// `capped` is terminal like `error`, but nothing failed: the host's resolver declined to serve the track
export type PlayerStatus = 'capped' | 'error' | 'idle' | 'loading' | 'paused' | 'playing';

export type PlayerTimeMode = 'elapsed' | 'remaining';

// The host owns its route shapes, so the package asks for a track's URLs rather than deriving them
export interface PlayerUrls {
	stream: (trackId: string) => Promise<StreamResolution>;
	// `undefined` keeps the seek bar on the inline overview
	waveform: (trackId: string) => Promise<string | undefined>;
}

// The store stamps an id as items are enqueued, so a row keeps its React identity across a reorder
export interface QueuedItem extends QueueItem {
	queueId: string;
}

export interface QueueItem {
	albumLoudness: QueueLoudness;
	artistLine: string;
	artworkUrl?: string;
	durationMs?: number;
	loudness: QueueLoudness;
	// Absent renders the title as plain text
	releaseHref?: string;
	releaseTitle: string;
	// A heading the tray draws above this item; a queue carrying any of these cannot shuffle
	sectionLabel?: string;
	title: string;
	trackId: string;
	// Normalized 0..1 peak per bucket; absent falls back to a range input
	waveformOverview?: ReadonlyArray<number>;
}

// Either value missing plays at unity
export interface QueueLoudness {
	integratedLufs?: number;
	truePeakDbtp?: number;
}

export type StreamResolution = { status: 'capped' } | { status: 'ok'; url: string };

export type SubscribeTime = (onTime: (currentTimeS: number) => void) => () => void;
