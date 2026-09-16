import type { Instance, PagefindModal, PagefindSearchResult } from '@pagefind/component-ui';

import { getInstanceManager } from '@pagefind/component-ui';

import { trackEvent } from '#components/main/main-analytics.ts';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

const searchQueryDebounceMs = 1500;
const searchQueryMinLength = 2;
const searchQueryMaxLength = 100;

// Pagefind deregisters no hook at all, and `connectedCallback` runs on every navigation
let isSearchAnalyticsRegistered = false;

class SearchToggle extends HTMLElement {
	// eslint-disable-next-line unicorn/no-null -- matches Pagefind's PagefindComponent interface
	instance: Instance | null = null;

	/** Pagefind reads this off the registered trigger to toggle aria-expanded and aria-controls */
	get buttonEl() {
		return this.querySelector<HTMLButtonElement>('button');
	}

	#abortController: AbortController | undefined;
	#cssReady?: Promise<void>;

	connectedCallback() {
		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		// Static props in markup; only the OS-dependent keyboard hint has to be set client-side
		this.buttonEl?.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');

		const instanceName = this.getAttribute('instance') ?? 'default';

		this.instance = getInstanceManager().getInstance(instanceName);

		registerSearchAnalytics(this.instance);

		this.instance.registerUtility(this, 'modal-trigger', { keyboardNavigation: true });

		this.instance.registerShortcut(
			{ description: this.dataset.shortcutDescription ?? '', label: isMac ? '⌘K' : 'Ctrl+K' },
			this,
		);

		// Hover or focus the toggle and the stylesheet loads, so it's ready before the modal opens
		this.addEventListener('pointerenter', this.#preloadPagefindCss, { once: true, signal });
		this.addEventListener('focusin', this.#preloadPagefindCss, { once: true, signal });

		this.addEventListener('click', this.#handleClickEvent, { signal });
		document.addEventListener('keydown', this.#handleKeydown, { signal });
	}

	disconnectedCallback() {
		this.instance?.deregisterAllShortcuts(this);
		this.#abortController?.abort();
		this.#abortController = undefined;
	}

	// Called by <pagefind-modal> when it closes; matches the built-in trigger's contract
	handleModalClose() {
		this.buttonEl?.setAttribute('aria-expanded', 'false');
		this.buttonEl?.focus();
	}

	#ensurePagefindCss = (): Promise<void> => {
		if (this.#cssReady) return this.#cssReady;

		const href = this.dataset.pagefindCssUrl;

		if (!href) return Promise.resolve();

		this.#cssReady = new Promise((resolve) => {
			let link = document.querySelector<HTMLLinkElement>('link[data-pagefind-css]');

			if (!link) {
				link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = href;
				link.dataset.pagefindCss = '';
				document.head.append(link);
			}

			if (link.sheet) {
				resolve();
				return;
			}

			link.addEventListener(
				'load',
				() => {
					resolve();
				},
				{ once: true },
			);
			link.addEventListener(
				'error',
				() => {
					resolve();
				},
				{ once: true },
			);
		});

		return this.#cssReady;
	};

	// Await the stylesheet so the modal never opens unstyled
	#handleClick = async () => {
		await this.#ensurePagefindCss();
		const [modal] = (this.instance?.getUtilities('modal') ?? []) as Array<PagefindModal>;
		modal?.open();
	};

	#handleClickEvent = () => {
		void this.#handleClick();
	};

	#handleKeydown = (event: KeyboardEvent) => {
		const isModifier = isMac ? event.metaKey : event.ctrlKey;

		if (!isModifier || event.key.toLowerCase() !== 'k') return;

		const target = event.target as HTMLElement;

		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
			return;
		}

		event.preventDefault();
		void this.#handleClick();
	};

	#preloadPagefindCss = () => {
		void this.#ensurePagefindCss();
	};
}

function getResultCount(result: unknown): number | undefined {
	if (!result || typeof result !== 'object') return undefined;

	const { results } = result as Partial<PagefindSearchResult>;

	return Array.isArray(results) ? results.length : undefined;
}

// Both the term and its count go out, so Umami's flat data view needs no join
function registerSearchAnalytics(instance: Instance): void {
	if (isSearchAnalyticsRegistered) return;

	isSearchAnalyticsRegistered = true;

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	instance.on('results', (result: unknown) => {
		clearTimeout(debounceTimer);

		const query = instance.searchTerm.replaceAll(/\s+/g, ' ').trim().slice(0, searchQueryMaxLength);

		if (query.length < searchQueryMinLength) return;

		const resultCount = getResultCount(result);
		const queryWithCount =
			resultCount === undefined ? query : `${query} (${resultCount.toString()})`;

		debounceTimer = setTimeout(() => {
			trackEvent('search-query', { query, queryWithCount });
		}, searchQueryDebounceMs);
	});
}

if (!customElements.get('search-toggle')) {
	customElements.define('search-toggle', SearchToggle);
}

declare global {
	interface HTMLElementTagNameMap {
		'search-toggle': SearchToggle;
	}
}
