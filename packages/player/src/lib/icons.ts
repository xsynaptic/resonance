import { template } from '#lib/render.ts';

interface LucideIcon {
	isSolid?: boolean;
	name: string;
	size: number;
	strokeWidth?: number;
}

const glyphHeight = 512;

// Lucide has no numbered arrow, so the count is ours, set in the arrow's open centre
const seekCount =
	'<text dominant-baseline="central" fill="currentColor" font-size="7" font-weight="700" stroke="none" text-anchor="middle" x="12" y="12.5"></text>';

const cross = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

// The three levels share one speaker, so it holds still as the waves change
const speaker =
	'<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';

// Lucide 1.51.0 (ISC), shapes as published; `name` is the Lucide icon and lands on the element as `data-lucide`
// `isSolid` and `strokeWidth` are the only departures from stock, beside the seek count
// Font Awesome Free 6.7.2 solid (CC BY 4.0) for `queue` and `tracklist`, the two `glyph` entries
const icons = {
	// Sized to the status line beside it rather than to the transport
	alert: lucide(
		{ name: 'circle-alert', size: 18 },
		'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
	),
	close: lucide({ name: 'x', size: 18 }, cross),
	closeLarge: lucide({ name: 'x', size: 20 }, cross),
	dragHandle: lucide(
		{ name: 'grip-vertical', size: 18 },
		'<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
	),
	expand: lucide(
		{ name: 'fullscreen', size: 20, strokeWidth: 2.5 },
		'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/>',
	),
	next: lucide(
		{ isSolid: true, name: 'skip-forward', size: 20 },
		'<path d="M21 4v16"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/>',
	),
	pause: lucide(
		{ isSolid: true, name: 'pause', size: 20 },
		'<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
	),
	play: lucide(
		{ isSolid: true, name: 'play', size: 20 },
		'<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
	),
	// Drawn on a pixel grid rather than from a glyph, so each bar lands on whole pixels at its thinnest
	playing:
		'<svg aria-hidden="true" fill="currentColor" height="10" viewBox="0 0 8 10" width="8"><rect height="5" rx="0.5" width="2" x="0" y="5"/><rect height="10" rx="0.5" width="2" x="3" y="0"/><rect height="7" rx="0.5" width="2" x="6" y="3"/></svg>',
	previous: lucide(
		{ isSolid: true, name: 'skip-back', size: 20 },
		'<path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><path d="M3 20V4"/>',
	),
	queue: glyph(
		512,
		16,
		'<path d="M40 48C26.7 48 16 58.7 16 72l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24L40 48zM192 64c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L192 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zM16 232l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24zM40 368c-13.3 0-24 10.7-24 24l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0z"/>',
	),
	seekBack: lucide(
		{ name: 'rotate-ccw', size: 25 },
		`<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>${seekCount}`,
	),
	seekForward: lucide(
		{ name: 'rotate-cw', size: 25 },
		`<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>${seekCount}`,
	),
	tracklist: glyph(
		512,
		16,
		'<path d="M24 56c0-13.3 10.7-24 24-24l32 0c13.3 0 24 10.7 24 24l0 120 16 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l16 0 0-96-8 0C34.7 80 24 69.3 24 56zM86.7 341.2c-6.5-7.4-18.3-6.9-24 1.2L51.5 357.9c-7.7 10.8-22.7 13.3-33.5 5.6s-13.3-22.7-5.6-33.5l11.1-15.6c23.7-33.2 72.3-35.6 99.2-4.9c21.3 24.4 20.8 60.9-1.1 84.7L86.8 432l33.2 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-88 0c-9.5 0-18.2-5.6-22-14.4s-2.1-18.9 4.3-25.9l72-78c5.3-5.8 5.4-14.6 .3-20.5zM224 64l256 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32s14.3-32 32-32zm0 160l256 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32s14.3-32 32-32zm0 160l256 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/>',
	),
	volume: lucide(
		{ name: 'volume-2', size: 20 },
		`${speaker}<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>`,
	),
	volumeLow: lucide({ name: 'volume', size: 20 }, speaker),
	volumeMedium: lucide({ name: 'volume-1', size: 20 }, `${speaker}<path d="M16 9a5 5 0 0 1 0 6"/>`),
	volumeMuted: lucide(
		{ name: 'volume-x', size: 20 },
		'<path d="M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z"/><path d="m16.5 14.5 5-5"/><path d="m16.5 9.5 5 5"/>',
	),
	waveform: lucide(
		{ name: 'audio-waveform', size: 20 },
		'<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>',
	),
	zoomIn: lucide(
		{ name: 'zoom-in', size: 13 },
		'<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
	),
	zoomOut: lucide(
		{ name: 'zoom-out', size: 13 },
		'<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
	),
} as const;

export type IconName = keyof typeof icons;

const renderers = new Map<IconName, () => SVGSVGElement>();

export function cloneIcon(name: IconName): SVGSVGElement {
	let render = renderers.get(name);

	if (!render) {
		render = template(icons[name], SVGSVGElement);
		renderers.set(name, render);
	}

	return render();
}

function glyph(glyphWidth: number, size: number, children: string): string {
	const width = String((size * glyphWidth) / glyphHeight);

	return `<svg aria-hidden="true" fill="currentColor" height="${String(size)}" viewBox="0 0 ${String(glyphWidth)} ${String(glyphHeight)}" width="${width}">${children}</svg>`;
}

function lucide({ isSolid, name, size, strokeWidth }: LucideIcon, children: string): string {
	const fill = isSolid === true ? 'currentColor' : 'none';

	return `<svg aria-hidden="true" data-lucide="${name}" fill="${fill}" height="${String(size)}" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${String(strokeWidth ?? 2)}" viewBox="0 0 24 24" width="${String(size)}">${children}</svg>`;
}
