// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

// The real widget fetches Cloudflare's script on render
const widget = vi.hoisted(() => ({ remove: vi.fn(), render: vi.fn() }));

vi.mock('#components/comments/comment-turnstile.ts', () => ({
	TurnstileWidget: class {
		remove = widget.remove;
		render = widget.render;
	},
}));

import '#components/comments/comments-section.ts';

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
			<p data-comment-notice hidden>Your comment is awaiting review.</p>
			<div data-comment-form-home>
				<button data-open-form hidden type="button">Leave a comment</button>
				<form action="/api/comments" data-comment-form hidden method="post">
					<input name="collection" type="hidden" value="posts">
					<input data-parent-id name="parentId" type="hidden" value="">
					<input data-rendered-at name="renderedAt" type="hidden" value="">
					<input name="entryId" type="hidden" value="a-post">
					<input name="author" value="Ada">
					<input name="authorEmail" value="">
					<input name="authorUrl" value="">
					<textarea name="body">A comment</textarea>
					<input data-remember type="checkbox">
					<button data-clear-stored hidden type="button">Forget me</button>
					<div data-turnstile data-turnstile-sitekey="test-key"></div>
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

afterEach(() => {
	document.body.replaceChildren();
	localStorage.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
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

	test('either outcome re-enables the button and rebuilds the single-use widget', async () => {
		const form = mountSection();
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

		respondWith({ json: () => Promise.resolve({ message: 'No.' }), ok: false });
		submit(form);

		expect(button?.disabled).toBe(true);

		await vi.waitFor(() => {
			expect(button?.disabled).toBe(false);
		});

		expect(widget.render).toHaveBeenCalledWith(element('[data-turnstile]'), 'test-key');
	});
});
