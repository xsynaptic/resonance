import type { PlayerStore } from '#store/player-types.ts';
import type { QueueCuePoint } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { formatClock } from '#lib/format.ts';
import { template } from '#lib/render.ts';
import { currentCue, displayedItem, isLoaded } from '#store/selectors.ts';

interface CueRow {
	button: HTMLButtonElement;
	cue: QueueCuePoint;
	node: HTMLLIElement;
}

interface MarksView {
	current: QueueCuePoint | undefined;
	isLoaded: boolean;
}

const cueOfButton = new WeakMap<Element, QueueCuePoint>();

const renderList = template('<ol class="player-overlay-tracklist"></ol>', HTMLOListElement);

const renderRow = template(
	/* HTML */ `
		<li>
			<button class="player-overlay-cue" type="button">
				<span class="player-overlay-cue-time"></span><span class="player-overlay-cue-artist"></span
				><span class="player-overlay-cue-title"></span>
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

function renderCue(cue: QueueCuePoint): CueRow {
	const node = renderRow();
	const button = node.querySelector('button');
	const [time, artist, title] = [...node.querySelectorAll('span')];

	if (!button || !time || !artist || !title) {
		throw new Error('The tracklist row template lost part of its markup');
	}

	cueOfButton.set(button, cue);
	time.textContent = formatClock(cue.startSeconds);
	title.textContent = cue.title;

	if (cue.artistLine === '') artist.remove();
	else artist.textContent = cue.artistLine;

	return { button, cue, node };
}

function selectCuePoints(state: PlayerStore): ReadonlyArray<QueueCuePoint> | undefined {
	return displayedItem(state)?.cuePoints;
}

function selectMarks(state: PlayerStore): MarksView {
	return { current: currentCue(state), isLoaded: isLoaded(state) };
}
