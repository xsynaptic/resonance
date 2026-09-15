import type { PlayerStore } from '#store/player-types.ts';

import { bindButton } from '#elements/bind-button.ts';
import { renderIconButton } from '#elements/icon-button.ts';
import { cloneIcon } from '#elements/icons.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { canStepBack, canStepForward } from '#store/selectors.ts';

type StepDirection = keyof typeof stepSelectors;

const stepSelectors = {
	next: canStepForward,
	previous: canStepBack,
} as const satisfies Record<'next' | 'previous', (state: PlayerStore) => boolean>;

export class PlayerStepButton extends PlayerElement {
	readonly #button = renderIconButton('player-step');

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const direction = readDirection(this);
		const button = this.#button;

		this.appendOnce(button);
		button.setAttribute('aria-label', labels[direction]);
		button.replaceChildren(cloneIcon(direction));
		bindButton(
			{
				apply: (isEnabled) => {
					button.setAttribute('aria-disabled', String(!isEnabled));
				},
				button,
				// `aria-disabled` rather than `disabled`, since a press that leaves nothing to step to would drop focus to the page
				press: (state) => {
					if (button.getAttribute('aria-disabled') === 'true') return;

					state[direction]();
				},
				select: stepSelectors[direction],
				store,
			},
			signal,
		);
	}
}

function readDirection(element: Element): StepDirection {
	const direction = element.getAttribute('direction');
	if (direction === 'next' || direction === 'previous') return direction;

	throw new Error(`<${element.localName}> needs a direction of next or previous`);
}
