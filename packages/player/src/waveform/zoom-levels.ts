// Below about 45 CSS px per second the envelope starts to collapse into a band
const zoomLevels: ReadonlyArray<number> = [20, 30, 45, 70, 105, 160, 240];

export const panelZoomDefault = 70;

export function stepPanelZoom(pxPerSecond: number, steps: number): number {
	const from = zoomLevels.indexOf(pxPerSecond);
	const to = Math.min(zoomLevels.length - 1, Math.max(0, from + steps));

	return zoomLevels[to] ?? panelZoomDefault;
}
