import type { PlayerContext } from '#elements/player-context.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { QueuedItem } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { rowPressAt, trayRows } from '#elements/tray/tray-rows.ts';
import { bind } from '#lib/bind.ts';
import { formatTemplate } from '#lib/format.ts';
import { template } from '#lib/render.ts';
import { isSectioned } from '#queue/queue.ts';
import { canMove } from '#queue/reorder.ts';
import { createRowDrag } from '#queue/row-drag.ts';

interface TrayParts {
	clear: HTMLButtonElement;
	empty: HTMLElement;
	header: HTMLElement;
	list: HTMLUListElement;
	shuffle: HTMLButtonElement;
	status: HTMLElement;
	tray: HTMLDivElement;
}

const renderTray = template(
	'<div class="player-tray"><div class="player-tray-header"><button class="player-tray-action" type="button"></button><button class="player-tray-action" type="button"></button></div><ul class="player-tray-list"></ul><p class="player-tray-empty"></p><p aria-live="polite" class="player-tray-status" role="status"></p></div>',
	HTMLDivElement,
);

export class PlayerTray extends PlayerElement {
	readonly #parts = renderTrayParts();

	protected connect(signal: AbortSignal): void {
		const context = playerContext(this);
		const parts = this.#parts;

		this.appendOnce(parts.tray);
		bindHeader(parts, context, signal);
		bindList(parts, context, signal);
		bindReorder(parts, context, signal);
	}
}

function bindHeader(
	{ clear, header, shuffle }: TrayParts,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
	shuffle.textContent = labels.shuffle;
	clear.textContent = labels.clearQueue;
	shuffle.addEventListener(
		'click',
		() => {
			store.getState().toggleShuffle();
		},
		{ signal },
	);
	clear.addEventListener(
		'click',
		() => {
			store.getState().clearQueue();
		},
		{ signal },
	);
	bind(
		store,
		selectShuffle,
		({ isShuffling, queue }) => {
			shuffle.setAttribute('aria-pressed', String(isShuffling));

			// A sectioned queue cannot shuffle, so its button goes rather than sitting disabled
			if (isSectioned(queue)) shuffle.remove();
			else if (shuffle.parentNode !== header) header.prepend(shuffle);
		},
		signal,
	);
}

function bindList(
	{ empty, list }: TrayParts,
	{ labels, store }: PlayerContext,
	signal: AbortSignal,
): void {
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
			render({ canReorder: !isSectioned(queue), currentIndex, queue });
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
	const header = tray.querySelector<HTMLElement>('.player-tray-header');
	const [shuffle, clear] = [...tray.querySelectorAll('button')];
	const list = tray.querySelector('ul');
	const [empty, status] = [...tray.querySelectorAll('p')];

	if (!header || !shuffle || !clear || !list || !empty || !status) {
		throw new Error('The tray template lost part of its markup');
	}

	return { clear, empty, header, list, shuffle, status, tray };
}

function selectList(state: PlayerStore): Pick<PlayerStore, 'currentIndex' | 'queue'> {
	return { currentIndex: state.currentIndex, queue: state.queue };
}

function selectShuffle(state: PlayerStore): Pick<PlayerStore, 'isShuffling' | 'queue'> {
	return { isShuffling: state.isShuffling, queue: state.queue };
}
