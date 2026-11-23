import type { PlayerStore } from '@xsynaptic/plazmoid-core';
import type { SonicButton } from '@xsynaptic/sonic-ui';

import { canStepBack, canStepForward } from '@xsynaptic/plazmoid-core';

import { buttonPart } from '#elements/button-part.ts';
import { playbackStore } from '#elements/player-context.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';

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
		press: (state: PlayerStore) => {
			state[direction]();
		},
		render: () =>
			renderSonicButton({ className: 'pzm-step-button', icons: [cloneIcon(direction)] }),
		select: stepSelectors[direction],
		store: playbackStore,
	};
});

function readDirection(element: Element): StepDirection {
	const direction = element.getAttribute('direction');
	if (direction === 'next' || direction === 'previous') return direction;

	throw new Error(`<${element.localName}> needs a direction of next or previous`);
}
