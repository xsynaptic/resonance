import type { WaveformBands, WaveformPeaks } from '@xsynaptic/sonic-ui';

import type { QueueArchive, QueueBands } from '#types.ts';

import { retryDelayMs } from '#lib/retry-delay.ts';

// One archive per address, so a chunk that landed is never asked for twice

// About 47 seconds of audio and 16 KB on the wire, so one window is one or two requests
const chunkPairs = 8192;

const cacheLimit = 2;

const cache = new Map<string, WaveformArchive>();

export interface WaveformArchive {
	bands: undefined | WaveformBands;
	durationSeconds: number;
	// Silent where a chunk has not landed
	peaks: WaveformPeaks;
	// The stretches of a window whose peaks have not landed
	pending: (fromSeconds: number, toSeconds: number) => Array<[number, number]>;
	// `undefined` once the window has landed; otherwise settles on the next change, for the caller to ask again
	request: (fromSeconds: number, toSeconds: number) => Promise<void> | undefined;
}

interface BandsTwin extends WaveformBands {
	byteOffset: number;
	bytesTotal: number;
	chunkBytes: number;
	landed: Set<number>;
	levels: Uint8Array;
	url: string;
}

interface ChunkRequest {
	failures: number;
	isHeld: boolean;
}

export function openArchive(source: QueueArchive): WaveformArchive {
	const cached = cache.get(source.url);
	if (cached) return cached;

	const archive = createArchive(source);

	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value;

		if (oldest !== undefined) cache.delete(oldest);
	}

	cache.set(source.url, archive);

	return archive;
}

// A 200 means the range was ignored and the whole file is on its way, which would land at the wrong offset
async function fetchRange(
	url: string,
	start: number,
	end: number,
): Promise<ArrayBuffer | undefined> {
	try {
		const response = await fetch(url, {
			headers: { Range: `bytes=${String(start)}-${String(end - 1)}` },
		});

		if (response.status !== 206) {
			await response.body?.cancel();
			return undefined;
		}

		return await response.arrayBuffer();
	} catch {
		return undefined;
	}
}

function createBandsTwin(source: QueueBands, pairsPerSecond: number): BandsTwin {
	const { bandCount, byteOffset, frameCount, framesPerSecond, minDecibels, url } = source;
	const bytesTotal = frameCount * bandCount;

	return {
		bandCount,
		byteOffset,
		bytesTotal,
		chunkBytes: Math.round((chunkPairs * framesPerSecond) / pairsPerSecond) * bandCount,
		framesPerSecond,
		landed: new Set(),
		levels: new Uint8Array(bytesTotal),
		minDecibels,
		url,
	};
}

async function fetchLevels(twin: BandsTwin, chunk: number): Promise<(() => void) | undefined> {
	if (twin.landed.has(chunk)) return undefined;

	const start = twin.byteOffset + chunk * twin.chunkBytes;
	const end = Math.min(twin.byteOffset + twin.bytesTotal, start + twin.chunkBytes);
	const bytes = await fetchRange(twin.url, start, end);

	return (
		bytes &&
		(() => {
			twin.levels.set(new Uint8Array(bytes), chunk * twin.chunkBytes);
			twin.landed.add(chunk);
		})
	);
}

function createArchive({
	bands: bandsSource,
	byteOffset,
	pairCount,
	pairsPerSecond,
	url,
}: QueueArchive): WaveformArchive {
	const samples = new Int8Array(pairCount * 2);
	const bands = bandsSource && createBandsTwin(bandsSource, pairsPerSecond);
	const chunkCount = Math.ceil(pairCount / chunkPairs);
	const landed = new Set<number>();
	const requests = new Map<number, ChunkRequest>();
	let announce: () => void;
	let changed: Promise<void>;

	function awaitChange(): void {
		changed = new Promise((resolve) => {
			announce = () => {
				awaitChange();
				resolve();
			};
		});
	}

	awaitChange();

	function chunksIn(fromSeconds: number, toSeconds: number): Array<number> {
		const first = Math.floor(Math.max(0, fromSeconds * pairsPerSecond) / chunkPairs);
		const last = Math.min(
			chunkCount - 1,
			Math.floor(Math.max(0, toSeconds * pairsPerSecond) / chunkPairs),
		);

		const chunks: Array<number> = [];

		for (let chunk = first; chunk <= last; chunk += 1) chunks.push(chunk);

		return chunks;
	}

	function isComplete(chunk: number): boolean {
		return landed.has(chunk) && (!bands || bands.landed.has(chunk));
	}

	async function fetchPeaks(chunk: number): Promise<(() => void) | undefined> {
		if (landed.has(chunk)) return undefined;

		const start = byteOffset + chunk * chunkPairs * 2;
		const end = Math.min(byteOffset + pairCount * 2, start + chunkPairs * 2);
		const bytes = await fetchRange(url, start, end);

		return (
			bytes &&
			(() => {
				samples.set(new Int8Array(bytes), chunk * chunkPairs * 2);
				landed.add(chunk);
			})
		);
	}

	// Both land in one turn, levels first, so a stretch never draws plain and then takes its tint
	async function load(chunk: number, request: ChunkRequest): Promise<void> {
		const landings = await Promise.all([bands && fetchLevels(bands, chunk), fetchPeaks(chunk)]);

		for (const land of landings) land?.();
		if (landings.some(Boolean)) announce();
		if (isComplete(chunk)) return;

		request.failures += 1;
		setTimeout(() => {
			request.isHeld = false;
			announce();
		}, retryDelayMs(request.failures));
	}

	return {
		bands,
		durationSeconds: pairCount / pairsPerSecond,
		peaks: { pairsPerSecond, samples },
		// Peaks alone: a chunk whose levels failed draws plain rather than shaded
		pending: (fromSeconds, toSeconds) =>
			chunksIn(fromSeconds, toSeconds)
				.filter((chunk) => !landed.has(chunk))
				.map((chunk) => [
					(chunk * chunkPairs) / pairsPerSecond,
					Math.min(pairCount, (chunk + 1) * chunkPairs) / pairsPerSecond,
				]),
		request: (fromSeconds, toSeconds) => {
			let hasGap = false;

			for (const chunk of chunksIn(fromSeconds, toSeconds)) {
				if (isComplete(chunk)) continue;

				hasGap = true;

				const held = requests.get(chunk) ?? { failures: 0, isHeld: false };
				if (held.isHeld) continue;

				held.isHeld = true;
				requests.set(chunk, held);
				void load(chunk, held);
			}

			return hasGap ? changed : undefined;
		},
	};
}
