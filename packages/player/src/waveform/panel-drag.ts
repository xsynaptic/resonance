export interface PanelDrag {
	// What the last frame drew: where the next drag starts, and what it is clamped against
	showing(timeSeconds: number, durationSeconds: number | undefined): void;
	stop(): void;
	// The position the drag is holding, overriding the clock until the pointer is let go
	targetSeconds(): number | undefined;
}

interface PanelDragOptions {
	// A panel with nothing loaded has no position to drag
	canDrag: () => boolean;
	onSeek: (seconds: number) => void;
	panel: HTMLElement;
	pxPerSecond: number;
}

// Dragging the waveform moves it with the finger, so pulling right walks back through the mix
export function createPanelDrag({
	canDrag,
	onSeek,
	panel,
	pxPerSecond,
}: PanelDragOptions): PanelDrag {
	let shownTimeSeconds = 0;
	let shownDurationSeconds: number | undefined;

	// One seek commits where the drag landed
	let pointerId: number | undefined;
	let dragFromX = 0;
	let dragFromSeconds = 0;
	let dragToSeconds: number | undefined;

	function onPointerDown(event: PointerEvent): void {
		if (event.button !== 0 || !canDrag()) return;

		pointerId = event.pointerId;
		dragFromX = event.clientX;
		dragFromSeconds = shownTimeSeconds;
		dragToSeconds = shownTimeSeconds;

		panel.setPointerCapture(event.pointerId);
		panel.toggleAttribute('data-dragging', true);
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const targetSeconds = dragFromSeconds - (event.clientX - dragFromX) / pxPerSecond;

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

	panel.addEventListener('pointercancel', onPointerEnd);
	panel.addEventListener('pointerdown', onPointerDown);
	panel.addEventListener('pointermove', onPointerMove);
	panel.addEventListener('pointerup', onPointerEnd);

	return {
		showing(timeSeconds, durationSeconds) {
			shownTimeSeconds = timeSeconds;
			shownDurationSeconds = durationSeconds;
		},
		stop() {
			panel.removeEventListener('pointercancel', onPointerEnd);
			panel.removeEventListener('pointerdown', onPointerDown);
			panel.removeEventListener('pointermove', onPointerMove);
			panel.removeEventListener('pointerup', onPointerEnd);
		},
		targetSeconds: () => dragToSeconds,
	};
}
