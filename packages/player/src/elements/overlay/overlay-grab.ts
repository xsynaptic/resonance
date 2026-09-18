// Past a quarter of the sheet the gesture reads as a dismissal; a flick counts before the distance does
const dismissHeightShare = 0.25;
const flickPxPerMs = 0.5;
// A flick is only a flick while the finger is still moving; one held still and let go is judged on distance
const flickWindowMs = 100;
const exitMs = 200;

const grabAttributes = { isGrabbing: 'data-grabbing' } as const satisfies Record<
	string,
	`data-${string}`
>;

// The deck's controls each own a gesture; in landscape the art box stays a grab band with its cover hidden
const grabRegion = '.player-overlay-art';

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
	const region = body.querySelector<HTMLElement>(grabRegion);
	if (!region) return;

	const sheet = body.closest('dialog') ?? body;

	let pointerId: number | undefined;
	let fromY = 0;
	let lastY = 0;
	let lastAtMs = 0;
	let travelPx = 0;
	let velocityPxPerMs = 0;
	let exit: Animation | undefined;

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

		if (!isDismissed(release)) {
			show(0);
			return;
		}

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			onDismiss();
			return;
		}

		exit = sheet.animate(
			{ opacity: 0, translate: '0 100%' },
			{ duration: exitMs, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' },
		);
		// A cancel fires no finish, so an overlay closed some other way mid-exit is not closed twice
		exit.addEventListener('finish', onDismiss, { once: true });
	}

	signal.addEventListener(
		'abort',
		() => {
			exit?.cancel();
			sheet.toggleAttribute(grabAttributes.isGrabbing, false);
			show(0);
		},
		{ once: true },
	);

	region.addEventListener('pointercancel', onPointerEnd, { signal });
	region.addEventListener('pointerdown', onPointerDown, { signal });
	region.addEventListener('pointermove', onPointerMove, { signal });
	region.addEventListener('pointerup', onPointerEnd, { signal });
}

export function isDismissed({ heightPx, travelPx, velocityPxPerMs }: GrabRelease): boolean {
	if (velocityPxPerMs >= flickPxPerMs) return travelPx > 0;

	return travelPx >= heightPx * dismissHeightShare;
}
