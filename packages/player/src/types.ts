export interface PlaybackError {
	stage: PlaybackErrorStage;
	trackId: string;
}

export type PlaybackErrorStage = 'decode' | 'network' | 'resolve' | 'unsupported';

export interface PlayerLabels {
	capped: string;
	clearQueue: string;
	collapse: string;
	empty: string;
	error: string;
	expand: string;
	loading: string;
	// Carries `{position}` and `{total}`, filled in as a row lands
	moved: string;
	mute: string;
	next: string;
	nowPlaying: string;
	pause: string;
	play: string;
	playlist: string;
	previous: string;
	queue: string;
	removeFromQueue: string;
	reorder: string;
	seek: string;
	shuffle: string;
	skipBack: string;
	skipForward: string;
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

// `capped` is terminal like `error`, but nothing failed: the host's resolver declined to serve the track
// `unplayable` is terminal the same way: the browser declined the format the host resolved
export type PlayerStatus =
	'capped' | 'error' | 'idle' | 'loading' | 'paused' | 'playing' | 'unplayable';

export type PlayerTimeMode = 'elapsed' | 'remaining';

// The host owns its route shapes, so the package asks for a track's URLs rather than deriving them
export interface PlayerUrls {
	// Full-resolution `.dat`, range-requested a window at a time; `undefined` leaves the panel on its grid
	archive?: ((trackId: string) => Promise<string | undefined>) | undefined;
	stream: (trackId: string) => Promise<StreamResolution>;
}

// One square rendition, `width` its size in pixels; the host builds the URL, the player only lists it
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

// The store stamps an id as items are enqueued, so a row keeps its React identity across a reorder
export interface QueuedItem extends QueueItem {
	queueId: string;
}

export interface QueueItem {
	albumLoudness: QueueLoudness;
	artistLine: string;
	// Ascending by width
	artwork?: ReadonlyArray<QueueArtwork>;
	// Timestamped tracks in order; the panel draws a boundary at each one
	cuePoints?: ReadonlyArray<QueueCuePoint>;
	durationMs?: number;
	loudness: QueueLoudness;
	// Absent renders the title as plain text
	releaseHref?: string;
	releaseTitle: string;
	// A heading the tray draws above this item; a queue carrying any of these cannot shuffle
	sectionLabel?: string;
	title: string;
	// The whole tracklist, so a mix indexed in part can say where the index runs out
	trackCount?: number;
	trackId: string;
	// Normalized 0..1 peak per bucket; absent falls back to a range input
	waveformOverview?: ReadonlyArray<number>;
}

// Either value missing plays at unity
export interface QueueLoudness {
	integratedLufs?: number;
	truePeakDbtp?: number;
}

// `type` is a MIME type with codecs, probed before loading; absent skips the probe
export type StreamResolution = { status: 'capped' } | { status: 'ok'; type?: string; url: string };

export type SubscribeTime = (onTime: (currentTimeSeconds: number) => void) => () => void;
