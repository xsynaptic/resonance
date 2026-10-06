// Below about 45 the envelope reads as a band rather than as beats; the two lowest rungs buy context at that cost
const zoomLevels: ReadonlyArray<number> = [20, 30, 45, 70, 105, 160, 240];

export const panelZoomDefault = 70;
export const panelZoomMin = Math.min(...zoomLevels);
export const panelZoomMax = Math.max(...zoomLevels);

export function isPanelZoom(pxPerSecond: number): boolean {
	return pxPerSecond >= panelZoomMin && pxPerSecond <= panelZoomMax;
}

export function stepPanelZoom(pxPerSecond: number, steps: number): number {
	const rungs =
		steps > 0
			? zoomLevels.filter((level) => level > pxPerSecond)
			: zoomLevels.filter((level) => level < pxPerSecond).toReversed();

	return rungs[Math.min(rungs.length, Math.abs(steps)) - 1] ?? pxPerSecond;
}
