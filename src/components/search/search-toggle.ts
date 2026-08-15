import type { Instance, PagefindModal } from '@pagefind/component-ui';

import { getInstanceManager } from '@pagefind/component-ui';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

// An icon-based modal trigger integrating with Pagefind's instance API
class SearchToggle extends HTMLElement {
	// eslint-disable-next-line unicorn/no-null -- matches Pagefind's PagefindComponent interface
	instance: Instance | null = null;

	/** Pagefind reads this off the registered trigger to toggle aria-expanded and aria-controls */
	get buttonEl() {
		return this.querySelector<HTMLButtonElement>('button');
	}

	#cssReady?: Promise<void>;

	connectedCallback() {
		// Static props in markup; only the OS-dependent keyboard hint has to be set client-side
		this.buttonEl?.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');

		const instanceName = this.getAttribute('instance') ?? 'default';

		this.instance = getInstanceManager().getInstance(instanceName);

		this.instance.registerUtility(this, 'modal-trigger', { keyboardNavigation: true });

		this.instance.registerShortcut(
			{ description: 'open search', label: isMac ? '⌘K' : 'Ctrl+K' },
			this,
		);

		// Hover or focus the toggle and the stylesheet loads, so it's ready before the modal opens
		this.addEventListener('pointerenter', this.#preloadPagefindCss, { once: true });
		this.addEventListener('focusin', this.#preloadPagefindCss, { once: true });

		this.addEventListener('click', this.#handleClickEvent);
		document.addEventListener('keydown', this.#handleKeydown);
	}

	disconnectedCallback() {
		this.instance?.deregisterAllShortcuts(this);
		this.removeEventListener('pointerenter', this.#preloadPagefindCss);
		this.removeEventListener('focusin', this.#preloadPagefindCss);
		this.removeEventListener('click', this.#handleClickEvent);
		document.removeEventListener('keydown', this.#handleKeydown);
	}

	// Called by <pagefind-modal> when it closes; matches the built-in trigger's contract
	handleModalClose() {
		this.buttonEl?.setAttribute('aria-expanded', 'false');
		this.buttonEl?.focus();
	}

	// Load the deferred stylesheet on intent; resolves once applied
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

	// Void-returning wrapper for use as a click listener
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

	// Void-returning wrapper so the listener ignores the preload promise
	#preloadPagefindCss = () => {
		void this.#ensurePagefindCss();
	};
}

if (!customElements.get('search-toggle')) {
	customElements.define('search-toggle', SearchToggle);
}

declare global {
	interface HTMLElementTagNameMap {
		'search-toggle': SearchToggle;
	}
}
