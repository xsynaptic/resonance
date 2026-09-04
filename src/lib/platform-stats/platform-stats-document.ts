// Never fatal: an unreadable file warns once and renders no counts rather than failing the build

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const CountSchema = z.number().int().nonnegative();

const GenerationSchema = z.object({
	generated_at: z.string(),
	items: z.record(
		z.string(),
		z.object({
			comments: CountSchema.optional(),
			id: z.string().optional(),
			likes: CountSchema.optional(),
			listeners: CountSchema.optional(),
			plays: CountSchema,
			reposts: CountSchema.optional(),
		}),
	),
	version: z.literal(1),
});

// Read once per build, not once per mix page
const playCountsByPath = new Map<string, Promise<Map<string, number>>>();

export function getPlayCounts(statsPath: string): Promise<Map<string, number>> {
	const counts = playCountsByPath.get(statsPath) ?? buildPlayCounts(statsPath);

	playCountsByPath.set(statsPath, counts);

	return counts;
}

// Mirrors `toStatsKey` in packages/scripts; frontmatter is hand-written, so the two must agree
export function toStatsKey(url: string): string {
	return url
		.replace(/^https?:\/\/[^/]+/, '')
		.replace(/[#?].*$/, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

async function buildPlayCounts(statsPath: string): Promise<Map<string, number>> {
	const filePath = path.resolve(statsPath);

	if (!existsSync(filePath)) {
		console.warn(`No ${statsPath} found; building without its play counts`);
		return new Map();
	}

	const items = await readLastItems(filePath);

	if (!items) {
		console.warn(`No readable generation in ${statsPath}; building without its play counts`);
		return new Map();
	}

	return new Map(Object.entries(items).map(([key, item]) => [key, item.plays]));
}

// A crash mid-append can only tear the last line; the one before it is still whole
async function readLastItems(filePath: string) {
	let contents: string;

	try {
		contents = await readFile(filePath, 'utf8');
	} catch {
		return;
	}

	const lines = contents.split('\n');

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const items = toItems(lines[index]);

		if (items) return items;
	}

	return;
}

function toItems(line: string | undefined) {
	if (!line || line.trim() === '') return;

	try {
		return GenerationSchema.parse(JSON.parse(line)).items;
	} catch {
		return;
	}
}
