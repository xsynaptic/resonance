import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { trayModule } from '#elements/tray/tray-module.ts';
import { bindButton } from '#lib/bind-button.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { bindDismiss } from '#lib/dismiss.ts';
import { cloneIcon } from '#lib/icons.ts';
import { requireChild, template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';

interface QueueParts {
	control: HTMLDivElement;
	trigger: HTMLButtonElement;
}

interface TrayOpening {
	control: HTMLElement;
	store: StoreApi<PlayerStore>;
	title: string;
}

const renderControl = template(
	'<div class="player-queue"><button class="player-button player-button-icon" type="button"></button></div>',
	HTMLDivElement,
);

const renderPopover = template(
	/* HTML */ `
		<div class="player-popover player-queue-popover">
			<div class="player-header">
				<span class="player-header-title"></span><player-queue-actions></player-queue-actions>
			</div>
			<player-tray></player-tray>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerQueueButton extends PlayerElement {
	readonly #parts = renderQueueParts();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { control, trigger } = this.#parts;
		const opened = supersede(signal);

		this.appendOnce(control);
		trigger.setAttribute('aria-label', labels.queue);
		trigger.replaceChildren(cloneIcon('queue'));
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
					opened.cancel();
					if (!isOpen) return;

					void openTray({ control, store, title: labels.queue }, opened.next());
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
	{ control, store, title }: TrayOpening,
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

	const popover = renderPopover();

	requireChild(popover, '.player-header-title', HTMLElement).textContent = title;
	control.prepend(popover);
	signal.addEventListener(
		'abort',
		() => {
			popover.remove();
		},
		{ once: true },
	);
}

function renderQueueParts(): QueueParts {
	const control = renderControl();

	return { control, trigger: requireChild(control, 'button', HTMLButtonElement) };
}
