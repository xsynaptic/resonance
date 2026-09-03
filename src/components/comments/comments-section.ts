interface TurnstileApi {
	remove: (widgetId: string) => void;
	render: (
		container: HTMLElement,
		options: { sitekey: string; theme: string },
	) => string | undefined;
}

const storageKey = 'comment-form-details';

const storedFields = ['author', 'authorEmail', 'authorUrl'] as const;

const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileReady: Promise<TurnstileApi | undefined> | undefined;

class CommentsSection extends HTMLElement {
	#controller: AbortController | undefined;
	#replyOrigin: HTMLElement | undefined;
	#widgetId: string | undefined;

	get #form() {
		return this.querySelector<HTMLFormElement>('[data-comment-form]');
	}

	connectedCallback() {
		this.#controller = new AbortController();

		const { signal } = this.#controller;

		// The page is prerendered, so a build-time value would make the endpoint's time trap useless
		this.#field('renderedAt').value = String(Date.now());

		this.#restoreDetails();
		this.#showReceivedNotice();

		for (const button of this.querySelectorAll<HTMLElement>('[data-reply]')) {
			button.hidden = false;
		}

		this.addEventListener('click', this.#handleClick, { signal });
		this.#form?.addEventListener('submit', this.#handleSubmit, { signal });

		void this.#renderTurnstile();
	}

	disconnectedCallback() {
		this.#controller?.abort();
		this.#controller = undefined;
	}

	#cancelReply() {
		const form = this.#form;
		const home = this.querySelector('[data-comment-form-home]');

		if (!form || !home) return;

		home.append(form);
		this.#field('parentId').value = '';
		this.#toggle('[data-cancel-reply]', false);
		void this.#renderTurnstile();

		this.#replyOrigin?.focus();
		this.#replyOrigin = undefined;
	}

	#clearDetails() {
		try {
			localStorage.removeItem(storageKey);
		} catch {
			// A browser with storage disabled has nothing to clear
		}

		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (remember) remember.checked = false;

		this.#toggle('[data-clear-stored]', false);
	}

	#field(name: string) {
		const input = this.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);

		if (!input) throw new Error(`The comment form is missing its "${name}" input.`);

		return input;
	}

	#handleClick = (event: MouseEvent) => {
		if (!(event.target instanceof HTMLElement)) return;

		const replyButton = event.target.closest<HTMLElement>('[data-reply]');

		if (replyButton) {
			this.#startReply(replyButton);
			return;
		}

		if (event.target.closest('[data-cancel-reply]')) {
			this.#cancelReply();
			return;
		}

		if (event.target.closest('[data-clear-stored]')) this.#clearDetails();
	};

	// Runs before the native POST navigates away
	#handleSubmit = () => {
		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (!remember?.checked) {
			this.#clearDetails();
			return;
		}

		const details: Record<string, string> = {};

		for (const name of storedFields) {
			details[name] = this.#field(name).value;
		}

		try {
			localStorage.setItem(storageKey, JSON.stringify(details));
		} catch {
			// Storage full or disabled; the comment still submits
		}
	};

	// Loaded here rather than from a script tag so the widget can be re-rendered after the form moves
	async #loadTurnstile() {
		if (!turnstileReady) {
			turnstileReady = new Promise<TurnstileApi | undefined>((resolve) => {
				const script = document.createElement('script');

				script.async = true;
				script.src = turnstileScriptUrl;
				script.addEventListener(
					'load',
					() => {
						resolve(window.turnstile);
					},
					{ once: true },
				);
				script.addEventListener(
					'error',
					() => {
						resolve(undefined);
					},
					{ once: true },
				);

				document.head.append(script);
			});
		}

		return turnstileReady;
	}

	// Moving the form re-parents the widget's iframe, which reloads it, so it is rebuilt from scratch
	async #renderTurnstile() {
		const container = this.querySelector<HTMLElement>('[data-turnstile]');
		const api = await this.#loadTurnstile();

		if (!container || !api) return;

		if (this.#widgetId !== undefined) api.remove(this.#widgetId);

		container.replaceChildren();

		this.#widgetId = api.render(container, {
			sitekey: container.dataset.turnstileSitekey ?? '',
			theme: 'dark',
		});
	}

	#restoreDetails() {
		const stored = this.#storedDetails();

		if (!stored) return;

		for (const name of storedFields) {
			const value = stored[name];

			if (typeof value === 'string') this.#field(name).value = value;
		}

		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (remember) remember.checked = true;

		this.#toggle('[data-clear-stored]', true);
	}

	// The redirect carries `?comment=received`; a prerendered page cannot read it at build time
	#showReceivedNotice() {
		if (new URLSearchParams(location.search).get('comment') !== 'received') return;

		const notice = this.querySelector<HTMLElement>('[data-comment-notice]');

		if (!notice) return;

		// `role="status"` announces it without stealing focus from the `#comments` fragment target
		notice.hidden = false;

		// Drop the query so a reload does not repeat the notice
		history.replaceState(undefined, '', `${location.pathname}${location.hash}`);
	}

	#startReply(button: HTMLElement) {
		const commentId = button.dataset.reply;
		const form = this.#form;

		if (!commentId || !form) return;

		const comment = this.querySelector(`#comment-${CSS.escape(commentId)}`);

		if (!comment) return;

		comment.after(form);
		this.#field('parentId').value = commentId;
		this.#toggle('[data-cancel-reply]', true);
		void this.#renderTurnstile();

		this.#replyOrigin = button;
		this.#field('author').focus();
	}

	#storedDetails(): Record<string, unknown> | undefined {
		try {
			const raw = localStorage.getItem(storageKey);

			if (!raw) return undefined;

			const parsed: unknown = JSON.parse(raw);

			return typeof parsed === 'object' && parsed !== null
				? (parsed as Record<string, unknown>)
				: undefined;
		} catch {
			return undefined;
		}
	}

	#toggle(selector: string, isVisible: boolean) {
		const element = this.querySelector<HTMLElement>(selector);

		if (element) element.hidden = !isVisible;
	}
}

if (!customElements.get('comments-section')) {
	customElements.define('comments-section', CommentsSection);
}

export {};

declare global {
	interface HTMLElementTagNameMap {
		'comments-section': CommentsSection;
	}

	interface Window {
		turnstile?: TurnstileApi;
	}
}
