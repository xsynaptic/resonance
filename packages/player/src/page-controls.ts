import type { PlayerStore, PlayerStoreApi } from '#store/player-types.ts';
import type { QueueItem } from '#types.ts';

import {
	controlSelector,
	cueCurrentAttribute,
	cueMixAttribute,
	cueSecondsAttribute,
	heldPressAttribute,
	heldPressSelector,
	loadedAttribute,
	payloadAttribute,
	payloadSelector,
	playingAttribute,
	playPlaylistAttribute,
	playTrackAttribute,
	queuedAttribute,
	queueTrackAttribute,
	trackIdAttribute,
} from '#constants.ts';
import { bind } from '#lib/bind.ts';
import { currentCue, loadedItem } from '#store/selectors.ts';

// The resolved press, so a host reads the verb rather than re-deriving it from the DOM
export interface ControlPress {
	itemIds: Array<string>;
	verb: 'play-playlist' | 'play-track' | 'queue-track' | 'toggle-playlist';
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
	itemId: string | undefined;
	queuedIds: string;
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
		const items = control ? readPayload() : undefined;
		if (!control || !items) return;

		const press = pressControl(store.getState(), control, items);

		if (press) onPress?.(press);
	};

	// A queue restored from storage can predate this build; a press on a track already queued jumps to the stored copy
	const refreshQueue = (): void => {
		const items = readPayload();
		if (items) store.getState().refreshQueue(items);
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

function isTunedIn(playlistIds: string, itemId: string | undefined): boolean {
	return itemId !== undefined && playlistIds.split(' ').includes(itemId);
}

function markCueRows(page: Document, { cueStartSeconds, itemId }: RowState): void {
	for (const list of page.querySelectorAll(`[${CSS.escape(cueMixAttribute)}]`)) {
		const isLoaded = itemId !== undefined && attribute(list, cueMixAttribute) === itemId;

		for (const row of list.querySelectorAll(`[${CSS.escape(cueSecondsAttribute)}]`)) {
			row.toggleAttribute(
				cueCurrentAttribute,
				isLoaded && Number(attribute(row, cueSecondsAttribute)) === cueStartSeconds,
			);
		}
	}
}

function markPlaylists(page: Document, { isPlaying, itemId }: RowState): void {
	for (const playlist of page.querySelectorAll(`[${CSS.escape(playPlaylistAttribute)}]`)) {
		playlist.toggleAttribute(
			playingAttribute,
			isPlaying && isTunedIn(attribute(playlist, playPlaylistAttribute) ?? '', itemId),
		);
	}
}

function markRows(page: Document, state: RowState): void {
	markTrackRows(page, state);
	markCueRows(page, state);
	markPlaylists(page, state);
}

function markTrackRows(page: Document, { isPlaying, itemId, queuedIds }: RowState): void {
	const queued = new Set(queuedIds.split(' '));

	for (const row of page.querySelectorAll(`[${CSS.escape(trackIdAttribute)}]`)) {
		const trackId = attribute(row, trackIdAttribute);
		const isLoaded = itemId !== undefined && trackId === itemId;
		const isQueued = trackId !== undefined && queued.has(trackId);

		row.toggleAttribute(loadedAttribute, isLoaded);
		row.toggleAttribute(playingAttribute, isLoaded && isPlaying);
		row.toggleAttribute(queuedAttribute, isQueued);

		// The verb only adds, so a queued Mix leaves the button nothing to do
		for (const button of row.querySelectorAll<HTMLButtonElement>(
			`[${CSS.escape(queueTrackAttribute)}]`,
		)) {
			button.disabled = isQueued;
		}
	}
}

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function payloadReader(page: Document): () => Array<QueueItem> | undefined {
	let parsedSource: string | undefined;
	let parsedItems: Array<QueueItem> | undefined;

	return () => {
		const payload = page.querySelector(payloadSelector)?.getAttribute(payloadAttribute);
		if (!payload) return;
		if (payload === parsedSource) return parsedItems;

		parsedSource = payload;

		try {
			parsedItems = JSON.parse(payload) as Array<QueueItem>;
		} catch {
			parsedItems = undefined;
		}

		return parsedItems;
	};
}

function playlistItems(ids: string, items: ReadonlyArray<QueueItem>): Array<QueueItem> {
	return ids
		.split(' ')
		.map((itemId) => items.find((item) => item.itemId === itemId))
		.filter((item) => item !== undefined);
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(
	state: PlayerStore,
	control: Element,
	items: Array<QueueItem>,
): ControlPress | undefined {
	const playPlaylist = attribute(control, playPlaylistAttribute);

	if (playPlaylist !== undefined && isTunedIn(playPlaylist, loadedItem(state)?.itemId)) {
		state.togglePaused();

		return { itemIds: playPlaylist.split(' '), verb: 'toggle-playlist' };
	}

	if (playPlaylist !== undefined) {
		const playlist = playlistItems(playPlaylist, items);

		state.playQueue(playlist);

		return { itemIds: playlist.map((item) => item.itemId), verb: 'play-playlist' };
	}

	const queueTrack = attribute(control, queueTrackAttribute);

	if (queueTrack) {
		state.queueTrack(items, queueTrack);

		return { itemIds: [queueTrack], verb: 'queue-track' };
	}

	const playTrack = attribute(control, playTrackAttribute);
	if (!playTrack) return undefined;

	state.playTrack(items, playTrack);

	return { itemIds: [playTrack], verb: 'play-track' };
}

function rowStateSelector(): (state: PlayerStore) => RowState {
	let joinedQueue: PlayerStore['queue'] | undefined;
	let queuedIds = '';

	return (state) => {
		if (state.queue !== joinedQueue) {
			joinedQueue = state.queue;
			queuedIds = state.queue.map((item) => item.itemId).join(' ');
		}

		return {
			cueStartSeconds: currentCue(state)?.startSeconds,
			// Intent rather than sound, matching the bar's play button
			isPlaying: !state.isPaused,
			itemId: loadedItem(state)?.itemId,
			queuedIds,
		};
	};
}
