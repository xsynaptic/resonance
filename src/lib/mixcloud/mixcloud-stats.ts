import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { mixcloudStatsPath } from '#constants.ts';

// snake_case is the wire format, kept verbatim
// `listener_count` renders nowhere; it is stored so revisiting the choice costs no re-fetch
const mixcloudStatsSchema = z.object({
	cloudcasts: z
		.object({
			key: z.string(),
			listener_count: z.number(),
			play_count: z.number(),
		})
		.array(),
	version: z.literal(1),
});

// Read once per build, not once per mix page
let countsPromise: Promise<Map<string, number>> | undefined;

export async function getMixcloudPlayCount(mixcloudEmbed: string | undefined): Promise<number> {
	if (!mixcloudEmbed) return 0;

	const counts = await getPlayCounts();

	return counts.get(toCloudcastKey(mixcloudEmbed)) ?? 0;
}

// Never fatal: an absent or malformed file renders no play counts rather than failing a build
async function buildCounts(): Promise<Map<string, number>> {
	const filePath = path.resolve(mixcloudStatsPath);

	if (!existsSync(filePath)) {
		console.warn(`No ${mixcloudStatsPath} found; building without Mixcloud play counts`);
		return new Map();
	}

	try {
		const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
		const { cloudcasts } = mixcloudStatsSchema.parse(raw);

		return new Map(
			cloudcasts.map((cloudcast) => [cloudcast.key.toLowerCase(), cloudcast.play_count]),
		);
	} catch (error) {
		console.warn(`Ignoring ${mixcloudStatsPath}; building without play counts (${String(error)})`);
		return new Map();
	}
}

function getPlayCounts(): Promise<Map<string, number>> {
	if (!countsPromise) countsPromise = buildCounts();
	return countsPromise;
}

// A cloudcast key is the embed URL's path; keys are matched case-folded, as frontmatter is written by hand
function toCloudcastKey(mixcloudEmbed: string): string {
	return mixcloudEmbed.replace(/^https?:\/\/[^/]+/, '').toLowerCase();
}
