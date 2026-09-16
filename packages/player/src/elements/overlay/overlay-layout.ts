import { readPxProperty } from '#lib/read-px-property.ts';

export type OverlayLayout = 'columns' | 'phone';

// Rem, so the switch follows the reader's font size as a media query would
const columnsMinWidthRem = 40;
const columnsMinHeightRem = 30;

export function layoutFor(width: number, height: number): OverlayLayout {
	const remPixels = readPxProperty(getComputedStyle(document.documentElement), 'font-size', 16);

	return width >= columnsMinWidthRem * remPixels && height >= columnsMinHeightRem * remPixels
		? 'columns'
		: 'phone';
}
