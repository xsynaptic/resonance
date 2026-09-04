interface TurnstileApi {
	remove: (widgetId: string) => void;
	render: (
		container: HTMLElement,
		options: { sitekey: string; size: string; theme: string },
	) => string | undefined;
}

const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileReady: Promise<TurnstileApi | undefined> | undefined;

export class TurnstileWidget {
	#widgetId: string | undefined;

	async remove(): Promise<void> {
		const widgetId = this.#widgetId;

		if (widgetId === undefined) return;

		this.#widgetId = undefined;

		const api = await loadTurnstile();

		api?.remove(widgetId);
	}

	// Moving the form re-parents the widget's iframe, which reloads it, so it is rebuilt from scratch
	async render(container: HTMLElement, sitekey: string): Promise<void> {
		const api = await loadTurnstile();

		// A disconnect while the script loads, or a submit settling after one, would strand the widget
		if (!api || !container.isConnected) return;

		if (this.#widgetId !== undefined) {
			api.remove(this.#widgetId);
			this.#widgetId = undefined;
		}

		container.replaceChildren();

		this.#widgetId = api.render(container, { sitekey, size: 'compact', theme: 'dark' });
	}
}

// Loaded here rather than from a script tag so the widget can be re-rendered after the form moves
function loadTurnstile(): Promise<TurnstileApi | undefined> {
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

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}
