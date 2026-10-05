import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { cloneIcon } from '#lib/icons.ts';
import { template } from '#lib/render.ts';

type ReportedStatus = (typeof reportedStatuses)[number];

const reportedStatuses = [
	'capped',
	'error',
	'loading',
	'unplayable',
] as const satisfies ReadonlyArray<PlayerStore['status']>;

const statusAttributes = { isVisible: 'data-visible' } as const satisfies Record<
	string,
	`data-${string}`
>;

const renderRegion = template(
	'<span aria-live="polite" class="player-status" role="status"></span>',
	HTMLSpanElement,
);

export class PlayerStatusRegion extends PlayerElement {
	readonly #alert = cloneIcon('alert');

	readonly #region = renderRegion();

	#shown: ReportedStatus | undefined;

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const region = this.#region;

		this.appendOnce(region);
		bind(
			store,
			selectReported,
			(reported) => {
				region.toggleAttribute(statusAttributes.isVisible, reported !== undefined);
				if (reported === undefined || reported === this.#shown) return;

				this.#shown = reported;
				region.dataset.status = reported;
				region.replaceChildren(...(reported === 'error' ? [this.#alert] : []), labels[reported]);
			},
			signal,
		);
	}
}

function selectReported(state: PlayerStore): ReportedStatus | undefined {
	return reportedStatuses.find((status) => status === state.status);
}
