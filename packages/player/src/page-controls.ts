import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { Track } from '#types.ts';

import {
	controlSelector,
	cueCurrentAttribute,
	cueSecondsAttribute,
	cueTrackAttribute,
	heldPressAttribute,
	heldPressSelector,
	loadedAttribute,
	payloadAttribute,
	payloadSelector,
	playingAttribute,
	playTrackAttribute,
	playTracksAttribute,
	queuedAttribute,
	queueTrackAttribute,
	trackIdAttribute,
} from '#constants.ts';
import { bind } from '#lib/bind.ts';
import { currentCue, loadedTrack } from '#store/selectors.ts';

// The resolved press, so a host reads the verb rather than re-deriving it from the DOM
export interface ControlPress {
	trackIds: Array<string>;
	verb: 'play-track' | 'play-tracks' | 'queue-track' | 'toggle-tracks';
}

export interface PageControls {
	refresh: () => void;
	unbind: () => void;
}

interface PageControlOptions {
	onPress?: ((press: ControlPress) => void) | undefined;
}

interface RowState {
	cueStartSeconds: number | undefined;
	isPlaying: boolean;
	queuedIds: string;
	trackId: string | undefined;
}

// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
export function bindPageControls(
	store: PlayerStoreApi,
	page: Document,
	{ onPress }: PageControlOptions = {},
): PageControls {
	const connection = new AbortController();
	const { signal } = connection;
	const readPayload = payloadReader(page);
	const selectRowState = rowStateSelector();

	const dispatchControl = (target: Element | undefined): void => {
		const control = target?.closest(controlSelector);
		const tracks = control ? readPayload() : undefined;
		if (!control || !tracks) return;

		const press = pressControl(store.getState(), control, tracks);

		if (press) onPress?.(press);
	};

	// A queue restored from storage can predate this build; a press on a track already queued jumps to the stored copy
	const refreshQueue = (): void => {
		const tracks = readPayload();
		if (tracks) store.getState().refreshQueue(tracks);
	};

	refreshQueue();
	bind(
		store,
		selectRowState,
		(rowState) => {
			markRows(page, rowState);
		},
		signal,
	);
	page.addEventListener(
		'click',
		(event) => {
			dispatchControl(event.target instanceof Element ? event.target : undefined);
		},
		{ signal },
	);

	const held = page.querySelector(heldPressSelector);

	held?.removeAttribute(heldPressAttribute);
	dispatchControl(held ?? undefined);

	return {
		refresh: () => {
			refreshQueue();
			markRows(page, selectRowState(store.getState()));
		},
		unbind: () => {
			connection.abort();
		},
	};
}

function attribute(element: Element, name: string): string | undefined {
	return element.getAttribute(name) ?? undefined;
}

function isTunedIn(groupIds: string, trackId: string | undefined): boolean {
	return trackId !== undefined && groupIds.split(' ').includes(trackId);
}

function markCueRows(page: Document, { cueStartSeconds, trackId }: RowState): void {
	for (const list of page.querySelectorAll(`[${CSS.escape(cueTrackAttribute)}]`)) {
		const isLoaded = trackId !== undefined && attribute(list, cueTrackAttribute) === trackId;

		for (const row of list.querySelectorAll(`[${CSS.escape(cueSecondsAttribute)}]`)) {
			row.toggleAttribute(
				cueCurrentAttribute,
				isLoaded && Number(attribute(row, cueSecondsAttribute)) === cueStartSeconds,
			);
		}
	}
}

function markTrackGroups(page: Document, { isPlaying, trackId }: RowState): void {
	for (const group of page.querySelectorAll(`[${CSS.escape(playTracksAttribute)}]`)) {
		group.toggleAttribute(
			playingAttribute,
			isPlaying && isTunedIn(attribute(group, playTracksAttribute) ?? '', trackId),
		);
	}
}

function markRows(page: Document, state: RowState): void {
	markTrackRows(page, state);
	markCueRows(page, state);
	markTrackGroups(page, state);
}

function markTrackRows(page: Document, { isPlaying, queuedIds, trackId }: RowState): void {
	const queued = new Set(queuedIds.split(' '));

	for (const row of page.querySelectorAll(`[${CSS.escape(trackIdAttribute)}]`)) {
		const rowTrackId = attribute(row, trackIdAttribute);
		const isLoaded = trackId !== undefined && rowTrackId === trackId;
		const isQueued = rowTrackId !== undefined && queued.has(rowTrackId);

		row.toggleAttribute(loadedAttribute, isLoaded);
		row.toggleAttribute(playingAttribute, isLoaded && isPlaying);
		row.toggleAttribute(queuedAttribute, isQueued);

		// The verb only adds, so a queued track leaves the button nothing to do
		for (const button of row.querySelectorAll<HTMLButtonElement>(
			`[${CSS.escape(queueTrackAttribute)}]`,
		)) {
			button.disabled = isQueued;
		}
	}
}

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function payloadReader(page: Document): () => Array<Track> | undefined {
	let parsedSource: string | undefined;
	let parsedTracks: Array<Track> | undefined;

	return () => {
		const payload = page.querySelector(payloadSelector)?.getAttribute(payloadAttribute);
		if (!payload) return;
		if (payload === parsedSource) return parsedTracks;

		parsedSource = payload;

		try {
			parsedTracks = JSON.parse(payload) as Array<Track>;
		} catch {
			parsedTracks = undefined;
		}

		return parsedTracks;
	};
}

function tracksWithIds(ids: string, tracks: ReadonlyArray<Track>): Array<Track> {
	return ids
		.split(' ')
		.map((trackId) => tracks.find((track) => track.trackId === trackId))
		.filter((track) => track !== undefined);
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(
	state: PlayerStore,
	control: Element,
	tracks: Array<Track>,
): ControlPress | undefined {
	const playTracks = attribute(control, playTracksAttribute);

	if (playTracks !== undefined && isTunedIn(playTracks, loadedTrack(state)?.trackId)) {
		state.togglePaused();

		return { trackIds: playTracks.split(' '), verb: 'toggle-tracks' };
	}

	if (playTracks !== undefined) {
		const group = tracksWithIds(playTracks, tracks);

		state.playQueue(group);

		return { trackIds: group.map((track) => track.trackId), verb: 'play-tracks' };
	}

	const queueTrack = attribute(control, queueTrackAttribute);

	if (queueTrack) {
		state.queueTrack(tracks, queueTrack);

		return { trackIds: [queueTrack], verb: 'queue-track' };
	}

	const playTrack = attribute(control, playTrackAttribute);
	if (!playTrack) return undefined;

	state.playTrack(tracks, playTrack);

	return { trackIds: [playTrack], verb: 'play-track' };
}

function rowStateSelector(): (state: PlayerStore) => RowState {
	let joinedQueue: PlayerStore['queue'] | undefined;
	let queuedIds = '';

	return (state) => {
		if (state.queue !== joinedQueue) {
			joinedQueue = state.queue;
			queuedIds = state.queue.map((track) => track.trackId).join(' ');
		}

		return {
			cueStartSeconds: currentCue(state)?.startSeconds,
			// Intent rather than sound, matching the bar's play button
			isPlaying: !state.isPaused,
			queuedIds,
			trackId: loadedTrack(state)?.trackId,
		};
	};
}
