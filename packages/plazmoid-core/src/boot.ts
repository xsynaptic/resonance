import type { PlayerStorage } from '#lib/storage.ts';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	payloadSelector,
	queueStorageKey,
} from '#constants.ts';
import { readStored } from '#lib/storage.ts';

export interface HeldPresses {
	pressed: Promise<void>;
	release: () => void;
}

// The latest press stays marked until the page controls replay it
export function holdPresses(page: Document): HeldPresses {
	const holding = new AbortController();
	const pressed = new Promise<void>((resolve) => {
		const onPress = (event: MouseEvent): void => {
			if (!(event.target instanceof Element)) return;

			const control = event.target.closest(controlSelector);
			if (!control) return;

			for (const held of page.querySelectorAll(heldPressSelector)) {
				held.removeAttribute(heldPressAttribute);
			}

			control.toggleAttribute(heldPressAttribute, true);
			resolve();
		};

		page.addEventListener('click', onPress, { capture: true, signal: holding.signal });
	});

	return {
		pressed,
		release: () => {
			holding.abort();
		},
	};
}

// A page that can queue something, or a listener whose bar is already showing
export function isPlayerActionable(page: Document, storage?: PlayerStorage): boolean {
	if (page.querySelector(payloadSelector)) return true;

	return readStored(storage, queueStorageKey) !== undefined;
}
