import type { z } from 'zod';

import { mixStreamsPath, mixWaveformsPath } from '@xsynaptic/shared/constants';
import { MixStreamsDocumentSchema, MixWaveformsDocumentSchema } from '@xsynaptic/shared/schemas';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { streamBaseUrl, waveformBaseUrl } from '#lib/site.ts';

export interface MixAudio {
	archiveUrl: string;
	peaks: Array<number>;
	seconds: number;
	streamUrl: string;
}

// The dev routes serve only filenames that appear here
export interface MixAudioIndex {
	archives: Set<string>;
	byFile: Map<string, MixAudio>;
	streams: Set<string>;
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
	const [streams, waveforms] = await Promise.all([
		readDocument(mixStreamsPath, MixStreamsDocumentSchema),
		readDocument(mixWaveformsPath, MixWaveformsDocumentSchema),
	]);

	const index: MixAudioIndex = { archives: new Set(), byFile: new Map(), streams: new Set() };

	if (!streams || !waveforms) return index;

	const streamsByBase = new Map(streams.mixes.map((mix) => [mix.base, mix.stream]));

	for (const waveform of waveforms.mixes) {
		const stream = streamsByBase.get(waveform.base);

		if (stream === undefined) continue;

		const audio = {
			archiveUrl: `${waveformBaseUrl}${encodeURIComponent(waveform.archive)}`,
			peaks: waveform.peaks,
			seconds: waveform.seconds,
			streamUrl: `${streamBaseUrl}${encodeURIComponent(stream)}`,
		};

		index.archives.add(waveform.archive);
		index.streams.add(stream);

		for (const source of waveform.sources) index.byFile.set(source, audio);
	}

	return index;
}

// Warns rather than throws: a missing manifest renders no player, it does not fail the build
async function readDocument<Output>(
	filePath: string,
	schema: z.ZodType<Output>,
): Promise<Output | undefined> {
	const resolved = path.resolve(filePath);

	if (!existsSync(resolved)) {
		console.warn(`No ${filePath} found; building without audio`);
		return undefined;
	}

	try {
		const raw: unknown = JSON.parse(await readFile(resolved, 'utf8'));

		return schema.parse(raw);
	} catch (error) {
		console.warn(`Ignoring ${filePath}; building without audio (${String(error)})`);
		return undefined;
	}
}
