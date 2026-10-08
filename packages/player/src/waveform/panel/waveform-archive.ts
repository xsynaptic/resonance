import type { QueueArchive, QueueBands } from '#types.ts';

import { retryDelayMs } from '#lib/retry-delay.ts';

// One archive per address, so a chunk that landed is never asked for twice

const headerBytes = 20;

// About 47 seconds of audio and 16 KB on the wire, so one window is one or two requests
const chunkPairs = 8192;

const bandsHeaderBytes = 36;
const bandCount = 3;
const bandsMinDecibels = -60;

const cacheLimit = 2;

const cache = new Map<string, WaveformArchive>();

export interface ArchiveBands {
	bandCount: number;
	framesPerSecond: number;
	levels: Uint8Array;
	minDecibels: number;
}

export interface WaveformArchive {
	bands: ArchiveBands | undefined;
	missing: (fromPair: number, toPair: number) => Array<MissingChunk>;
	pairsPerSecond: number;
	pairsTotal: number;
	// Interleaved 8-bit min and max, silent where a chunk has not landed
	samples: Int8Array;
	want: (fromPair: number, toPair: number) => Promise<void> | undefined;
}

interface BandsTwin extends ArchiveBands {
	bytesTotal: number;
	chunkBytes: number;
	landed: Set<number>;
	url: string;
}

interface ChunkRequest {
	failures: number;
	isHeld: boolean;
}

interface MissingChunk {
	chunk: number;
	fromPair: number;
	toPair: number;
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
	const bytesTotal = source.frameCount * bandCount;

	return {
		bandCount,
		bytesTotal,
		chunkBytes: Math.round((chunkPairs * source.framesPerSecond) / pairsPerSecond) * bandCount,
		framesPerSecond: source.framesPerSecond,
		landed: new Set(),
		levels: new Uint8Array(bytesTotal),
		minDecibels: bandsMinDecibels,
		url: source.url,
	};
}

async function fetchLevels(twin: BandsTwin, chunk: number): Promise<(() => void) | undefined> {
	if (twin.landed.has(chunk)) return undefined;

	const start = bandsHeaderBytes + chunk * twin.chunkBytes;
	const end = Math.min(bandsHeaderBytes + twin.bytesTotal, start + twin.chunkBytes);
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
	pairCount: pairsTotal,
	pairsPerSecond,
	url,
}: QueueArchive): WaveformArchive {
	const samples = new Int8Array(pairsTotal * 2);
	const bands = bandsSource && createBandsTwin(bandsSource, pairsPerSecond);
	const chunkCount = Math.ceil(pairsTotal / chunkPairs);
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

	function lastChunk(toPair: number): number {
		return Math.min(chunkCount - 1, Math.floor(Math.max(0, toPair) / chunkPairs));
	}

	function firstChunk(fromPair: number): number {
		return Math.max(0, Math.floor(Math.max(0, fromPair) / chunkPairs));
	}

	function isComplete(chunk: number): boolean {
		return landed.has(chunk) && (!bands || bands.landed.has(chunk));
	}

	async function fetchPeaks(chunk: number): Promise<(() => void) | undefined> {
		if (landed.has(chunk)) return undefined;

		const start = headerBytes + chunk * chunkPairs * 2;
		const end = Math.min(headerBytes + pairsTotal * 2, start + chunkPairs * 2);
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
		missing: (fromPair, toPair) => {
			const chunks: Array<MissingChunk> = [];

			for (let chunk = firstChunk(fromPair); chunk <= lastChunk(toPair); chunk += 1) {
				if (landed.has(chunk)) continue;

				chunks.push({
					chunk,
					fromPair: chunk * chunkPairs,
					toPair: Math.min(pairsTotal, (chunk + 1) * chunkPairs),
				});
			}

			return chunks;
		},
		pairsPerSecond,
		pairsTotal,
		samples,
		want: (fromPair, toPair) => {
			let hasGap = false;

			for (let chunk = firstChunk(fromPair); chunk <= lastChunk(toPair); chunk += 1) {
				if (isComplete(chunk)) continue;

				hasGap = true;

				const request = requests.get(chunk) ?? { failures: 0, isHeld: false };
				if (request.isHeld) continue;

				request.isHeld = true;
				requests.set(chunk, request);
				void load(chunk, request);
			}

			return hasGap ? changed : undefined;
		},
	};
}
