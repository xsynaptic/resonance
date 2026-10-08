import type { FillColumns } from '#elements/scope/scope-trace.ts';
import type { PlayerStoreApi } from '#store/player-types.ts';
import type { QueueArchive } from '#types.ts';

import { traceScope } from '#elements/scope/scope-trace.ts';
import { subscribeStoreTime } from '#store/subscribe-time.ts';
import { createScrollClock } from '#waveform/panel/scroll-clock.ts';
import { openArchive } from '#waveform/panel/waveform-archive.ts';

// 8-bit signed pairs, so an edge reaches 128 either side of the centre line
const fullScale = 128;

interface ArchiveTrace {
	archive: QueueArchive | undefined;
	store: PlayerStoreApi;
	windowSeconds: number;
}

interface PairSpan {
	highest: number;
	lowest: number;
}

export function traceArchive(
	canvas: HTMLCanvasElement,
	{ archive: source, store, windowSeconds }: ArchiveTrace,
	signal: AbortSignal,
): void {
	const clock = createScrollClock({
		elementTime: store.getState().getCurrentTime,
		subscribeTime: subscribeStoreTime(store),
	});
	signal.addEventListener('abort', clock.stop, { once: true });

	const fillColumns: FillColumns = (frameMs, columns) => {
		if (!source) {
			columns.highest.fill(0);
			columns.lowest.fill(0);
			return;
		}

		const archive = openArchive(source);

		const seconds = clock.read(frameMs, true);

		const windowPairs = windowSeconds * archive.pairsPerSecond;
		const firstPair = seconds * archive.pairsPerSecond - windowPairs / 2;
		const pairsPerColumn = windowPairs / columns.count;

		void archive.want(Math.floor(firstPair), Math.ceil(firstPair + windowPairs));

		for (let column = 0; column < columns.count; column += 1) {
			const fromPair = firstPair + column * pairsPerColumn;
			const span =
				pairsPerColumn < 1
					? interpolatedSpan(archive.samples, fromPair + pairsPerColumn / 2)
					: widestSpan(archive.samples, fromPair, fromPair + pairsPerColumn);

			columns.highest[column] = span.highest / fullScale;
			columns.lowest[column] = span.lowest / fullScale;
		}
	};

	traceScope(canvas, fillColumns, signal);
}

// Narrower than a pair, a column reads between the two nearest pair centres so the trace slides rather than steps
function interpolatedSpan(samples: Int8Array, atPair: number): PairSpan {
	const position = atPair - 0.5;
	const pair = Math.floor(position);
	const fraction = position - pair;

	return {
		highest: mix(pairEdge(samples, pair, 1), pairEdge(samples, pair + 1, 1), fraction),
		lowest: mix(pairEdge(samples, pair, 0), pairEdge(samples, pair + 1, 0), fraction),
	};
}

function mix(from: number, to: number, fraction: number): number {
	return from + (to - from) * fraction;
}

// Outside the archive, or in a chunk still on its way, reads as silence
function pairEdge(samples: Int8Array, pair: number, edge: 0 | 1): number {
	return samples[pair * 2 + edge] ?? 0;
}

function widestSpan(samples: Int8Array, fromPair: number, toPair: number): PairSpan {
	let lowest = 0;
	let highest = 0;

	for (let pair = Math.floor(fromPair); pair < Math.ceil(toPair); pair += 1) {
		const min = pairEdge(samples, pair, 0);
		const max = pairEdge(samples, pair, 1);

		if (min < lowest) lowest = min;
		if (max > highest) highest = max;
	}

	return { highest, lowest };
}
