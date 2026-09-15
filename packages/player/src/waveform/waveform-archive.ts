import type { PlayerUrls, QueueItem } from '#types.ts';

// A `bbc/audiowaveform` .dat read a window at a time; its header makes the byte offset of any pair exact
// One shared promise per track serves as both the cache and the in-flight dedupe

const headerBytes = 20;
const archiveVersion = 1;
const eightBitFlag = 1;

// About 47 seconds of audio and 16 KB on the wire, so one window is one or two requests
const chunkPairs = 8192;

// A mix is 1.8 MB of pairs; four covers any plausible working set
const cacheLimit = 4;

// `want` runs every frame, so without a wait an offline panel asks for a failed chunk sixty times a second
const retryBaseMs = 2000;
const retryCapMs = 30_000;

const cache = new Map<string, Promise<undefined | WaveformArchive>>();

export interface WaveformArchive {
	// Rises as each chunk lands; a caller watches it to know a repaint is owed
	landedChunks: () => number;
	missing: (fromPair: number, toPair: number) => Array<MissingChunk>;
	pairsPerSecond: number;
	pairsTotal: number;
	// Interleaved 8-bit min and max, silent where a chunk has not landed
	samples: Int8Array;
	// Requests whatever the span is missing; a chunk in flight, landed or waiting out a failure is not asked for again
	want: (fromPair: number, toPair: number) => void;
}

interface ChunkRequest {
	askedMs: number;
	failures: number;
	retryAtMs: number;
}

interface MissingChunk {
	askedMs: number | undefined;
	chunk: number;
	fromPair: number;
	toPair: number;
}

// `undefined` on any failure leaves the panel on its grid
export function openArchive(
	resolveArchive: NonNullable<PlayerUrls['archive']>,
	item: QueueItem,
): Promise<undefined | WaveformArchive> {
	const { trackId } = item;
	const cached = cache.get(trackId);
	if (cached) return cached;

	const request = fetchArchive(resolveArchive, item);

	remember(trackId, request);

	// One bad header would otherwise hold the mix on its empty grid for the life of the page
	void request.then((archive) => {
		if (archive === undefined && cache.get(trackId) === request) cache.delete(trackId);
	});

	return request;
}

function createArchive({
	openedMs,
	pairsPerSecond,
	pairsTotal,
	url,
}: {
	openedMs: number;
	pairsPerSecond: number;
	pairsTotal: number;
	url: string;
}): WaveformArchive {
	const samples = new Int8Array(pairsTotal * 2);
	const chunkCount = Math.ceil(pairsTotal / chunkPairs);
	const landed = new Set<number>();
	const requests = new Map<number, ChunkRequest>();

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
			return;
		}

		request.failures += 1;
		request.retryAtMs =
			performance.now() + Math.min(retryCapMs, retryBaseMs * 2 ** (request.failures - 1));
	}

	return {
		landedChunks: () => landed.size,
		missing: (fromPair, toPair) => {
			const chunks: Array<MissingChunk> = [];

			for (let chunk = firstChunk(fromPair); chunk <= lastChunk(toPair); chunk += 1) {
				if (landed.has(chunk)) continue;

				chunks.push({
					askedMs: requests.get(chunk)?.askedMs,
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
			const nowMs = performance.now();
			// Chunks in view as the header lands have already waited as long as the header did
			const askedMs = requests.size === 0 ? openedMs : nowMs;

			for (let chunk = firstChunk(fromPair); chunk <= lastChunk(toPair); chunk += 1) {
				const request = requests.get(chunk) ?? { askedMs, failures: 0, retryAtMs: 0 };
				if (nowMs < request.retryAtMs) continue;

				request.retryAtMs = Infinity;
				requests.set(chunk, request);
				void load(chunk, request);
			}
		},
	};
}

async function fetchArchive(
	resolveArchive: NonNullable<PlayerUrls['archive']>,
	item: QueueItem,
): Promise<undefined | WaveformArchive> {
	const openedMs = performance.now();

	try {
		const url = await resolveArchive(item);
		if (url === undefined) return undefined;

		const response = await fetch(url, {
			headers: { Range: `bytes=0-${String(headerBytes - 1)}` },
		});

		// A 200 means the range was ignored, so this is the whole archive rather than its header
		if (response.status !== 206) return undefined;

		return readHeader({ buffer: await response.arrayBuffer(), openedMs, url });
	} catch {
		return undefined;
	}
}

// Version 2 only appears with `--split-channels` and would silently halve every offset
function readHeader({
	buffer,
	openedMs,
	url,
}: {
	buffer: ArrayBuffer;
	openedMs: number;
	url: string;
}): undefined | WaveformArchive {
	if (buffer.byteLength < headerBytes) return undefined;

	const header = new DataView(buffer);
	if (header.getInt32(0, true) !== archiveVersion) return undefined;
	if (header.getUint32(4, true) !== eightBitFlag) return undefined;

	const sampleRate = header.getInt32(8, true);
	const samplesPerPixel = header.getInt32(12, true);
	const pairsTotal = header.getUint32(16, true);
	if (sampleRate <= 0 || samplesPerPixel <= 0 || pairsTotal <= 0) return undefined;

	return createArchive({ openedMs, pairsPerSecond: sampleRate / samplesPerPixel, pairsTotal, url });
}

function remember(trackId: string, archive: Promise<undefined | WaveformArchive>): void {
	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value;

		if (oldest !== undefined) cache.delete(oldest);
	}

	cache.set(trackId, archive);
}
