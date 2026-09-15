import type { RefObject } from 'react';

import { useEffect, useRef } from 'react';

import type { RowDrag } from '#queue/row-drag.ts';

import { createRowDrag } from '#queue/row-drag.ts';

export function useRowDrag({
	listRef,
	onMove,
}: {
	listRef: RefObject<HTMLElement | null>;
	onMove: (from: number, to: number) => void;
}): RowDrag {
	const dragRef = useRef<RowDrag>(undefined);
	const onMoveRef = useRef(onMove);

	useEffect(() => {
		onMoveRef.current = onMove;
	});

	useEffect(() => {
		const controller = new AbortController();

		dragRef.current = createRowDrag(
			() => listRef.current,
			(from, to) => {
				onMoveRef.current(from, to);
			},
			controller.signal,
		);

		return () => {
			controller.abort();
		};
	}, [listRef]);

	return {
		onPointerCancel: (event) => {
			dragRef.current?.onPointerCancel(event);
		},
		onPointerDown: (event, from) => {
			dragRef.current?.onPointerDown(event, from);
		},
		onPointerMove: (event) => {
			dragRef.current?.onPointerMove(event);
		},
		onPointerUp: (event) => {
			dragRef.current?.onPointerUp(event);
		},
	};
}
