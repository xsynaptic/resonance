import type { CuePoint, PlayerStore } from '@xsynaptic/plazmoid-core';

import { bind, currentCue, displayedDetail, isLoaded } from '@xsynaptic/plazmoid-core';
import { formatClock } from '@xsynaptic/sonic-ui';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { cloneIcon } from '#lib/icons.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';

interface CueRow {
	button: HTMLButtonElement;
	cue: CuePoint;
	node: HTMLLIElement;
}

interface MarksView {
	current: CuePoint | undefined;
	isLoaded: boolean;
}

const cueOfButton = new WeakMap<Element, CuePoint>();

const renderList = template('<ol class="pzm-overlay-cue-list"></ol>', HTMLOListElement);

const renderRow = template(
	/* HTML */ `
		<li>
			<button class="pzm-overlay-cue" type="button">
				<span class="pzm-overlay-cue-time"></span
				><span class="pzm-overlay-cue-head"><span class="pzm-overlay-cue-title"></span></span
				><span class="pzm-overlay-cue-artist"></span>
			</button>
		</li>
	`,
	HTMLLIElement,
);

export class PlayerTracklist extends PlayerElement {
	readonly #list = renderList();

	protected connect(signal: AbortSignal): void {
		const { store } = playerContext(this);
		const list = this.#list;
		let rows: Array<CueRow> = [];

		this.appendOnce(list);
		list.addEventListener(
			'click',
			(event) => {
				const button = event.target instanceof Element ? event.target.closest('button') : undefined;
				const cue = button ? cueOfButton.get(button) : undefined;

				if (cue) store.getState().seek(cue.startSeconds);
			},
			{ signal },
		);
		bind(
			store,
			selectCuePoints,
			(cuePoints) => {
				rows = (cuePoints ?? []).map((cue) => renderCue(cue));
				list.replaceChildren(...rows.map(({ node }) => node));
				applyMarks(rows, selectMarks(store.getState()));
			},
			signal,
		);
		bind(
			store,
			selectMarks,
			(marks) => {
				applyMarks(rows, marks);
			},
			signal,
		);
	}
}

function applyMarks(rows: ReadonlyArray<CueRow>, marks: MarksView): void {
	for (const { button, cue } of rows) {
		button.disabled = !marks.isLoaded;

		button.setAttribute('aria-current', String(cue === marks.current));
	}
}

function renderCue(cue: CuePoint): CueRow {
	const node = renderRow();
	const button = requireChild(node, 'button', HTMLButtonElement);
	const [time, head, title, artist] = requireChildren(node, 'span', 4, HTMLSpanElement);
	const playing = cloneIcon('playing');

	playing.classList.add('pzm-row-playing');
	head.append(playing);
	cueOfButton.set(button, cue);
	time.textContent = formatClock(cue.startSeconds);
	title.textContent = cue.title;

	if (cue.artistLine === '') artist.remove();
	else artist.textContent = cue.artistLine;

	return { button, cue, node };
}

function selectCuePoints(state: PlayerStore): ReadonlyArray<CuePoint> | undefined {
	return displayedDetail(state)?.cuePoints;
}

function selectMarks(state: PlayerStore): MarksView {
	return { current: currentCue(state), isLoaded: isLoaded(state) };
}
