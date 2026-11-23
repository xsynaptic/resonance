export interface PlayerLabels {
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
	scope: string;
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
	waveformSeek: string;
	zoomIn: string;
	zoomOut: string;
}

export type PlayerTimeMode = 'elapsed' | 'remaining';
