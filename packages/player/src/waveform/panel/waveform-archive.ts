import type { QueueArchive } from '#types.ts';

import { retryDelayMs } from '#lib/retry-delay.ts';

// One archive per address, so a chunk that landed is never asked for twice

const headerBytes = 20;

// About 47 seconds of audio and 16 KB on the wire, so one window is one or two requests
const chunkPairs = 8192;

const cacheLimit = 2;

const cache = new Map<string, WaveformArchive>();

export interface WaveformArchive {
	missing: (fromPair: number, toPair: number) => Array<MissingChunk>;
	pairsPerSecond: number;
	pairsTotal: number;
	// Interleaved 8-bit min and max, silent where a chunk has not landed
	samples: Int8Array;
	// Requests whatever the span is missing; a chunk in flight, landed or waiting out a failure is not asked for again
	want: (fromPair: number, toPair: number) => Promise<void> | undefined;
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

function createArchive({
	pairCount: pairsTotal,
	pairsPerSecond,
	url,
}: QueueArchive): WaveformArchive {
	const samples = new Int8Array(pairsTotal * 2);
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

	async function didFetchChunk(chunk: number): Promise<boolean> {
		const start = headerBytes + chunk * chunkPairs * 2;
		const end = Math.min(headerBytes + pairsTotal * 2, start + chunkPairs * 2) - 1;

		try {
			const response = await fetch(url, {
				headers: { Range: `bytes=${String(start)}-${String(end)}` },
			});

			// A 200 means the range was ignored and the whole file is on its way, which would land at the wrong offset
			if (response.status !== 206) {
				await response.body?.cancel();
				return false;
			}

			samples.set(new Int8Array(await response.arrayBuffer()), chunk * chunkPairs * 2);

			return true;
		} catch {
			return false;
		}
	}

	async function load(chunk: number, request: ChunkRequest): Promise<void> {
		if (await didFetchChunk(chunk)) {
			landed.add(chunk);
			announce();
			return;
		}

		request.failures += 1;
		setTimeout(() => {
			request.isHeld = false;
			announce();
		}, retryDelayMs(request.failures));
	}

	return {
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
				if (landed.has(chunk)) continue;

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
