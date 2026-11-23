// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

import { defineCommentsSection } from '#element/comments-section.ts';
import { createFormMemory } from '#element/form-memory.ts';

const widget = { remove: vi.fn(), render: vi.fn() };

const memory = createFormMemory('test-comment-form');

defineCommentsSection({ challenge: () => widget, storageKey: 'test-comment-form' });

const errorMessage = 'Your comment could not be posted.';

function element(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`Nothing matches ${selector}`);

	return found;
}

// Built detached, then connected: a parser-created element upgrades at its start tag, with no children yet
function mountSection(): HTMLFormElement {
	const container = document.createElement('div');

	container.innerHTML = `
		<comments-section data-error-message="${errorMessage}">
			<article id="comment-c1">
				<button data-reply="c1" hidden type="button">Reply</button>
			</article>
			<p data-comment-notice hidden>Your comment is awaiting review.</p>
			<div data-comment-form-home>
				<button data-open-form hidden type="button">Leave a comment</button>
				<form action="/api/comments" data-comment-form hidden method="post">
					<input name="thread" type="hidden" value="posts/a-post">
					<input name="parentId" type="hidden" value="">
					<input name="renderedAt" type="hidden" value="">
					<input name="author" value="Ada">
					<input name="authorEmail" value="">
					<input name="authorUrl" value="">
					<textarea name="body">A comment</textarea>
					<input data-remember type="checkbox">
					<button data-clear-stored hidden type="button">Forget me</button>
					<div data-comment-challenge data-sitekey="test-key"></div>
					<p data-comment-error hidden></p>
					<button type="submit">Post comment</button>
				</form>
			</div>
		</comments-section>
	`;

	document.body.append(container);

	const form = document.querySelector<HTMLFormElement>('[data-comment-form]');
	if (!form) throw new Error('The fixture is missing its form');

	form.hidden = false;

	return form;
}

function respondWith(response: Partial<Response>): void {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

function submit(form: HTMLFormElement): void {
	form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function postedField(call: number, name: string): FormDataEntryValue | null | undefined {
	const options = vi.mocked(fetch).mock.calls[call]?.[1];

	return (options?.body as FormData | undefined)?.get(name);
}

function rememberBox(): HTMLInputElement {
	return element('[data-remember]') as HTMLInputElement;
}

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('a submitted comment form', () => {
	test('posts the form to its own action and asks for JSON', async () => {
		const form = mountSection();

		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledOnce();
		});

		const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];

		expect(url).toBe(form.action);
		expect(options).toMatchObject({ headers: { accept: 'application/json' }, method: 'POST' });
		expect((options?.body as FormData).get('body')).toBe('A comment');
	});

	test('carries the time the section connected and no parent', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));

		const form = mountSection();

		vi.setSystemTime(new Date('2026-11-19T12:05:00Z'));
		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledOnce();
		});

		expect(postedField(0, 'renderedAt')).toBe(String(Date.parse('2026-11-19T12:00:00Z')));
		expect(postedField(0, 'parentId')).toBe('');
	});

	test('a reply posts under its parent, and the next comment posts top-level again', async () => {
		const form = mountSection();

		respondWith({ ok: true });
		element('[data-reply="c1"]').click();
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-notice]').hidden).toBe(false);
		});

		element('[data-open-form]').click();
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(2);
		});

		expect(postedField(0, 'parentId')).toBe('c1');
		expect(postedField(1, 'parentId')).toBe('');
	});

	test('an accepted comment empties the body, collapses the form and shows the notice', async () => {
		const form = mountSection();

		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-notice]').hidden).toBe(false);
		});

		expect(form.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.value).toBe('');
		expect(form.hidden).toBe(true);
		expect(element('[data-open-form]').hidden).toBe(false);
		expect(element('[data-comment-error]').hidden).toBe(true);
	});

	test('a rejection carrying a message shows that message', async () => {
		const form = mountSection();

		respondWith({ json: () => Promise.resolve({ message: 'That entry is closed.' }), ok: false });
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-error]').hidden).toBe(false);
		});

		expect(element('[data-comment-error]').textContent).toBe('That entry is closed.');
		expect(form.hidden).toBe(false);
		expect(element('[data-comment-notice]').hidden).toBe(true);
	});

	test('a rejection that is not JSON falls back to the section message', async () => {
		const form = mountSection();

		respondWith({ json: () => Promise.reject(new Error('Unexpected token')), ok: false });
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-error]').hidden).toBe(false);
		});

		expect(element('[data-comment-error]').textContent).toBe(errorMessage);
	});

	test('a rejection carrying JSON without a message falls back to the section message', async () => {
		const form = mountSection();

		respondWith({ json: () => Promise.resolve({ error: 'nope' }), ok: false });
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-error]').hidden).toBe(false);
		});

		expect(element('[data-comment-error]').textContent).toBe(errorMessage);
	});

	test('a failed request shows the section message', async () => {
		const form = mountSection();

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
		submit(form);

		await vi.waitFor(() => {
			expect(element('[data-comment-error]').hidden).toBe(false);
		});

		expect(element('[data-comment-error]').textContent).toBe(errorMessage);
	});

	test('an accepted comment re-enables the button for the next one', async () => {
		const form = mountSection();
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

		respondWith({ ok: true });
		submit(form);

		expect(button?.disabled).toBe(true);

		await vi.waitFor(() => {
			expect(element('[data-comment-notice]').hidden).toBe(false);
		});

		expect(button?.disabled).toBe(false);
	});

	test('a rejection re-enables the button and rebuilds the single-use widget', async () => {
		const form = mountSection();
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

		respondWith({ json: () => Promise.resolve({ message: 'No.' }), ok: false });
		submit(form);

		expect(button?.disabled).toBe(true);

		await vi.waitFor(() => {
			expect(button?.disabled).toBe(false);
		});

		expect(widget.render).toHaveBeenCalledWith(element('[data-comment-challenge]'));
	});
});

