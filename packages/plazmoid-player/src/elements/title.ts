import type { PlayerStore } from '@xsynaptic/plazmoid-core';

import { bind, displayedTrack, isLoaded } from '@xsynaptic/plazmoid-core';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { template } from '#lib/render.ts';

interface TitleView {
	href: string | undefined;
	isIdle: boolean;
	title: string | undefined;
}

const titleAttributes = {
	isIdle: 'data-idle',
} as const satisfies Partial<Record<keyof TitleView, `data-${string}`>>;

const renderEmpty = template('<span class="pzm-track-empty"></span>', HTMLSpanElement);
const renderLink = template('<a class="pzm-track-title"></a>', HTMLAnchorElement);
const renderText = template('<span class="pzm-track-title"></span>', HTMLSpanElement);

export class PlayerTitle extends PlayerElement {
	readonly #empty = renderEmpty();
	readonly #link = renderLink();
	readonly #text = renderText();
	readonly #ticker = document.createElement('sonic-ticker');

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);

		this.#empty.textContent = labels.nowPlaying;
		this.#ticker.cancellable = true;
		bind(
			store,
			selectTitle,
			(view) => {
				this.#apply(view);
			},
			signal,
		);
	}

	#apply(view: TitleView): void {
		this.toggleAttribute(titleAttributes.isIdle, view.isIdle);

		if (view.title === undefined) {
			this.replaceChildren(this.#empty);
			return;
		}

		const line = view.href === undefined ? this.#text : this.#link;

		if (view.href !== undefined) this.#link.href = view.href;
		if (this.#ticker.parentNode !== line) line.append(this.#ticker);
		if (line.parentNode !== this) this.replaceChildren(line);

		if (this.#ticker.text !== view.title) this.#ticker.text = view.title;
	}
}

function selectTitle(state: PlayerStore): TitleView {
	const track = displayedTrack(state);

	return {
		href: track?.releaseHref,
		isIdle: track !== undefined && !isLoaded(state),
		title: track?.title,
	};
}
