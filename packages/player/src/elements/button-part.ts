import type { PlayerContext } from '#elements/player-context.ts';
import type { IconName } from '#lib/icons.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bindButton } from '#lib/bind-button.ts';
import { cloneIcon } from '#lib/icons.ts';

interface ButtonPart<Selected> {
	apply: (button: HTMLButtonElement, selected: Selected, labels: PlayerLabels) => void;
	connect?: (button: HTMLButtonElement, context: PlayerContext, signal: AbortSignal) => void;
	icon?: IconName;
	label?: keyof PlayerLabels;
	press: (state: PlayerStore) => void;
	render: () => HTMLButtonElement;
	select: (state: PlayerStore) => Selected;
}

export abstract class PlayerButtonPart extends PlayerElement {}

// Called at every connect, so a part can read attributes that a constructor cannot see yet
export function buttonPart<Selected>(
	readPart: (element: HTMLElement) => ButtonPart<Selected>,
): new () => PlayerButtonPart {
	return class extends PlayerButtonPart {
		#button: HTMLButtonElement | undefined;

		protected connect(signal: AbortSignal): void {
			const part = readPart(this);
			const context = playerContext(this);
			const { labels, store } = context;

			if (this.#button === undefined) this.#button = part.render();

			const button = this.#button;

			this.appendOnce(button);
			if (part.icon !== undefined) button.replaceChildren(cloneIcon(part.icon));
			if (part.label !== undefined) button.setAttribute('aria-label', labels[part.label]);

			bindButton(
				{
					apply: (selected) => {
						part.apply(button, selected, labels);
					},
					button,
					press: part.press,
					select: part.select,
					store,
				},
				signal,
			);
			part.connect?.(button, context, signal);
		}
	};
}
