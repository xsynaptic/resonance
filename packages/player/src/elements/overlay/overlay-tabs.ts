import type { OverlayList } from '#elements/overlay/overlay-lists.ts';
import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';

import { overlayId, renderList, selectLists, shownList } from '#elements/overlay/overlay-lists.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { nextTabIndex } from '#lib/tab-keys.ts';
import { displayedItem } from '#store/selectors.ts';

interface TabParts {
	buttons: Record<OverlayList, HTMLButtonElement>;
	tablist: HTMLElement;
}

interface TabsView {
	itemId: string | undefined;
	lists: ReadonlyArray<OverlayList>;
}

const renderTab = template(
	'<button class="player-overlay-tab" role="tab" type="button"></button>',
	HTMLButtonElement,
);

export function bindTabs(
	tabs: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	const tablist = tabs.querySelector<HTMLElement>('[role="tablist"]');
	const panel = tabs.querySelector<HTMLElement>('[role="tabpanel"]');
	if (!tablist || !panel) throw new Error('The overlay tabs lost their tablist or panel');

	const id = overlayId();
	const buttons = { playlist: renderTab(), tracklist: renderTab() } satisfies Record<
		OverlayList,
		HTMLButtonElement
	>;
	let chosen: OverlayList = 'tracklist';
	let shownKey: string | undefined;

	const render = (view: TabsView): void => {
		const shown = shownList(view.lists, chosen);
		const wasFocused = tabs.contains(document.activeElement);
		const key = shown === 'tracklist' ? `tracklist:${view.itemId ?? ''}` : shown;

		applyTabs({ buttons, tablist }, view.lists, shown);
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
	tablist.append(buttons.playlist);

	for (const list of ['playlist', 'tracklist'] as const) {
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
	{ buttons, tablist }: TabParts,
	lists: ReadonlyArray<OverlayList>,
	shown: OverlayList,
): void {
	if (!lists.includes('tracklist')) buttons.tracklist.remove();
	else if (buttons.tracklist.parentNode !== tablist) tablist.prepend(buttons.tracklist);

	for (const list of ['playlist', 'tracklist'] as const) {
		buttons[list].setAttribute('aria-selected', String(list === shown));
		buttons[list].tabIndex = list === shown ? 0 : -1;
	}
}

function selectTabs(state: PlayerStore): TabsView {
	return { itemId: displayedItem(state)?.queueId, lists: selectLists(state) };
}
