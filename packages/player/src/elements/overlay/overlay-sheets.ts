import type { PlayerContext } from '#elements/player-context.ts';

import { cloneIcon } from '#lib/icons.ts';
import { requireChild } from '#lib/render.ts';

interface SheetControls {
	closeSheet: () => void;
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

	const closeSheet = (): void => {
		if (dialog.open) dialog.close();
	};

	dialog.setAttribute('aria-label', labels.lists);
	opener.setAttribute('aria-label', labels.lists);
	opener.append(cloneIcon('tracklist'));
	opener.addEventListener(
		'click',
		() => {
			dialog.showModal();
		},
		{ signal },
	);
	close.setAttribute('aria-label', labels.close);
	close.append(cloneIcon('closeLarge'));
	close.addEventListener('click', closeSheet, { signal });
	dialog.addEventListener(
		'close',
		() => {
			if (opener.isConnected) opener.focus();
		},
		{ signal },
	);

	return { closeSheet, dialog };
}
