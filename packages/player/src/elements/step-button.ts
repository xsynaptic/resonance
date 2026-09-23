import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { renderIconButton } from '#lib/icon-button.ts';
import { canStepBack, canStepForward } from '#store/selectors.ts';

type StepDirection = keyof typeof stepSelectors;

const stepSelectors = {
	next: canStepForward,
	previous: canStepBack,
} as const satisfies Record<'next' | 'previous', (state: PlayerStore) => boolean>;

export const PlayerStepButton = buttonPart((element) => {
	const direction = readDirection(element);
	const canStep = stepSelectors[direction];

	return {
		// `aria-disabled` rather than `disabled`, which would drop focus to the page on the last step
		apply: (button, isEnabled: boolean) => {
			button.setAttribute('aria-disabled', String(!isEnabled));
		},
		icon: direction,
		label: direction,
		press: (state) => {
			if (!canStep(state)) return;

			state[direction]();
		},
		render: () => renderIconButton('player-step-button'),
		select: canStep,
	};
});

function readDirection(element: Element): StepDirection {
	const direction = element.getAttribute('direction');
	if (direction === 'next' || direction === 'previous') return direction;

	throw new Error(`<${element.localName}> needs a direction of next or previous`);
}
