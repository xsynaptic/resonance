import type { ClientDirective } from 'astro';

import { queueStorageKey } from '@xsynaptic/player/queue-storage-key';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	listeningEvent,
} from '#components/player/player-held-press.ts';

interface HydrationRequest {
	element: HTMLElement;
	load: Parameters<ClientDirective>[0];
	stylesheetUrl: unknown;
}

const claimed = new WeakSet<HTMLElement>();

// Astro runs this again on each move of the persisted island, the last after the incoming page is in place
const playerDirective: ClientDirective = (load, { value }, element) => {
	void hydrateWhenActionable({ element, load, stylesheetUrl: value });
};

export default playerDirective;

async function hydrateWhenActionable({
	element,
	load,
	stylesheetUrl,
}: HydrationRequest): Promise<void> {
	if (claimed.has(element) || !isActionable()) return;

	claimed.add(element);

	await Promise.all([Promise.race([whenIdle(), whenPressed()]), loadStylesheet(stylesheetUrl)]);

	const hydrate = await load();

	await hydrate();
}

// A page that can queue something, or a listener whose bar is already showing
function isActionable(): boolean {
	if (document.querySelector('[data-player-payload]')) return true;

	try {
		return localStorage.getItem(queueStorageKey) !== null;
	} catch {
		return false;
	}
}

// A link moved with the persisted island drops out of `document.styleSheets`, so the sheet lives in the head
function loadStylesheet(href: unknown): Promise<void> {
	if (typeof href !== 'string') return Promise.resolve();

	const link = document.createElement('link');

	link.href = href;
	link.rel = 'stylesheet';

	// The router keeps a head stylesheet only when the incoming head carries the same href
	document.addEventListener('astro:before-swap', ({ newDocument }) => {
		newDocument.head.append(link.cloneNode());
	});

	// A failed sheet still hydrates, since an unstyled bar still plays
	return new Promise((resolve) => {
		link.addEventListener('error', () => {
			resolve();
		});
		link.addEventListener('load', () => {
			resolve();
		});
		document.head.append(link);
	});
}

function whenIdle(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(() => {
				resolve();
			});
			return;
		}

		setTimeout(resolve, 200);
	});
}

// A press skips the idle wait, and its control stays marked until the island's listener replays it; the latest press wins
function whenPressed(): Promise<void> {
	return new Promise((resolve) => {
		const onPress = (event: MouseEvent): void => {
			if (!(event.target instanceof Element)) return;

			const pressed = event.target.closest(controlSelector);
			if (!pressed) return;

			for (const held of document.querySelectorAll(heldPressSelector)) {
				held.removeAttribute(heldPressAttribute);
			}

			pressed.toggleAttribute(heldPressAttribute, true);
			resolve();
		};

		document.addEventListener('click', onPress, { capture: true });
		document.addEventListener(
			listeningEvent,
			() => {
				document.removeEventListener('click', onPress, { capture: true });
			},
			{ once: true },
		);
	});
}
