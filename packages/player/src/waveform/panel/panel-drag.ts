export interface PanelDrag {
	// What the last frame drew: where the next drag starts, and what it is clamped against
	showing(timeSeconds: number, durationSeconds: number | undefined): void;
	// The position the drag is holding, overriding the clock until the pointer is let go
	targetSeconds(): number | undefined;
}

interface PanelDragOptions {
	// A panel with nothing loaded has no position to drag
	canDrag: () => boolean;
	onSeek: (seconds: number) => void;
	panel: HTMLElement;
	pxPerSecond: () => number;
	signal: AbortSignal;
}

// Dragging the waveform moves it with the finger, so pulling right walks back through the mix
export function createPanelDrag({
	canDrag,
	onSeek,
	panel,
	pxPerSecond,
	signal,
}: PanelDragOptions): PanelDrag {
	let shownTimeSeconds = 0;
	let shownDurationSeconds: number | undefined;

	let pointerId: number | undefined;
	let dragFromX = 0;
	let dragFromSeconds = 0;
	let dragToSeconds: number | undefined;

	function onPointerDown(event: PointerEvent): void {
		if (event.button !== 0 || !canDrag()) return;
		if (event.target instanceof Element && event.target.closest('[data-panel-control]')) return;

		pointerId = event.pointerId;
		dragFromX = event.clientX;
		dragFromSeconds = shownTimeSeconds;
		dragToSeconds = shownTimeSeconds;

		panel.setPointerCapture(event.pointerId);
		panel.toggleAttribute('data-dragging', true);
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const targetSeconds = dragFromSeconds - (event.clientX - dragFromX) / pxPerSecond();

		dragToSeconds = Math.min(shownDurationSeconds ?? Infinity, Math.max(0, targetSeconds));
	}

	// A cancelled drag commits too: the panel already moved, and snapping back reads as a dropped gesture
	function onPointerEnd(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		if (dragToSeconds !== undefined) onSeek(dragToSeconds);

		pointerId = undefined;
		dragToSeconds = undefined;
		panel.toggleAttribute('data-dragging', false);
	}

	panel.addEventListener('pointercancel', onPointerEnd, { signal });
	panel.addEventListener('pointerdown', onPointerDown, { signal });
	panel.addEventListener('pointermove', onPointerMove, { signal });
	panel.addEventListener('pointerup', onPointerEnd, { signal });

	return {
		showing(timeSeconds, durationSeconds) {
			shownTimeSeconds = timeSeconds;
			shownDurationSeconds = durationSeconds;
		},
		targetSeconds: () => dragToSeconds,
	};
}