describe('the events a section reports', () => {
	test('a reply that lands reports its thread, bubbling to the document', async () => {
		const form = mountSection();
		const accepted = vi.fn<(event: GlobalEventHandlersEventMap['comments:accepted']) => void>();

		document.addEventListener('comments:accepted', accepted);
		respondWith({ ok: true });
		element('[data-reply="c1"]').click();
		submit(form);

		await vi.waitFor(() => {
			expect(accepted).toHaveBeenCalledOnce();
		});

		expect(accepted.mock.calls[0]?.[0].detail).toEqual({ isReply: true, thread: 'posts/a-post' });
		document.removeEventListener('comments:accepted', accepted);
	});

	test("a rejection reports the server's message and status, and a failed request reports no status", async () => {
		const form = mountSection();
		const rejected = vi.fn<(event: GlobalEventHandlersEventMap['comments:rejected']) => void>();

		document.addEventListener('comments:rejected', rejected);
		respondWith({ json: () => Promise.resolve({ message: 'Too fast.' }), ok: false, status: 400 });
		submit(form);

		await vi.waitFor(() => {
			expect(rejected).toHaveBeenCalledTimes(1);
		});

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
		submit(form);

		await vi.waitFor(() => {
			expect(rejected).toHaveBeenCalledTimes(2);
		});

		expect(rejected.mock.calls.map(([event]) => event.detail)).toEqual([
			{ message: 'Too fast.', status: 400 },
			{ message: errorMessage },
		]);
		document.removeEventListener('comments:rejected', rejected);
	});
});

describe('a section that leaves the page', () => {
	test('moved with its form open, rebuilds the removed widget and keeps the open button hidden', () => {
		mountSection();

		const section = element('comments-section');

		element('[data-open-form]').click();
		document.body.append(section);

		expect(widget.remove).toHaveBeenCalledOnce();
		expect(widget.render).toHaveBeenCalledTimes(2);
		expect(element('[data-open-form]').hidden).toBe(true);
	});

	test('removed mid-request, shows no error for the request it aborted', async () => {
		const form = mountSection();
		const section = element('comments-section');
		const error = element('[data-comment-error]');

		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, options: RequestInit) =>
					new Promise((_resolve, rejectRequest) => {
						options.signal?.addEventListener('abort', () => {
							rejectRequest(new DOMException('Aborted', 'AbortError'));
						});
					}),
			),
		);
		submit(form);
		section.remove();

		await vi.waitFor(() => {
			expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
		});

		expect(error.hidden).toBe(true);
	});
});

describe('remembered details', () => {
	test('stay out of storage unless the visitor opts in', async () => {
		const form = mountSection();

		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledOnce();
		});

		expect(memory.read()).toBeUndefined();
	});

	test('opting in stores the name, email and URL but not the comment', async () => {
		const form = mountSection();

		rememberBox().checked = true;
		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledOnce();
		});

		expect(memory.read()).toEqual({ author: 'Ada', authorEmail: '', authorUrl: '' });
	});

	test('fill the form on the next visit, and unticking the box forgets them', async () => {
		memory.save({ author: 'Grace', authorEmail: 'grace@example.com', authorUrl: '' });

		const form = mountSection();

		expect(form.querySelector<HTMLInputElement>('input[name="author"]')?.value).toBe('Grace');
		expect(rememberBox().checked).toBe(true);

		rememberBox().checked = false;
		respondWith({ ok: true });
		submit(form);

		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledOnce();
		});

		expect(memory.read()).toBeUndefined();
	});
});
