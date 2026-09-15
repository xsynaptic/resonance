import type { PlayerStore } from '#store/player-types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { bindMarquee, renderMarquee, writeMarquee } from '#lib/marquee.ts';
import { template } from '#lib/render.ts';
import { displayedItem, isLoaded } from '#store/selectors.ts';

interface TitleView {
	href: string | undefined;
	isIdle: boolean;
	title: string | undefined;
}

const titleAttributes = {
	isIdle: 'data-idle',
} as const satisfies Partial<Record<keyof TitleView, `data-${string}`>>;

const renderEmpty = template('<span class="player-track-empty"></span>', HTMLSpanElement);
const renderLink = template('<a class="player-track-title"></a>', HTMLAnchorElement);
const renderText = template('<span class="player-track-title"></span>', HTMLSpanElement);

export class PlayerTitle extends PlayerElement {
	readonly #empty = renderEmpty();
	readonly #link = renderLink();
	readonly #marquee = renderMarquee();
	readonly #text = renderText();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);

		this.#empty.textContent = labels.nowPlaying;
		bindMarquee(this.#marquee, signal);
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
		if (this.#marquee.box.parentNode !== line) line.append(this.#marquee.box);
		if (line.parentNode !== this) this.replaceChildren(line);

		writeMarquee(this.#marquee, view.title);
	}
}

function selectTitle(state: PlayerStore): TitleView {
	const item = displayedItem(state);

	return {
		href: item?.releaseHref,
		isIdle: item !== undefined && !isLoaded(state),
		title: item?.title,
	};
}
