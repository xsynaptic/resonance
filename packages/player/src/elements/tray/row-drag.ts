import { dropIndex, movedIndex } from '#queue/reorder.ts';

const autoScrollMarginPx = 32;
const autoScrollStepPx = 10;

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
	// Row centres in the list's content box, so scrolling never invalidates them
	midpoints: Array<number>;
	pointerId: number;
	pointerY: number;
	rowHeight: number;
	rows: Array<HTMLElement>;
	startContentY: number;
	to: number;
}

interface RowPointer {
	clientY: number;
	pointerId: number;
}

// The handle pressed, which takes the capture so every later event of the drag reaches it
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

	function tick(): void {
		const list = getList();
		if (!list || !session) return;

		const step = scrollStep(list, session.pointerY);
		if (step !== 0) {
			list.scrollTop += step;
			paintSession(list, session);
		}

		session.frame = requestAnimationFrame(tick);
	}

	function finish(shouldCommit: boolean): void {
		const finished = session;
		if (!finished) return;

		session = undefined;
		closeSession(finished);

		for (const row of finished.rows) row.style.transform = '';
		finished.rows[finished.from]?.removeAttribute('data-dragging');

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
			list.addEventListener('scroll', paint, { signal: opened.controller.signal });

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

	row.dataset.dragging = '';

	return {
		controller: new AbortController(),
		frame: undefined,
		from,
		midpoints: rows.map((node) => {
			const rect = node.getBoundingClientRect();

			return rect.top + rect.height / 2 - listTop + scrollTop;
		}),
		pointerId: event.pointerId,
		pointerY: event.clientY,
		rowHeight: row.getBoundingClientRect().height,
		rows,
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

function scrollStep(list: HTMLElement, pointerY: number): number {
	const rect = list.getBoundingClientRect();

	if (pointerY - rect.top < autoScrollMarginPx) return -autoScrollStepPx;
	if (rect.bottom - pointerY < autoScrollMarginPx) return autoScrollStepPx;

	return 0;
}
