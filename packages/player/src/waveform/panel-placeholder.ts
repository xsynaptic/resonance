import type { WaveformArchive } from '#waveform/waveform-archive.ts';
import type { SecondsSpan } from '#waveform/waveform-scroll.ts';

// The status pill's delay, so a chunk that lands quickly never flashes a placeholder
const placeholderDelayMs = 400;
const placeholderPeriodMs = 2500;

// Stands for the whole window while the archive's header is still on its way
const openingKey = -1;

interface PendingSpan extends SecondsSpan {
	key: number;
	sinceMs: number;
}

interface PlaceholderInput {
	archive: undefined | WaveformArchive;
	frameMs: number;
	fromPair: number;
	isArchiveOpening: boolean;
	isDrawn: (span: SecondsSpan) => boolean;
	toPair: number;
	windowSpan: SecondsSpan;
}

export function createPanelPlaceholder() {
	const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

	let openingSinceMs: number | undefined;

	return {
		// `repaintKey` changes every frame only while a placeholder travels
		frame: (input: PlaceholderInput) => {
			openingSinceMs = input.isArchiveOpening ? (openingSinceMs ?? input.frameMs) : undefined;

			const spans = pendingSpans(input, openingSinceMs).filter(
				(span) => input.frameMs - span.sinceMs >= placeholderDelayMs && input.isDrawn(span),
			);

			if (reducedMotion.matches || spans.length === 0) {
				return { phase: 0, repaintKey: spans.map((span) => span.key).join(','), spans };
			}

			return {
				phase: input.frameMs / placeholderPeriodMs,
				repaintKey: String(input.frameMs),
				spans,
			};
		},
	};
}

function pendingSpans(
	{ archive, frameMs, fromPair, toPair, windowSpan }: PlaceholderInput,
	openingSinceMs: number | undefined,
): Array<PendingSpan> {
	if (openingSinceMs !== undefined)
		return [{ ...windowSpan, key: openingKey, sinceMs: openingSinceMs }];
	if (!archive) return [];

	return archive.missing(fromPair, toPair).map((missing) => ({
		fromSeconds: missing.fromPair / archive.pairsPerSecond,
		key: missing.chunk,
		sinceMs: missing.askedMs ?? frameMs,
		toSeconds: missing.toPair / archive.pairsPerSecond,
	}));
}
