import type { PageControls } from '#page-controls.ts';
import type { PlayerStoreApi } from '#store/player-types.ts';

export function bindAstroRouter(store: PlayerStoreApi, controls: PageControls): () => void {
	const connection = new AbortController();
	const { signal } = connection;

	// Without `moveBefore` the router moves the persisted bar out and back, which drops the dialog's modal state
	document.addEventListener(
		'astro:before-preparation',
		() => {
			store.getState().setOverlayOpen(false);
		},
		{ signal },
	);
	// Page load fires after the transition animates in, so marking there flashes the stale state
	document.addEventListener(
		'astro:after-swap',
		() => {
			controls.refresh();
		},
		{ signal },
	);

	return () => {
		connection.abort();
	};
}

// A link moved with the persisted bar drops out of `document.styleSheets`, so the sheet lives in the head
export function loadPersistedStylesheet(href: string): Promise<void> {
	const link = document.createElement('link');

	link.href = href;
	link.rel = 'stylesheet';

	// The router keeps a head stylesheet only when the incoming head carries the same href
	document.addEventListener('astro:before-swap', ({ newDocument }) => {
		newDocument.head.append(link.cloneNode());
	});

	// A failed sheet still loads the player, since an unstyled bar still plays
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
