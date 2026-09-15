import type { PlayerStore } from '#store/player-types.ts';

import { displayedItem } from '#store/selectors.ts';

export type OverlayList = 'playlist' | 'tracklist';

const withTracklist: ReadonlyArray<OverlayList> = ['tracklist', 'playlist'];
const playlistOnly: ReadonlyArray<OverlayList> = ['playlist'];

let idCount = 0;

export function overlayId(): string {
	idCount += 1;

	return `player-overlay-${String(idCount)}`;
}

export function renderList(list: OverlayList): HTMLElement {
	return document.createElement(list === 'tracklist' ? 'player-tracklist' : 'player-tray');
}

export function selectLists(state: PlayerStore): ReadonlyArray<OverlayList> {
	return (displayedItem(state)?.cuePoints?.length ?? 0) > 0 ? withTracklist : playlistOnly;
}

export function shownList(lists: ReadonlyArray<OverlayList>, chosen: OverlayList): OverlayList {
	return lists.includes(chosen) ? chosen : 'playlist';
}
