import type { QueueArchive } from '@xsynaptic/player';
import type { MixAudioEntry } from '@xsynaptic/shared/schemas';

import { mixAudioPath } from '@xsynaptic/shared/constants';
import { MixAudioDocumentSchema } from '@xsynaptic/shared/schemas';
import {
	bandCount,
	bandsDecibelRange,
	bandsHeaderBytes,
	peakArchiveHeaderBytes,
} from '@xsynaptic/shared/waveform-format';
import { CONTENT_DATA_PATH } from 'astro:env/server';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { streamBaseUrl, waveformBaseUrl } from '#lib/site.ts';

export interface MixAudio {
	archive: QueueArchive;
	overview: Array<number>;
	seconds: number;
	streamUrl: string;
}

// The dev routes serve only filenames that appear here
export interface MixAudioIndex {
	byFile: Map<string, MixAudio>;
	streams: Set<string>;
	waveformFiles: Set<string>;
}

interface MixAudioSource {
	files?: Array<string> | undefined;
}

// Read once per build, not once per mix page
let indexPromise: Promise<MixAudioIndex> | undefined;

export function getIndex(): Promise<MixAudioIndex> {
	if (!indexPromise) indexPromise = buildIndex();

	return indexPromise;
}

// The one seam consumers go through, so the filename convention stays in the manifest
export async function getMixAudio(mix: MixAudioSource): Promise<MixAudio | undefined> {
	const files = mix.files ?? [];
	if (files.length === 0) return undefined;

	const { byFile } = await getIndex();

	for (const file of files) {
		const entry = byFile.get(file);

		if (entry) return entry;
	}

	return undefined;
}

async function buildIndex(): Promise<MixAudioIndex> {
	const index: MixAudioIndex = { byFile: new Map(), streams: new Set(), waveformFiles: new Set() };
	const mixes = await readMixes(path.join(CONTENT_DATA_PATH, mixAudioPath));

	for (const mix of mixes) {
		const audio: MixAudio = {
			archive: {
				...(mix.bands
					? {
							bands: {
								bandCount,
								byteOffset: bandsHeaderBytes,
								frameCount: mix.bands.frameCount,
								framesPerSecond: mix.bands.framesPerSecond,
								minDecibels: -bandsDecibelRange,
								url: `${waveformBaseUrl}${encodeURIComponent(mix.bands.file)}`,
							},
						}
					: {}),
				byteOffset: peakArchiveHeaderBytes,
				pairCount: mix.pairCount,
				pairsPerSecond: mix.pairsPerSecond,
				url: `${waveformBaseUrl}${encodeURIComponent(mix.archive)}`,
			},
			overview: mix.overview,
			seconds: mix.seconds,
			streamUrl: `${streamBaseUrl}${encodeURIComponent(mix.stream)}`,
		};

		index.waveformFiles.add(mix.archive);
		if (mix.bands) index.waveformFiles.add(mix.bands.file);
		index.streams.add(mix.stream);

		for (const source of mix.sources) index.byFile.set(source, audio);
	}

	return index;
}

// Warns rather than throws: a missing manifest renders no player, it does not fail the build
async function readMixes(filePath: string): Promise<Array<MixAudioEntry>> {
	const resolved = path.resolve(filePath);

	if (!existsSync(resolved)) {
		console.warn(`No ${filePath} found; building without audio`);
		return [];
	}

	try {
		const raw: unknown = JSON.parse(await readFile(resolved, 'utf8'));

		return MixAudioDocumentSchema.parse(raw).mixes;
	} catch (error) {
		console.warn(`Ignoring ${filePath}; building without audio (${String(error)})`);
		return [];
	}
}
