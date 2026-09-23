import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { QueuedItem } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { createRowDrag } from '#elements/tray/row-drag.ts';
import { rowPressAt, trayRows } from '#elements/tray/tray-rows.ts';
import { bind } from '#lib/bind.ts';
import { formatTemplate } from '#lib/format.ts';
import { requireChild, requireChildren, template } from '#lib/render.ts';
import { canMove } from '#queue/reorder.ts';

interface TrayParts {
	empty: HTMLElement;
	list: HTMLUListElement;
	status: HTMLElement;
	tray: HTMLDivElement;
}

const renderTray = template(
	/* HTML */ `
		<div class="player-tray">
			<ul class="player-tray-list"></ul>
			<p class="player-tray-empty"></p>
			<p aria-live="polite" class="player-tray-status" role="status"></p>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerTray extends PlayerElement {
	readonly #parts = renderTrayParts();

	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const parts = this.#parts;

		this.appendOnce(parts.tray);
		bindList(parts, context, signal);
		bindReorder(parts, context, signal);
	}
}

function bindList(
	{ empty, list }: TrayParts,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	// A reconnect starts a fresh key map, which would leave the previous connection's rows behind
	list.replaceChildren();
	empty.textContent = labels.empty;

	const render = trayRows(list, labels);

	list.addEventListener(
		'click',
		(event) => {
			const press = rowPressAt(event.target);
			if (!press || press.control === 'handle') return;

			const index = indexOfQueued(store.getState().queue, press.queueId);

			if (press.control === 'pick') store.getState().playAt(index);
			else store.getState().removeAt(index);
		},
		{ signal },
	);
	bind(
		store,
		selectList,
		({ currentIndex, queue }) => {
			list.hidden = queue.length === 0;
			empty.hidden = queue.length > 0;
			render({ currentIndex, queue });
		},
		signal,
	);
}

function bindReorder(
	{ list, status }: TrayParts,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	const move = (from: number, to: number): void => {
		const total = store.getState().queue.length;

		store.getState().moveItem(from, to);
		status.textContent = formatTemplate(labels.moved, { position: to + 1, total });
	};
	const drag = createRowDrag(() => list, move, signal);

	list.addEventListener(
		'keydown',
		(event) => {
			const press = rowPressAt(event.target);
			if (press?.control !== 'handle' || !event.altKey) return;
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

			const { queue } = store.getState();
			const from = indexOfQueued(queue, press.queueId);
			const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
			if (!canMove(queue.length, from, to)) return;

			event.preventDefault();
			move(from, to);
		},
		{ signal },
	);
	list.addEventListener(
		'pointerdown',
		(event) => {
			const press = rowPressAt(event.target);
			if (press?.control !== 'handle') return;

			const from = indexOfQueued(store.getState().queue, press.queueId);

			drag.onPointerDown(
				{ clientY: event.clientY, currentTarget: press.button, pointerId: event.pointerId },
				from,
			);
		},
		{ signal },
	);
	list.addEventListener('pointermove', drag.onPointerMove, { signal });
	list.addEventListener('pointerup', drag.onPointerUp, { signal });
	list.addEventListener('pointercancel', drag.onPointerCancel, { signal });
}

function indexOfQueued(queue: ReadonlyArray<QueuedItem>, queueId: string): number {
	return queue.findIndex((item) => item.queueId === queueId);
}

function renderTrayParts(): TrayParts {
	const tray = renderTray();
	const [empty, status] = requireChildren(tray, 'p', 2, HTMLParagraphElement);

	return { empty, list: requireChild(tray, 'ul', HTMLUListElement), status, tray };
}

function selectList(state: PlayerStore): Pick<PlayerStore, 'currentIndex' | 'queue'> {
	return { currentIndex: state.currentIndex, queue: state.queue };
}
