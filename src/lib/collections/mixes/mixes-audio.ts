import type { MixAudioEntry } from '@xsynaptic/shared/schemas';

import { mixAudioPath } from '@xsynaptic/shared/constants';
import { MixAudioDocumentSchema } from '@xsynaptic/shared/schemas';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { streamBaseUrl } from '#lib/site.ts';

export interface MixAudio {
	peaks: Array<number>;
	seconds: number;
	streamUrl: string;
}

interface MixAudioSource {
	files?: Array<string> | undefined;
}

// Read once per build, not once per mix page
let entriesPromise: Promise<Map<string, MixAudioEntry>> | undefined;

// The one seam consumers go through, so the filename convention stays in the manifest
export async function getMixAudio(mix: MixAudioSource): Promise<MixAudio | undefined> {
	const files = mix.files ?? [];
	if (files.length === 0) return undefined;

	const entries = await getEntries();

	for (const file of files) {
		const entry = entries.get(file);

		if (entry) {
			return {
				peaks: entry.peaks,
				seconds: entry.seconds,
				streamUrl: `${streamBaseUrl}${encodeURIComponent(entry.stream)}`,
			};
		}
	}

	return undefined;
}

// Warns rather than throws: a missing manifest renders no player, it does not fail the build
async function buildEntries(): Promise<Map<string, MixAudioEntry>> {
	const filePath = path.resolve(mixAudioPath);

	if (!existsSync(filePath)) {
		console.warn(`No ${mixAudioPath} found; building without audio`);
		return new Map();
	}

	try {
		const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
		const { mixes } = MixAudioDocumentSchema.parse(raw);

		return new Map(mixes.flatMap((mix) => mix.sources.map((source) => [source, mix] as const)));
	} catch (error) {
		console.warn(`Ignoring ${mixAudioPath}; building without audio (${String(error)})`);
		return new Map();
	}
}

function getEntries(): Promise<Map<string, MixAudioEntry>> {
	if (!entriesPromise) entriesPromise = buildEntries();

	return entriesPromise;
}
