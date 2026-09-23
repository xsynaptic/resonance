const dismissHeightShare = 0.25;
const flickPxPerMs = 0.5;
const flickWindowMs = 100;

const grabAttributes = { isGrabbing: 'data-grabbing' } as const satisfies Record<
	string,
	`data-${string}`
>;

export interface GrabRelease {
	heightPx: number;
	travelPx: number;
	velocityPxPerMs: number;
}

interface OverlayGrab {
	onDismiss: () => void;
	region: HTMLElement;
	sheet: HTMLElement;
}

export function bindOverlayGrab(
	{ onDismiss, region, sheet }: OverlayGrab,
	signal: AbortSignal,
): void {
	let pointerId: number | undefined;
	let fromY = 0;
	let lastY = 0;
	let lastAtMs = 0;
	let travelPx = 0;
	let velocityPxPerMs = 0;

	function show(offsetPx: number): void {
		sheet.style.translate = offsetPx === 0 ? '' : `0 ${String(offsetPx)}px`;
	}

	function settle(): void {
		sheet.toggleAttribute(grabAttributes.isGrabbing, false);
		show(0);
	}

	function onPointerDown(event: PointerEvent): void {
		if (pointerId !== undefined || event.button !== 0) return;

		if (!sheet.contains(region)) return;

		if (event.target instanceof Element && event.target.closest('button, a, input')) return;

		pointerId = event.pointerId;
		fromY = event.clientY;
		lastY = event.clientY;
		lastAtMs = event.timeStamp;
		travelPx = 0;
		velocityPxPerMs = 0;

		if (event.currentTarget instanceof Element) {
			event.currentTarget.setPointerCapture(event.pointerId);
		}

		sheet.toggleAttribute(grabAttributes.isGrabbing, true);
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const elapsedMs = event.timeStamp - lastAtMs;

		travelPx = Math.max(0, event.clientY - fromY);

		if (elapsedMs > 0) velocityPxPerMs = (event.clientY - lastY) / elapsedMs;

		lastY = event.clientY;
		lastAtMs = event.timeStamp;
		show(travelPx);
	}

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

		onDismiss();
		// The dialog's exit carries on from the offset the drag left; a sheet nothing slides away springs back
		if (sheet.getAnimations().length === 0) show(0);
	}

	signal.addEventListener('abort', settle, { once: true });

	region.addEventListener('pointercancel', onPointerEnd, { signal });
	region.addEventListener('pointerdown', onPointerDown, { signal });
	region.addEventListener('pointermove', onPointerMove, { signal });
	region.addEventListener('pointerup', onPointerEnd, { signal });
}

export function isDismissed({ heightPx, travelPx, velocityPxPerMs }: GrabRelease): boolean {
	if (velocityPxPerMs >= flickPxPerMs) return travelPx > 0;

	return travelPx >= heightPx * dismissHeightShare;
}
