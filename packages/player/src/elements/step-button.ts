import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';
import { canStepBack, canStepForward } from '#store/selectors.ts';

type StepDirection = keyof typeof stepSelectors;

const stepSelectors = {
	next: canStepForward,
	previous: canStepBack,
} as const satisfies Record<'next' | 'previous', (state: PlayerStore) => boolean>;

export const PlayerStepButton = buttonPart((element) => {
	const direction = readDirection(element);

	return {
		// Soft rather than `disabled`, which would drop focus to the page on the last step
		apply: (button: SonicButton, isEnabled: boolean) => {
			button.softDisabled = !isEnabled;
		},
		label: direction,
		press: (state) => {
			state[direction]();
		},
		render: () =>
			renderSonicButton({ className: 'player-step-button', icons: [cloneIcon(direction)] }),
		select: stepSelectors[direction],
	};
});

function readDirection(element: Element): StepDirection {
	const direction = element.getAttribute('direction');
	if (direction === 'next' || direction === 'previous') return direction;

	throw new Error(`<${element.localName}> needs a direction of next or previous`);
}
