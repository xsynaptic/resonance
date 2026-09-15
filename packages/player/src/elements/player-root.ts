import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels, PlayerStatus, PlayerUrls } from '#types.ts';

import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { audibleVolume, isAwaitingPlayback } from '#store/selectors.ts';

interface RootView {
	isEmpty: boolean;
	isMuted: boolean;
	isPaused: boolean;
	isWaiting: boolean;
	status: PlayerStatus;
}

const rootAttributes = {
	isEmpty: 'data-empty',
	isMuted: 'data-muted',
	isPaused: 'data-paused',
	isWaiting: 'data-waiting',
} as const satisfies Record<Exclude<keyof RootView, 'status'>, `data-${string}`>;

const hydratedStores = new WeakSet<StoreApi<PlayerStore>>();

export class PlayerRoot extends PlayerElement {
	get isArtworkEnabled(): boolean {
		return this.#isArtworkEnabled;
	}

	set isArtworkEnabled(isArtworkEnabled: boolean) {
		this.#isArtworkEnabled = isArtworkEnabled;
	}

	get isOverlayEnabled(): boolean {
		return this.#isOverlayEnabled;
	}

	set isOverlayEnabled(isOverlayEnabled: boolean) {
		this.#isOverlayEnabled = isOverlayEnabled;
	}

	get labels(): PlayerLabels | undefined {
		return this.#labels;
	}
	set labels(labels: PlayerLabels | undefined) {
		this.#labels = labels;
	}

	get seekSeconds(): number | undefined {
		return this.#seekSeconds;
	}

	set seekSeconds(seekSeconds: number | undefined) {
		this.#seekSeconds = seekSeconds;
	}

	get store(): StoreApi<PlayerStore> | undefined {
		return this.#store;
	}

	set store(store: StoreApi<PlayerStore> | undefined) {
		this.#store = store;
	}

	get urls(): PlayerUrls | undefined {
		return this.#urls;
	}

	set urls(urls: PlayerUrls | undefined) {
		this.#urls = urls;

		if (this.isConnected) this.#store?.getState().configure({ urls });
	}

	#isArtworkEnabled = true;

	#isOverlayEnabled = true;

	#labels: PlayerLabels | undefined;

	#seekSeconds: number | undefined;

	#store: StoreApi<PlayerStore> | undefined;

	#urls: PlayerUrls | undefined;

	protected connect(signal: AbortSignal): void {
		this.upgradeProperty('isArtworkEnabled');
		this.upgradeProperty('isOverlayEnabled');
		this.upgradeProperty('labels');
		this.upgradeProperty('seekSeconds');
		this.upgradeProperty('store');
		this.upgradeProperty('urls');

		const store = this.#store;
		if (!store) throw new Error('<player-root> connected without a store');

		if (!hydratedStores.has(store)) {
			hydratedStores.add(store);
			store.getState().hydratePreferences();
			store.getState().hydrateQueue();
		}

		store.getState().configure({ urls: this.#urls });
		bind(
			store,
			selectRoot,
			(view) => {
				applyRoot(this, view);
			},
			signal,
		);
		if (this.hasAttribute('is-primary')) bindPrimary(store, signal);
	}
}

function applyRoot(root: HTMLElement, view: RootView): void {
	root.dataset.status = view.status;
	root.toggleAttribute(rootAttributes.isEmpty, view.isEmpty);
	root.toggleAttribute(rootAttributes.isMuted, view.isMuted);
	root.toggleAttribute(rootAttributes.isPaused, view.isPaused);
	root.toggleAttribute(rootAttributes.isWaiting, view.isWaiting);
}

// The document's own bar answers the router; a specimen root does not
function bindPrimary(store: StoreApi<PlayerStore>, signal: AbortSignal): void {
	// Without `moveBefore` the router moves the persisted bar out and back, which drops the dialog's modal state
	document.addEventListener(
		'astro:before-preparation',
		() => {
			store.getState().setOverlayOpen(false);
		},
		{ signal },
	);
}

function selectRoot(state: PlayerStore): RootView {
	return {
		isEmpty: state.queue.length === 0,
		isMuted: audibleVolume(state) === 0,
		isPaused: state.isPaused,
		isWaiting: isAwaitingPlayback(state),
		status: state.status,
	};
}
