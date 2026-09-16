// Past a quarter of the sheet the gesture reads as a dismissal; a flick counts before the distance does
const dismissHeightShare = 0.25;
const flickPxPerMs = 0.5;
// A flick is only a flick while the finger is still moving; one held still and let go is judged on distance
const flickWindowMs = 100;

const grabAttributes = { isGrabbing: 'data-grabbing' } as const satisfies Record<
	string,
	`data-${string}`
>;

// Everything else in the deck owns a gesture of its own
const grabRegions = '.player-overlay-grabber, .player-overlay-head, .player-overlay-art';

export interface GrabRelease {
	heightPx: number;
	travelPx: number;
	velocityPxPerMs: number;
}

interface OverlayGrab {
	body: HTMLElement;
	onDismiss: () => void;
}

export function bindOverlayGrab({ body, onDismiss }: OverlayGrab, signal: AbortSignal): void {
	const sheet = body.closest('dialog') ?? body;

	let pointerId: number | undefined;
	let fromY = 0;
	let lastY = 0;
	let lastAtMs = 0;
	let travelPx = 0;
	let velocityPxPerMs = 0;

	function show(offsetPx: number): void {
		sheet.style.translate = offsetPx === 0 ? '' : `0 ${String(offsetPx)}px`;
	}

	function onPointerDown(event: PointerEvent): void {
		if (pointerId !== undefined || event.button !== 0) return;
		// A press on a control belongs to that control
		if (event.target instanceof Element && event.target.closest('button, a, input')) return;

		pointerId = event.pointerId;
		fromY = event.clientY;
		lastY = event.clientY;
		lastAtMs = event.timeStamp;
		travelPx = 0;
		velocityPxPerMs = 0;

		// Capture routes every later event to the region pressed, so the drag needs no document listeners
		if (event.currentTarget instanceof Element) {
			event.currentTarget.setPointerCapture(event.pointerId);
		}

		sheet.toggleAttribute(grabAttributes.isGrabbing, true);
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const elapsedMs = event.timeStamp - lastAtMs;

		// Downward only: a sheet pulled up has nowhere to go, and following it there reads as stuck
		travelPx = Math.max(0, event.clientY - fromY);
		if (elapsedMs > 0) velocityPxPerMs = (event.clientY - lastY) / elapsedMs;

		lastY = event.clientY;
		lastAtMs = event.timeStamp;
		show(travelPx);
	}

	// A cancelled grab is released where it stood, as the panel's drag is
	function onPointerEnd(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const release = {
			heightPx: sheet.clientHeight,
			travelPx,
			velocityPxPerMs: event.timeStamp - lastAtMs <= flickWindowMs ? velocityPxPerMs : 0,
		};

		pointerId = undefined;
		sheet.toggleAttribute(grabAttributes.isGrabbing, false);
		// Cleared before the close, since the dialog outlives the contents that moved it
		show(0);

		if (isDismissed(release)) onDismiss();
	}

	// The dialog outlives these listeners, so an overlay closed mid-grab leaves no offset behind
	signal.addEventListener(
		'abort',
		() => {
			sheet.toggleAttribute(grabAttributes.isGrabbing, false);
			show(0);
		},
		{ once: true },
	);

	for (const region of body.querySelectorAll<HTMLElement>(grabRegions)) {
		region.addEventListener('pointercancel', onPointerEnd, { signal });
		region.addEventListener('pointerdown', onPointerDown, { signal });
		region.addEventListener('pointermove', onPointerMove, { signal });
		region.addEventListener('pointerup', onPointerEnd, { signal });
	}
}

export function isDismissed({ heightPx, travelPx, velocityPxPerMs }: GrabRelease): boolean {
	if (velocityPxPerMs >= flickPxPerMs) return travelPx > 0;

	return travelPx >= heightPx * dismissHeightShare;
}
