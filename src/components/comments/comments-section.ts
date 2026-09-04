import {
	clearStoredDetails,
	readStoredDetails,
	saveStoredDetails,
	storedFields,
} from '#components/comments/comment-form-memory.ts';
import { TurnstileWidget } from '#components/comments/comment-turnstile.ts';

class CommentsSection extends HTMLElement {
	#abortController: AbortController | undefined;
	#replyOrigin: HTMLElement | undefined;
	#widget = new TurnstileWidget();

	// Handed over as an attribute so the string dictionary stays out of the client bundle
	get #errorMessage() {
		return this.dataset.errorMessage ?? '';
	}

	get #form() {
		return this.querySelector<HTMLFormElement>('[data-comment-form]');
	}

	connectedCallback() {
		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		// The page is prerendered, so a build-time value would make the endpoint's time trap useless
		this.#field('renderedAt').value = String(Date.now());

		this.#restoreDetails();
		this.#showNoticeFromQuery();
		this.#scrollToLegacyPermalink();

		for (const button of this.querySelectorAll<HTMLElement>('[data-reply]')) {
			button.hidden = false;
		}

		this.#toggle('[data-open-form]', true);

		this.addEventListener('click', this.#handleClick, { signal });
		this.#form?.addEventListener('submit', this.#handleSubmit, { signal });
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
		void this.#widget.remove();
	}

	#cancelReply() {
		this.#returnFormHome();
		this.#renderTurnstile();

		this.#replyOrigin?.focus();
		this.#replyOrigin = undefined;
	}

	#clearDetails() {
		clearStoredDetails();

		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (remember) remember.checked = false;

		this.#toggle('[data-clear-stored]', false);
	}

	#field(name: string) {
		const input = this.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);

		if (!input) throw new Error(`The comment form is missing its "${name}" input.`);

		return input;
	}

	#handleAccepted(form: HTMLFormElement) {
		const body = form.querySelector<HTMLTextAreaElement>('textarea[name="body"]');

		if (body) body.value = '';

		this.#replyOrigin = undefined;
		this.#returnFormHome();
		this.#showReceivedNotice();
	}

	#handleClick = (event: MouseEvent) => {
		if (!(event.target instanceof HTMLElement)) return;

		const replyButton = event.target.closest<HTMLElement>('[data-reply]');

		if (replyButton) {
			this.#startReply(replyButton);
			return;
		}

		if (event.target.closest('[data-open-form]')) {
			this.#openForm();
			return;
		}

		if (event.target.closest('[data-cancel-reply]')) {
			this.#cancelReply();
			return;
		}

		if (event.target.closest('[data-clear-stored]')) this.#clearDetails();
	};

	// The native POST stays the fallback, so nothing is prevented until the fetch path is taken
	#handleSubmit = (event: SubmitEvent) => {
		this.#saveDetails();

		const form = this.#form;

		if (!form) return;

		event.preventDefault();

		void this.#submit(form);
	};

	#openForm() {
		const form = this.#form;

		if (!form) return;

		form.hidden = false;
		this.#toggle('[data-open-form]', false);

		this.#renderTurnstile();

		this.#field('author').focus();
	}

	async #readMessage(response: Response) {
		try {
			const payload: unknown = await response.json();

			if (
				typeof payload === 'object' &&
				payload !== null &&
				'message' in payload &&
				typeof payload.message === 'string'
			) {
				return payload.message;
			}
		} catch {
			// An error page that is not JSON falls through to the generic message
		}

		return this.#errorMessage;
	}

	#renderTurnstile() {
		const form = this.#form;
		const container = this.querySelector<HTMLElement>('[data-turnstile]');

		// The widget animates, so it stays unloaded until someone opens the form
		if (!form || !container || form.hidden) return;

		void this.#widget.render(container, container.dataset.turnstileSitekey ?? '');
	}

	#restoreDetails() {
		const stored = readStoredDetails();

		if (!stored) return;

		for (const name of storedFields) {
			const value = stored[name];

			if (typeof value === 'string') this.#field(name).value = value;
		}

		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (remember) remember.checked = true;

		this.#toggle('[data-clear-stored]', true);
	}

	#returnFormHome() {
		const form = this.#form;
		const home = this.querySelector('[data-comment-form-home]');

		if (!form || !home) return;

		home.append(form);
		this.#field('parentId').value = '';
		this.#toggle('[data-cancel-reply]', false);
	}

	#saveDetails() {
		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (!remember?.checked) {
			this.#clearDetails();
			return;
		}

		const details: Record<string, string> = {};

		for (const name of storedFields) {
			details[name] = this.#field(name).value;
		}

		saveStoredDetails(details);
	}

	// WordPress permalinks point at `#comment-<n>`, while the imported rows carry a `wp-` prefix
	#scrollToLegacyPermalink() {
		const legacyId = /^#comment-(\d+)$/.exec(location.hash)?.[1];

		if (legacyId === undefined) return;
		if (document.querySelector(location.hash)) return;

		document.querySelector<HTMLElement>(`#comment-wp-${legacyId}`)?.scrollIntoView();
	}

	#setSubmitDisabled(form: HTMLFormElement, isDisabled: boolean) {
		const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

		if (submitButton) submitButton.disabled = isDisabled;
	}

	#showError(message: string) {
		const error = this.querySelector<HTMLElement>('[data-comment-error]');

		if (!error) return;

		error.textContent = message;
		error.hidden = false;
	}

	// The native fallback redirects with `?comment=received`; a prerendered page cannot read it at build time
	#showNoticeFromQuery() {
		if (new URLSearchParams(location.search).get('comment') !== 'received') return;

		this.#showReceivedNotice();

		// Drop the query so a reload does not repeat the notice
		history.replaceState(undefined, '', `${location.pathname}${location.hash}`);
	}

	#showReceivedNotice() {
		const notice = this.querySelector<HTMLElement>('[data-comment-notice]');

		if (!notice) return;

		// `role="status"` announces it without stealing focus from the `#comments` fragment target
		notice.hidden = false;

		// The notice sits above the comment list, which puts it off-screen for anyone who just used the form
		notice.scrollIntoView({ block: 'nearest' });
	}

	#startReply(button: HTMLElement) {
		const commentId = button.dataset.reply;
		const form = this.#form;

		if (!commentId || !form) return;

		const comment = this.querySelector(`#comment-${CSS.escape(commentId)}`);

		if (!comment) return;

		comment.after(form);
		form.hidden = false;
		this.#toggle('[data-open-form]', false);
		this.#field('parentId').value = commentId;
		this.#toggle('[data-cancel-reply]', true);
		this.#renderTurnstile();

		this.#replyOrigin = button;
		this.#field('author').focus();
	}

	async #submit(form: HTMLFormElement) {
		const signal = this.#abortController?.signal;

		this.#toggle('[data-comment-error]', false);
		this.#setSubmitDisabled(form, true);

		try {
			const response = await fetch(form.action, {
				body: new FormData(form),
				headers: { accept: 'application/json' },
				method: 'POST',
				...(signal ? { signal } : undefined),
			});

			if (response.ok) this.#handleAccepted(form);
			else this.#showError(await this.#readMessage(response));
		} catch {
			// An aborted request means the section is gone; nothing is left to show the error on
			if (!signal?.aborted) this.#showError(this.#errorMessage);
		} finally {
			this.#setSubmitDisabled(form, false);

			// The Turnstile token is single-use, so either outcome needs a fresh widget
			this.#renderTurnstile();
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

declare global {
	interface HTMLElementTagNameMap {
		'comments-section': CommentsSection;
	}
}
