import { dropIndex, movedIndex } from '#queue/reorder.ts';

const autoScrollMarginPx = 32;
const autoScrollPxPerSecond = 600;

const dragAttributes = { isDragging: 'data-dragging' } as const satisfies Record<
	string,
	`data-${string}`
>;

export interface RowDrag {
	onPointerCancel: (event: Pick<RowPointer, 'pointerId'>) => void;
	onPointerDown: (event: RowPointerDown, from: number) => void;
	onPointerMove: (event: RowPointer) => void;
	onPointerUp: (event: Pick<RowPointer, 'pointerId'>) => void;
}

interface DragSession {
	controller: AbortController;
	frame: number | undefined;
	from: number;
	lastFrameTime: number | undefined;
	// Row centres in the list's content box, so scrolling never invalidates them
	midpoints: Array<number>;
	pointerId: number;
	pointerY: number;
	rowHeight: number;
	rows: Array<HTMLElement>;
	scroller: HTMLElement | undefined;
	scrollRange: number;
	startContentY: number;
	to: number;
}

interface RowPointer {
	clientY: number;
	pointerId: number;
}

interface RowPointerDown extends RowPointer {
	currentTarget: Element;
}

// An abort drops a drag in flight; the transforms go with the rows it leaves behind
export function createRowDrag(
	getList: () => HTMLElement | null,
	onMove: (from: number, to: number) => void,
	signal: AbortSignal,
): RowDrag {
	let session: DragSession | undefined;

	function paint(): void {
		const list = getList();
		if (!list || !session) return;

		paintSession(list, session);
	}

	function tick(time: number): void {
		const list = getList();
		if (!list || !session) return;

		const elapsed = session.lastFrameTime === undefined ? 0 : time - session.lastFrameTime;

		session.lastFrameTime = time;
		session.frame = requestAnimationFrame(tick);

		const { scroller } = session;
		if (!scroller) return;

		const step =
			scrollDirection(scroller, session.pointerY) * autoScrollPxPerSecond * (elapsed / 1000);
		const scrollTop = Math.min(Math.max(scroller.scrollTop + step, 0), session.scrollRange);
		if (scrollTop === scroller.scrollTop) return;

		scroller.scrollTop = scrollTop;
		paintSession(list, session);
	}

	function finish(shouldCommit: boolean): void {
		const finished = session;
		if (!finished) return;

		session = undefined;
		closeSession(finished);

		for (const row of finished.rows) row.style.transform = '';
		finished.rows[finished.from]?.removeAttribute(dragAttributes.isDragging);

		if (shouldCommit && finished.to !== finished.from) onMove(finished.from, finished.to);
	}

	signal.addEventListener(
		'abort',
		() => {
			if (session) closeSession(session);
			session = undefined;
		},
		{ once: true },
	);

	return {
		// A second finger lifting elsewhere in the list reaches a delegated listener too, and is not this drag's release
		onPointerCancel: (event) => {
			if (event.pointerId !== session?.pointerId) return;

			finish(false);
		},

		// Capture on the handle routes every later event to it, so the drag needs no document listeners
		onPointerDown: (event, from) => {
			const list = getList();
			if (!list || session) return;

			const opened = openSession(list, event, from);
			if (!opened) return;

			event.currentTarget.setPointerCapture(event.pointerId);
			opened.scroller?.addEventListener('scroll', paint, { signal: opened.controller.signal });

			session = opened;
			opened.frame = requestAnimationFrame(tick);
		},

		onPointerMove: (event) => {
			if (event.pointerId !== session?.pointerId) return;

			session.pointerY = event.clientY;
			paint();
		},

		onPointerUp: (event) => {
			if (event.pointerId !== session?.pointerId) return;

			finish(true);
		},
	};
}

// The transforms are the caller's to clear
function closeSession(session: DragSession): void {
	session.controller.abort();
	if (session.frame !== undefined) cancelAnimationFrame(session.frame);
}

function contentY(list: HTMLElement, clientY: number): number {
	return clientY - list.getBoundingClientRect().top + list.scrollTop;
}

// Measures the list once: every later frame reads these rather than the layout
function openSession(list: HTMLElement, event: RowPointer, from: number): DragSession | undefined {
	const rows = [...list.querySelectorAll<HTMLElement>('.player-tray-item')];
	const row = rows[from];
	if (!row) return undefined;

	const listTop = list.getBoundingClientRect().top;
	const { scrollTop } = list;
	const scroller = scrollerOf(list);

	row.toggleAttribute(dragAttributes.isDragging, true);

	return {
		controller: new AbortController(),
		frame: undefined,
		from,
		lastFrameTime: undefined,
		midpoints: rows.map((node) => {
			const rect = node.getBoundingClientRect();

			return rect.top + rect.height / 2 - listTop + scrollTop;
		}),
		pointerId: event.pointerId,
		pointerY: event.clientY,
		rowHeight: row.getBoundingClientRect().height,
		rows,
		scroller,
		scrollRange: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
		startContentY: event.clientY - listTop + scrollTop,
		to: from,
	};
}

function paintSession(list: HTMLElement, session: DragSession): void {
	const y = contentY(list, session.pointerY);

	session.to = dropIndex(session.midpoints, session.from, y);

	for (const [index, row] of session.rows.entries()) {
		const offset =
			index === session.from
				? y - session.startContentY
				: (movedIndex(index, session.from, session.to) - index) * session.rowHeight;

		row.style.transform = offset === 0 ? '' : `translateY(${String(offset)}px)`;
	}
}

function scrollDirection(scroller: HTMLElement, pointerY: number): number {
	const rect = scroller.getBoundingClientRect();

	if (pointerY - rect.top < autoScrollMarginPx) return -1;
	if (rect.bottom - pointerY < autoScrollMarginPx) return 1;

	return 0;
}

// The overlay lifts the list's height cap, so an ancestor scrolls there instead
function scrollerOf(list: HTMLElement): HTMLElement | undefined {
	for (let node: HTMLElement | null = list; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);

		if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
			return node;
		}
	}

	return undefined;
}
