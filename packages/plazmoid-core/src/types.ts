import type { PeaksDescriptor } from '@xsynaptic/plazmoid-wavedata';

// Reported beside the statuses, never in place of one
export type EngineDiagnostic = MediaSnapshot &
	(
		| { bufferedAheadSeconds: number; hasPlayed: boolean; kind: 'stall' }
		| { code?: number; kind: 'media-error'; message: string }
		| { isActivationLive?: boolean; kind: 'play-rejected'; message: string; name: string }
		| { kind: 'retry-recovered'; stage: PlaybackErrorStage }
	);

export type PlaybackDiagnostic = EngineDiagnostic & { isRetry: boolean; trackId: string };

export interface PlaybackError {
	stage: PlaybackErrorStage;
	trackId: string;
}

export type PlaybackErrorStage = 'decode' | 'network' | 'resolve' | 'unsupported';

// `capped` and `unplayable` are terminal like `error`: the resolver declined, or a load failed on a type the browser's probe had rejected
export type PlayerStatus =
	'capped' | 'error' | 'idle' | 'loading' | 'paused' | 'playing' | 'unplayable';

// Each resolver is handed the track as the host queued it, its own extra fields included, even after a reload
export interface PlayerUrls {
	// `undefined` settles on a plain groove and the panel's grid; a rejection draws the same and is asked again
	detail?: ((track: Track) => Promise<TrackDetail | undefined>) | undefined;
	stream: (track: Track) => Promise<StreamResolution>;
}

// One square rendition; `width` is its size in pixels
export interface TrackArtwork {
	src: string;
	type?: string;
	width: number;
}

// One timestamped track in a mix, resolved at build time because the browser has no artists catalog
export interface CuePoint {
	// Empty where the track carries no credit
	artistLine: string;
	startSeconds: number;
	title: string;
}

// The store stamps an id as tracks are enqueued, so a row keeps its node across a reorder
export interface QueuedTrack extends Track {
	queueId: string;
}

export interface Track {
	artistLine: string;
	// Ascending by width
	artwork?: ReadonlyArray<TrackArtwork>;
	durationMs?: number;
	// Absent renders the title as plain text
	releaseHref?: string;
	releaseTitle: string;
	title: string;
	trackId: string;
}

export interface TrackDetail {
	// Timestamped tracks, in order
	cuePoints?: ReadonlyArray<CuePoint>;
	peaks?: PeaksDescriptor;
	// The whole tracklist, so a mix indexed in part can say where the index runs out
	trackCount?: number;
	// Base64 of one byte per bucket, 255 at the loudest; absent draws a plain groove
	waveformOverview?: string;
}

// `type` is a MIME type with codecs, probed before loading; absent skips the probe
export type StreamResolution = { status: 'capped' } | { status: 'ok'; type?: string; url: string };

interface MediaSnapshot {
	networkState: number;
	positionSeconds: number;
	readyState: number;
}
