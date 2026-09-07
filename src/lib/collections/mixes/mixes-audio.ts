import type { z } from 'zod';

import { mixStreamsPath, mixWaveformsPath } from '@xsynaptic/shared/constants';
import { MixStreamsDocumentSchema, MixWaveformsDocumentSchema } from '@xsynaptic/shared/schemas';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { streamBaseUrl } from '#lib/site.ts';

export interface MixAudio {
	// The archive's file name in `.cache/waveforms/`, without its extension
	base: string;
	peaks: Array<number>;
	seconds: number;
	streamUrl: string;
}

interface MixAudioSource {
	files?: Array<string> | undefined;
}

// Read once per build, not once per mix page
let entriesPromise: Promise<Map<string, MixAudio>> | undefined;

// The one seam consumers go through, so the filename convention stays in the manifest
export async function getMixAudio(mix: MixAudioSource): Promise<MixAudio | undefined> {
	const files = mix.files ?? [];
	if (files.length === 0) return undefined;

	const entries = await getEntries();

	for (const file of files) {
		const entry = entries.get(file);

		if (entry) return entry;
	}

	return undefined;
}

async function buildEntries(): Promise<Map<string, MixAudio>> {
	const [streams, waveforms] = await Promise.all([
		readDocument(mixStreamsPath, MixStreamsDocumentSchema),
		readDocument(mixWaveformsPath, MixWaveformsDocumentSchema),
	]);

	if (!streams || !waveforms) return new Map();

	const streamsByBase = new Map(streams.mixes.map((mix) => [mix.base, mix.stream]));
	const entries = new Map<string, MixAudio>();

	for (const waveform of waveforms.mixes) {
		const stream = streamsByBase.get(waveform.base);

		if (stream === undefined) continue;

		const audio = {
			base: waveform.base,
			peaks: waveform.peaks,
			seconds: waveform.seconds,
			streamUrl: `${streamBaseUrl}${encodeURIComponent(stream)}`,
		};

		for (const source of waveform.sources) entries.set(source, audio);
	}

	return entries;
}

function getEntries(): Promise<Map<string, MixAudio>> {
	if (!entriesPromise) entriesPromise = buildEntries();

	return entriesPromise;
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
