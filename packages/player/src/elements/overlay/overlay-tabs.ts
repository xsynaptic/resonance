import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';

import { bind } from '#lib/bind.ts';
import { requireChild, template } from '#lib/render.ts';
import { displayedItem } from '#store/selectors.ts';

type OverlayList = 'queue' | 'tracklist';

interface TabsView {
	itemId: string | undefined;
	lists: ReadonlyArray<OverlayList>;
}

const renderTab = template(
	'<button class="player-overlay-tab" role="tab" type="button"></button>',
	HTMLButtonElement,
);

const withTracklist: ReadonlyArray<OverlayList> = ['tracklist', 'queue'];
const queueOnly: ReadonlyArray<OverlayList> = ['queue'];

let idCount = 0;

export function bindTabs(
	tabs: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	const tablist = requireChild(tabs, '[role="tablist"]', HTMLElement);
	const panel = requireChild(tabs, '[role="tabpanel"]', HTMLElement);
	const actions = requireChild(tabs, 'player-queue-actions', HTMLElement);
	const id = overlayId();
	const buttons = { queue: renderTab(), tracklist: renderTab() } satisfies Record<
		OverlayList,
		HTMLButtonElement
	>;
	let chosen: OverlayList = 'tracklist';
	let shownKey: string | undefined;

	const render = (view: TabsView): void => {
		const shown = shownList(view.lists, chosen);
		const wasFocused = tabs.contains(document.activeElement);
		const key = shown === 'tracklist' ? `tracklist:${view.itemId ?? ''}` : shown;

		applyTabs(buttons, view.lists, shown);
		actions.hidden = shown !== 'queue';
		panel.setAttribute('aria-labelledby', buttons[shown].id);

		if (key !== shownKey) {
			shownKey = key;
			panel.replaceChildren(renderList(shown));
		}

		if (wasFocused && !tabs.contains(document.activeElement)) buttons[shown].focus();
	};
	const choose = (list: OverlayList): void => {
		chosen = list;
		render(selectTabs(store.getState()));
	};

	panel.id = `${id}-panel`;
	tablist.append(buttons.tracklist, buttons.queue);

	for (const list of ['queue', 'tracklist'] as const) {
		const button = buttons[list];

		button.id = `${id}-${list}`;
		button.textContent = labels[list];
		button.setAttribute('aria-controls', panel.id);
		button.addEventListener(
			'click',
			() => {
				choose(list);
			},
			{ signal },
		);
	}

	tablist.addEventListener(
		'keydown',
		(event) => {
			const { lists } = selectTabs(store.getState());
			const index = nextTabIndex(event.key, lists.indexOf(shownList(lists, chosen)), lists.length);
			const next = index === undefined ? undefined : lists[index];
			if (next === undefined) return;

			event.preventDefault();
			choose(next);
			buttons[next].focus();
		},
		{ signal },
	);
	bind(store, selectTabs, render, signal);
}

function applyTabs(
	buttons: Record<OverlayList, HTMLButtonElement>,
	lists: ReadonlyArray<OverlayList>,
	shown: OverlayList,
): void {
	buttons.tracklist.disabled = !lists.includes('tracklist');

	for (const list of ['queue', 'tracklist'] as const) {
		buttons[list].setAttribute('aria-selected', String(list === shown));
		buttons[list].tabIndex = list === shown ? 0 : -1;
	}
}

function nextTabIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case 'ArrowLeft': {
			return (index - 1 + count) % count;
		}
		case 'ArrowRight': {
			return (index + 1) % count;
		}
		case 'End': {
			return count - 1;
		}
		case 'Home': {
			return 0;
		}
		default: {
			return undefined;
		}
	}
}

function overlayId(): string {
	idCount += 1;

	return `player-overlay-${String(idCount)}`;
}

function renderList(list: OverlayList): HTMLElement {
	return document.createElement(list === 'tracklist' ? 'player-tracklist' : 'player-tray');
}

function selectLists(state: PlayerStore): ReadonlyArray<OverlayList> {
	return (displayedItem(state)?.cuePoints?.length ?? 0) > 0 ? withTracklist : queueOnly;
}

function selectTabs(state: PlayerStore): TabsView {
	return { itemId: displayedItem(state)?.queueId, lists: selectLists(state) };
}

function shownList(lists: ReadonlyArray<OverlayList>, chosen: OverlayList): OverlayList {
	return lists.includes(chosen) ? chosen : 'queue';
}
