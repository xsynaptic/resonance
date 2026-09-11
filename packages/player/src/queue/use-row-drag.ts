import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

import { useEffect, useRef } from 'react';

import { dropIndex, movedIndex } from '#queue/reorder.ts';

// How close to the tray's edge the pointer has to reach before the list scrolls under it
const autoScrollMarginPx = 32;
const autoScrollStepPx = 10;

export interface RowDrag {
	onPointerCancel: () => void;
	onPointerDown: (event: ReactPointerEvent<HTMLElement>, from: number) => void;
	onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerUp: () => void;
}

interface DragSession {
	// Aborting it drops the scroll listener with the drag
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

// Pointer reordering for a vertical list of uniform rows; the rows are moved by transform and committed on release
export function useRowDrag({
	listRef,
	onMove,
}: {
	listRef: RefObject<HTMLElement | null>;
	onMove: (from: number, to: number) => void;
}): RowDrag {
	const sessionRef = useRef<DragSession | undefined>(undefined);

	function paint(): void {
		const list = listRef.current;
		const session = sessionRef.current;
		if (!list || !session) return;

		paintSession(list, session);
	}

	function tick(): void {
		const list = listRef.current;
		const session = sessionRef.current;
		if (!list || !session) return;

		const step = scrollStep(list, session.pointerY);
		if (step !== 0) {
			list.scrollTop += step;
			paintSession(list, session);
		}

		session.frame = requestAnimationFrame(tick);
	}

	function finish(shouldCommit: boolean): void {
		const session = sessionRef.current;
		if (!session) return;

		sessionRef.current = undefined;
		closeSession(session);

		for (const row of session.rows) row.style.transform = '';
		session.rows[session.from]?.removeAttribute('data-dragging');

		if (shouldCommit && session.to !== session.from) onMove(session.from, session.to);
	}

	// The transforms and the ids both go with the unmounted rows, so only the loop and the listener need dropping
	useEffect(() => {
		return () => {
			const session = sessionRef.current;
			if (!session) return;

			sessionRef.current = undefined;
			closeSession(session);
		};
	}, []);

	return {
		onPointerCancel: () => {
			finish(false);
		},

		// Capture on the handle routes every later event here, so the drag needs no document listeners
		onPointerDown: (event: ReactPointerEvent<HTMLElement>, from: number) => {
			const list = listRef.current;
			if (!list || sessionRef.current) return;

			const session = openSession(list, event, from);
			if (!session) return;

			event.currentTarget.setPointerCapture(event.pointerId);
			list.addEventListener('scroll', paint, { signal: session.controller.signal });

			sessionRef.current = session;
			session.frame = requestAnimationFrame(tick);
		},

		onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
			const session = sessionRef.current;
			if (event.pointerId !== session?.pointerId) return;

			session.pointerY = event.clientY;
			paint();
		},

		onPointerUp: () => {
			finish(true);
		},
	};
}

// Drops the scroll listener and the auto-scroll loop; the transforms are the caller's to clear
function closeSession(session: DragSession): void {
	session.controller.abort();
	if (session.frame !== undefined) cancelAnimationFrame(session.frame);
}

function contentY(list: HTMLElement, clientY: number): number {
	return clientY - list.getBoundingClientRect().top + list.scrollTop;
}

// Measures the list once: every later frame reads these rather than the layout
function openSession(
	list: HTMLElement,
	event: ReactPointerEvent<HTMLElement>,
	from: number,
): DragSession | undefined {
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
