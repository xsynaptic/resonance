import { cloneIcon } from '#elements/icons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { muteLabel, selectLevel } from '#elements/volume-level.ts';
import { bind } from '#lib/bind.ts';
import { bindDismiss } from '#lib/dismiss.ts';
import { template } from '#lib/render.ts';

interface PopoverParts {
	control: HTMLDivElement;
	muteButton: HTMLElement;
	trigger: HTMLButtonElement;
}

const hoverQuery = '(hover: hover)';

const popoverAttributes = { isOpen: 'data-open' } as const satisfies Record<
	string,
	`data-${string}`
>;

const renderControl = template(
	'<div class="player-volume"><button class="player-button player-button-icon" type="button"></button><div class="player-volume-panel"><player-volume-slider></player-volume-slider><player-mute-button></player-mute-button></div></div>',
	HTMLDivElement,
);

export class PlayerVolumePopover extends PlayerElement {
	#isOpen = false;

	readonly #parts = renderPopover();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const { control, muteButton, trigger } = this.#parts;
		// Decides what the trigger's click does: mute where the panel already opens on hover, open it where it cannot
		const hover = matchMedia(hoverQuery);
		let level = selectLevel(store.getState());

		const render = (): void => {
			control.toggleAttribute(popoverAttributes.isOpen, this.#isOpen);
			muteButton.hidden = hover.matches;

			if (hover.matches) {
				trigger.setAttribute('aria-label', muteLabel(level, labels));
				trigger.removeAttribute('aria-expanded');
				return;
			}

			trigger.setAttribute('aria-label', labels.volume);
			trigger.setAttribute('aria-expanded', String(this.#isOpen));
		};
		const setOpen = (isOpen: boolean): void => {
			this.#isOpen = isOpen;
			render();
		};

		this.appendOnce(control);
		hover.addEventListener('change', render, { signal });
		trigger.addEventListener(
			'click',
			() => {
				if (hover.matches) store.getState().toggleMuted();
				else setOpen(!this.#isOpen);
			},
			{ signal },
		);
		bindDismiss(
			{
				container: control,
				isOpen: () => this.#isOpen,
				onDismiss: () => {
					setOpen(false);
				},
				trigger,
			},
			signal,
		);
		bind(
			store,
			selectLevel,
			(view) => {
				level = view;
				trigger.replaceChildren(cloneIcon(view.icon));
				render();
			},
			signal,
		);
	}
}

function renderPopover(): PopoverParts {
	const control = renderControl();
	const trigger = control.querySelector('button');
	const muteButton = control.querySelector('player-mute-button');
	if (!trigger || !muteButton) throw new Error('The volume popover template lost its buttons');

	return { control, muteButton, trigger };
}
