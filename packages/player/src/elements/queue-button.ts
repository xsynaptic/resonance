import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

import { bindButton } from '#elements/bind-button.ts';
import { bindPreload } from '#elements/bind-preload.ts';
import { cloneIcon } from '#elements/icons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { trayModule } from '#elements/tray/tray-module.ts';
import { bindDismiss } from '#lib/dismiss.ts';
import { template } from '#lib/render.ts';

interface QueueParts {
	control: HTMLDivElement;
	trigger: HTMLButtonElement;
}

const renderControl = template(
	'<div class="player-queue"><button class="player-button player-button-icon" type="button"></button></div>',
	HTMLDivElement,
);

export class PlayerQueueButton extends PlayerElement {
	readonly #parts = renderQueueParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { control, trigger } = this.#parts;
		let opened: AbortController | undefined;

		const close = (): void => {
			opened?.abort();
			opened = undefined;
		};

		this.appendOnce(control);
		trigger.setAttribute('aria-label', labels.queue);
		trigger.replaceChildren(cloneIcon('queue'));
		signal.addEventListener('abort', close, { once: true });
		bindPreload({ preload: trayModule.preload, store, trigger }, signal);
		bindDismiss(
			{
				container: control,
				isOpen: () => store.getState().isTrayOpen,
				onDismiss: () => {
					store.getState().setTrayOpen(false);
				},
				trigger,
			},
			signal,
		);
		bindButton(
			{
				apply: (isOpen) => {
					trigger.setAttribute('aria-expanded', String(isOpen));
					close();
					if (!isOpen) return;

					opened = new AbortController();
					void openTray(control, store, opened.signal);
				},
				button: trigger,
				press: (state) => {
					state.toggleTray();
				},
				select: isTrayOpen,
				store,
			},
			signal,
		);
	}
}

function isTrayOpen(state: PlayerStore): boolean {
	return state.isTrayOpen;
}

async function openTray(
	control: HTMLElement,
	store: StoreApi<PlayerStore>,
	signal: AbortSignal,
): Promise<void> {
	try {
		await trayModule.load();
	} catch (error) {
		store.getState().setTrayOpen(false);
		reportError(error);
		return;
	}

	if (signal.aborted) return;

	const tray = document.createElement('player-tray');

	control.prepend(tray);
	signal.addEventListener(
		'abort',
		() => {
			tray.remove();
		},
		{ once: true },
	);
}

function renderQueueParts(): QueueParts {
	const control = renderControl();
	const trigger = control.querySelector('button');
	if (!trigger) throw new Error('The queue template lost its trigger');

	return { control, trigger };
}
