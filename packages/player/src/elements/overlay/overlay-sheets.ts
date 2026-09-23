import type { PlayerContext } from '#elements/player-context.ts';

import { dialogExit } from '#lib/dialog-exit.ts';
import { cloneIcon } from '#lib/icons.ts';
import { requireChild } from '#lib/render.ts';

interface SheetControls {
	close: HTMLButtonElement;
	closeSheet: () => void;
	closeSheetNow: () => void;
	dialog: HTMLDialogElement;
}

export function bindSheets(
	sheets: HTMLElement,
	{ labels }: PlayerContext,
	signal: AbortSignal,
): SheetControls {
	const opener = requireChild(sheets, ':scope > button', HTMLButtonElement);
	const dialog = requireChild(sheets, 'dialog', HTMLDialogElement);
	const close = requireChild(sheets, '.player-overlay-close', HTMLButtonElement);

	const exit = dialogExit(
		dialog,
		{
			onClosed: () => {
				dialog.close();
			},
		},
		signal,
	);
	const closeSheet = exit.slide;
	const closeSheetNow = (): void => {
		exit.cancel();
		dialog.close();
	};

	dialog.setAttribute('aria-label', labels.lists);
	opener.setAttribute('aria-label', labels.lists);
	opener.append(cloneIcon('tracklist'));
	opener.addEventListener(
		'click',
		() => {
			exit.cancel();
			dialog.showModal();
			// Safari reads a script focus after a tap as keyboard focus, so a control focused here draws a ring
			dialog.focus();
		},
		{ signal },
	);
	close.setAttribute('aria-label', labels.close);
	close.append(cloneIcon('closeLarge'));
	close.addEventListener('click', closeSheet, { signal });

	return { close, closeSheet, closeSheetNow, dialog };
}
