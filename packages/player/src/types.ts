export interface PlaybackError {
	itemId: string;
	stage: PlaybackErrorStage;
}

export type PlaybackErrorStage = 'decode' | 'network' | 'resolve' | 'unsupported';

export interface PlayerLabels {
	addToQueue: string;
	capped: string;
	clearQueue: string;
	close: string;
	empty: string;
	error: string;
	expand: string;
	lists: string;
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
	seekBack: string;
	seekForward: string;
	// Carries `{current}` and `{duration}`, spoken by the time slider as the position moves
	seekPosition: string;
	shuffle: string;
	timestampsPartial: string;
	toggleTimeMode: string;
	tracklist: string;
	unmute: string;
	unplayable: string;
	volume: string;
	waveformPanel: string;
	zoomIn: string;
	zoomOut: string;
}

// `capped` and `unplayable` are terminal like `error`: the resolver declined, or a load failed on a type the browser's probe had rejected
export type PlayerStatus =
	'capped' | 'error' | 'idle' | 'loading' | 'paused' | 'playing' | 'unplayable';

export type PlayerTimeMode = 'elapsed' | 'remaining';

// Each resolver is handed the item as the host queued it, its own extra fields included, even after a reload
export interface PlayerUrls {
	// Full-resolution `.dat`, range-requested a window at a time; `undefined` leaves the panel on its grid
	archive?: ((item: QueueItem) => Promise<string | undefined>) | undefined;
	stream: (item: QueueItem) => Promise<StreamResolution>;
}

// One square rendition; `width` is its size in pixels
export interface QueueArtwork {
	src: string;
	width: number;
}

// One timestamped track in a mix, resolved at build time because the browser has no artists catalog
export interface QueueCuePoint {
	// Empty where the track carries no credit
	artistLine: string;
	startSeconds: number;
	title: string;
}

// The store stamps an id as items are enqueued, so a row keeps its node across a reorder
export interface QueuedItem extends QueueItem {
	queueId: string;
}

export interface QueueItem {
	artistLine: string;
	// Ascending by width
	artwork?: ReadonlyArray<QueueArtwork>;
	// Timestamped tracks, in order
	cuePoints?: ReadonlyArray<QueueCuePoint>;
	durationMs?: number;
	itemId: string;
	// Absent renders the title as plain text
	releaseHref?: string;
	releaseTitle: string;
	title: string;
	// The whole tracklist, so a mix indexed in part can say where the index runs out
	trackCount?: number;
	// Normalized 0..1 peak per bucket; absent falls back to a range input
	waveformOverview?: ReadonlyArray<number>;
}

// `type` is a MIME type with codecs, probed before loading; absent skips the probe
export type StreamResolution = { status: 'capped' } | { status: 'ok'; type?: string; url: string };

export type SubscribeTime = (onTime: (currentTimeSeconds: number) => void) => () => void;
