import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { appendGeneration, readLastGeneration } from '#platform-stats/platform-stats-file.ts';

async function writeLog(lines: string): Promise<string> {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-stats-'));
	const filePath = path.join(directory, 'stats.jsonl');

	await writeFile(filePath, lines, 'utf8');

	return filePath;
}

describe('readLastGeneration', () => {
	test('recovers from a torn final line by falling back to the one before it', async () => {
		const whole = JSON.stringify({
			generated_at: '2026-09-01T00:00:00Z',
			items: { '/a': { plays: 7 } },
			version: 1,
		});
		const filePath = await writeLog(`${whole}\n{"generated_at":"2026-09-02T00:0`);

		const generation = await readLastGeneration(filePath);

		expect(generation?.generated_at).toBe('2026-09-01T00:00:00Z');
		expect(generation?.items).toEqual({ '/a': { plays: 7 } });
	});

	test('yields nothing for a file that does not exist', async () => {
		expect(await readLastGeneration('/nowhere/stats.jsonl')).toBeUndefined();
	});

	test('reads back what appendGeneration wrote, last line first', async () => {
		const filePath = await writeLog('');

		await appendGeneration(filePath, { '/a': { plays: 1 } });
		await appendGeneration(filePath, { '/a': { plays: 2 } });

		const generation = await readLastGeneration(filePath);

		expect(generation?.items).toEqual({ '/a': { plays: 2 } });
	});
});
