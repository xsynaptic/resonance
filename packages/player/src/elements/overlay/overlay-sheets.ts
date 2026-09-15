import type { IconName } from '#elements/icons.ts';
import type { OverlayList } from '#elements/overlay/overlay-lists.ts';
import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';

import { cloneIcon } from '#elements/icons.ts';
import { overlayId, renderList, selectLists } from '#elements/overlay/overlay-lists.ts';
import { bind } from '#lib/bind.ts';

interface SheetParts {
	close: HTMLButtonElement;
	dialog: HTMLDialogElement;
	list: HTMLElement;
	openers: Record<OverlayList, HTMLButtonElement>;
	title: HTMLElement;
}

const sheetIcons = { playlist: 'queue', tracklist: 'tracklist' } as const satisfies Record<
	OverlayList,
	IconName
>;

export function bindSheets(
	sheets: HTMLElement,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): () => void {
	const { close, dialog, list, openers, title } = renderSheetParts(sheets);
	let chosen: OverlayList | undefined;
	let opener: HTMLButtonElement | undefined;

	const closeSheet = (): void => {
		if (dialog.open) dialog.close();
	};

	title.id = `${overlayId()}-sheet`;
	dialog.setAttribute('aria-labelledby', title.id);
	close.setAttribute('aria-label', labels.close);
	close.append(cloneIcon('closeLarge'));
	close.addEventListener('click', closeSheet, { signal });
	dialog.addEventListener(
		'close',
		() => {
			chosen = undefined;
			list.replaceChildren();
			if (opener?.isConnected) opener.focus();
		},
		{ signal },
	);

	for (const sheet of ['playlist', 'tracklist'] as const) {
		const button = openers[sheet];

		button.setAttribute('aria-label', labels[sheet]);
		button.append(cloneIcon(sheetIcons[sheet]));
		button.addEventListener(
			'click',
			() => {
				chosen = sheet;
				opener = button;
				title.textContent = labels[sheet];
				list.replaceChildren(renderList(sheet));
				dialog.showModal();
			},
			{ signal },
		);
	}

	bind(
		store,
		hasTracklist,
		(isOffered) => {
			if (!isOffered) {
				if (chosen === 'tracklist') closeSheet();
				openers.tracklist.remove();
				return;
			}

			if (openers.tracklist.parentNode !== sheets) sheets.prepend(openers.tracklist);
		},
		signal,
	);

	return closeSheet;
}

function hasTracklist(state: PlayerStore): boolean {
	return selectLists(state).includes('tracklist');
}

function renderSheetParts(sheets: HTMLElement): SheetParts {
	const [tracklist, playlist] = [...sheets.querySelectorAll<HTMLButtonElement>(':scope > button')];
	const dialog = sheets.querySelector('dialog');
	const title = sheets.querySelector<HTMLElement>('.player-overlay-sheet-title');
	const close = sheets.querySelector<HTMLButtonElement>(':scope > dialog button');
	const list = sheets.querySelector<HTMLElement>(':scope > dialog > .player-overlay-list');

	if (!tracklist || !playlist || !dialog || !title || !close || !list) {
		throw new Error('The overlay sheets lost part of their markup');
	}

	return { close, dialog, list, openers: { playlist, tracklist }, title };
}
