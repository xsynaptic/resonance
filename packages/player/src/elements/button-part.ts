import type { IconName } from '#elements/icons.ts';
import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';

import { bindButton } from '#elements/bind-button.ts';
import { cloneIcon } from '#elements/icons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';

export interface ButtonPart<Selected> {
	apply: (button: HTMLButtonElement, selected: Selected, labels: PlayerLabels) => void;
	connect?: (button: HTMLButtonElement, context: PlayerContext, signal: AbortSignal) => void;
	icon?: IconName;
	label?: keyof PlayerLabels;
	press: (state: PlayerStore) => void;
	render: () => HTMLButtonElement;
	select: (state: PlayerStore) => Selected;
}

export function buttonPart<Selected>(part: ButtonPart<Selected>) {
	return class extends PlayerElement {
		readonly #button = part.render();

		protected connect(signal: AbortSignal): void {
			const context = playerContext(this);
			const { labels, store } = context;
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
