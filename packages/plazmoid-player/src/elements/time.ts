import type { PlayerStore } from '@xsynaptic/plazmoid-core';

import { bind } from '@xsynaptic/plazmoid-core';

import type { PlayerTimeMode } from '#types.ts';
import type { ViewStore } from '#view/view-store.ts';

import { bindPlayer } from '#elements/bind-player.ts';
import { buttonPart } from '#elements/button-part.ts';
import { viewStore } from '#elements/player-context.ts';
import { formatModeClock } from '#lib/format.ts';
import { template } from '#lib/render.ts';

const emptyClock = '--:--';

const renderButton = template(
	`<button class="pzm-time" type="button">${emptyClock}</button>`,
	HTMLButtonElement,
);

export const PlayerTime = buttonPart(() => ({
	apply: applyTimeMode,
	// Bound apart from the mode, since the length is the playback store's and only the text moves on every tick
	connect: (button, context, signal) => {
		bind(
			context.store,
			isDurationUnknown,
			(isDisabled) => {
				button.disabled = isDisabled;
			},
			signal,
		);
		bindPlayer(
			context,
			selectClock,
			(text) => {
				button.textContent = text;
			},
			signal,
		);
	},
	// The seek surface announces the position, so the button is named for what it does
	label: 'toggleTimeMode',
	press: (view) => {
		view.toggleTimeMode();
	},
	render: renderButton,
	select: selectTimeMode,
	store: viewStore,
}));

function applyTimeMode(button: HTMLButtonElement, timeMode: PlayerTimeMode): void {
	button.dataset.mode = timeMode;
	button.setAttribute('aria-pressed', String(timeMode === 'remaining'));
}

function isDurationUnknown(state: PlayerStore): boolean {
	return state.durationSeconds === undefined;
}

function selectClock(
	{ currentTimeSeconds, durationSeconds }: PlayerStore,
	view: ViewStore,
): string {
	if (durationSeconds === undefined) return emptyClock;

	return formatModeClock(currentTimeSeconds, { durationSeconds, timeMode: view.timeMode });
}

function selectTimeMode(view: ViewStore): PlayerTimeMode {
	return view.timeMode;
}
