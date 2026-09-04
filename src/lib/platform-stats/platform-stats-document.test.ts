import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import { getPlayCounts } from '#lib/platform-stats/platform-stats-document.ts';

function toLine(generatedAt: string, plays: number): string {
	return JSON.stringify({
		generated_at: generatedAt,
		items: { '/a': { plays } },
		version: 1,
	});
}

function writeLog(lines: string): string {
	const filePath = path.join(mkdtempSync(path.join(os.tmpdir(), 'platform-stats-')), 'stats.jsonl');

	writeFileSync(filePath, lines, 'utf8');

	return filePath;
}

describe('getPlayCounts', () => {
	// Never fatal: a build must render no counts rather than fail on a file it cannot read
	test('warns once and yields an empty map for a file that does not exist', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		const counts = await getPlayCounts('./packages/content/does-not-exist.jsonl');

		expect(counts.size).toBe(0);
		expect(warn).toHaveBeenCalledTimes(1);

		warn.mockRestore();
	});

	test('reads the last generation, recovering from a torn final line', async () => {
		const filePath = writeLog(`${toLine('2026-09-01T00:00:00Z', 7)}\n{"generated_at":"2026-09`);

		expect(await getPlayCounts(filePath)).toEqual(new Map([['/a', 7]]));
	});

	test('warns and yields an empty map when no line parses', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
		const counts = await getPlayCounts(writeLog('not json at all\n'));

		expect(counts.size).toBe(0);
		expect(warn).toHaveBeenCalledTimes(1);

		warn.mockRestore();
	});
});
