import type { CommentChallengeWidget } from '#element/challenge-widget.ts';
import type { FormMemory } from '#element/form-memory.ts';

import { BaseElement } from '#element/base-element.ts';
import { createFormMemory, storedFields } from '#element/form-memory.ts';
import { commentFields } from '#fields.ts';

export interface CommentsAcceptedDetail {
	isReply: boolean;
	thread: string;
}

// `status` is absent when the request never got an answer
export interface CommentsRejectedDetail {
	message: string;
	status?: number;
}

export interface CommentsSectionOptions {
	// One widget per section, since a widget tracks the instance it rendered
	challenge: () => CommentChallengeWidget;
	storageKey: string;
}

const commentsSectionElementName = 'comments-section';

// The parser constructs the element with no arguments, so registration leaves its options here
let sectionOptions: CommentsSectionOptions | undefined;

export class CommentsSectionElement extends BaseElement {
	#abortController: AbortController | undefined;
	#memory: FormMemory;
	#replyOrigin: HTMLElement | undefined;
	#widget: CommentChallengeWidget;

	// Handed over as an attribute so the site's strings stay out of the client bundle
	get #errorMessage() {
		return this.dataset.errorMessage ?? '';
	}

	get #form() {
		const form = this.querySelector<HTMLFormElement>('[data-comment-form]');

		if (!form) throw new Error('The comments section is missing its [data-comment-form].');

		return form;
	}

	constructor() {
		super();

		if (!sectionOptions)
			throw new Error('Register <comments-section> through defineCommentsSection()');

		this.#memory = createFormMemory(sectionOptions.storageKey);
		this.#widget = sectionOptions.challenge();
	}

	connectedCallback() {
		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		// The page is prerendered, so a build-time value would make the endpoint's time trap useless
		this.#field(commentFields.renderedAt).value = String(Date.now());

		this.#restoreDetails();
		this.#showNoticeFromQuery();

		for (const button of this.querySelectorAll<HTMLElement>('[data-reply]')) {
			button.hidden = false;
		}

		// A reconnect can find the form already open, and its widget was removed on disconnect
		this.#toggle('[data-open-form]', this.#form.hidden !== false);
		this.#renderChallenge();

		this.addEventListener('click', this.#handleClick, { signal });
		this.#form.addEventListener('submit', this.#handleSubmit, { signal });
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
		void this.#widget.remove();
	}

	#clearDetails() {
		this.#memory.clear();

		const remember = this.querySelector<HTMLInputElement>('[data-remember]');

		if (remember) remember.checked = false;

		this.#toggle('[data-clear-stored]', false);
	}

	#closeForm() {
		// A reply moved the form under a comment, so returning focus keeps the page position meaningful
		const origin = this.#replyOrigin ?? this.querySelector<HTMLElement>('[data-open-form]');

		this.#collapseForm();

		this.#replyOrigin = undefined;
		origin?.focus();
	}

	// Collapses without moving focus, which is what an accepted comment wants; `role="status"` announces it
	#collapseForm() {
		const form = this.#form;

		this.#replyOrigin?.setAttribute('aria-expanded', 'false');
		this.#returnFormHome();

		form.hidden = true;
		this.#toggle('[data-open-form]', true);
	}

	#field(name: string) {
		const input = this.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);

		if (!input) throw new Error(`The comment form is missing its "${name}" input.`);

		return input;
	}

	#handleAccepted(form: HTMLFormElement) {
		const body = form.querySelector<HTMLTextAreaElement>(
			`textarea[name="${CSS.escape(commentFields.body)}"]`,
		);

		if (body) body.value = '';

		this.#collapseForm();

		this.#replyOrigin = undefined;
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

		if (event.target.closest('[data-close-form]')) {
			this.#closeForm();
			return;
		}

		if (event.target.closest('[data-clear-stored]')) this.#clearDetails();
	};

	// The native POST stays the fallback, so nothing is prevented until the fetch path is taken
	#handleSubmit = (event: SubmitEvent) => {
		this.#saveDetails();
		event.preventDefault();

		void this.#submit(this.#form);
	};

	#openForm() {
		this.#form.hidden = false;
		this.#toggle('[data-open-form]', false);

		this.#renderChallenge();

		this.#field(commentFields.author).focus();
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

	#reject(detail: CommentsRejectedDetail) {
		this.#showError(detail.message);
		this.dispatchEvent(new CustomEvent('comments:rejected', { bubbles: true, detail }));
	}

	#renderChallenge() {
		const container = this.querySelector<HTMLElement>('[data-comment-challenge]');

		// A challenge may animate, so it stays unloaded until someone opens the form
		if (!container || this.#form.hidden) return;

		void this.#widget.render(container);
	}

	#restoreDetails() {
		const stored = this.#memory.read();

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
		const home = this.querySelector('[data-comment-form-home]');

		if (!home) return;

		home.append(this.#form);
		this.#field(commentFields.parentId).value = '';
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

		this.#memory.save(details);
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

		if (!commentId) return;

		const form = this.#form;

		// The button reads as a toggle while its own reply is open
		if (!form.hidden && this.#replyOrigin === button) {
			this.#closeForm();
			return;
		}

		const comment = this.querySelector(`#comment-${CSS.escape(commentId)}`);

		if (!comment) return;

		this.#replyOrigin?.setAttribute('aria-expanded', 'false');

		comment.after(form);
		form.hidden = false;
		this.#toggle('[data-open-form]', false);
		this.#field(commentFields.parentId).value = commentId;
		this.#renderChallenge();

		this.#replyOrigin = button;
		button.setAttribute('aria-expanded', 'true');
		this.#field(commentFields.author).focus();
	}

	async #submit(form: HTMLFormElement) {
		const signal = this.#abortController?.signal;

		this.#toggle('[data-comment-error]', false);
		this.#setSubmitDisabled(form, true);

		const body = new FormData(form);
		const accepted = {
			isReply: this.#field(commentFields.parentId).value !== '',
			thread: this.#field(commentFields.thread).value,
		} satisfies CommentsAcceptedDetail;

		try {
			const response = await fetch(form.action, {
				body,
				headers: { accept: 'application/json' },
				method: 'POST',
				...(signal ? { signal } : undefined),
			});

			if (response.ok) {
				this.#handleAccepted(form);
				this.dispatchEvent(
					new CustomEvent('comments:accepted', { bubbles: true, detail: accepted }),
				);
			} else {
				this.#reject({ message: await this.#readMessage(response), status: response.status });
			}
		} catch {
			// An aborted request means the section is gone; nothing is left to show the error on
			if (!signal?.aborted) this.#reject({ message: this.#errorMessage });
		} finally {
			this.#setSubmitDisabled(form, false);

			// A challenge token is single-use, so either outcome needs a fresh widget
			this.#renderChallenge();
		}
	}

	#toggle(selector: string, isVisible: boolean) {
		const element = this.querySelector<HTMLElement>(selector);

		if (element) element.hidden = !isVisible;
	}
}

export function defineCommentsSection(options: CommentsSectionOptions): void {
	if (customElements.get(commentsSectionElementName)) return;

	sectionOptions = options;
	customElements.define(commentsSectionElementName, CommentsSectionElement);
}

declare global {
	interface HTMLElementTagNameMap {
		'comments-section': CommentsSectionElement;
	}
}

declare global {
	interface GlobalEventHandlersEventMap {
		'comments:accepted': CustomEvent<CommentsAcceptedDetail>;
		'comments:rejected': CustomEvent<CommentsRejectedDetail>;
	}
}
