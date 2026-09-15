export type OverlayLayout = 'columns' | 'phone';

// Rem, so the switch follows the reader's font size as a media query would
const columnsMinWidthRem = 40;
const columnsMinHeightRem = 30;

export function layoutFor(width: number, height: number): OverlayLayout {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('16px')` is NaN; a computed font size carries its unit
	const remPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

	return width >= columnsMinWidthRem * remPixels && height >= columnsMinHeightRem * remPixels
		? 'columns'
		: 'phone';
}
