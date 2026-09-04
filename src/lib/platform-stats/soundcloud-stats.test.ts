import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const fixturePath = path.join(
	mkdtempSync(path.join(os.tmpdir(), 'soundcloud-stats-')),
	'stats.jsonl',
);

writeFileSync(
	fixturePath,
	`${JSON.stringify({
		generated_at: '2026-09-04T00:00:00Z',
		items: { '/djbasilisk/part-1': { plays: 1000 }, '/djbasilisk/solo': { plays: 42 } },
		version: 1,
	})}\n`,
	'utf8',
);

// `doMock` rather than `mock`, which hoists above the fixture write the module then reads
vi.doMock('#constants.ts', () => ({ soundcloudStatsPath: fixturePath }));

const { getSoundcloudPlayCount } = await import('#lib/platform-stats/soundcloud-stats.ts');

describe('getSoundcloudPlayCount', () => {
	test('reads a plain string, ignoring the UTM query and trailing slash', async () => {
		expect(await getSoundcloudPlayCount('https://soundcloud.com/djbasilisk/solo/')).toBe(42);
	});

	test('sums an array, counting a member absent from the pull as zero', async () => {
		const plays = await getSoundcloudPlayCount([
			'https://soundcloud.com/djbasilisk/part-1',
			'https://soundcloud.com/djbasilisk/part-2',
		]);

		expect(plays).toBe(1000);
	});

	test('is zero when the field is unset', async () => {
		expect(await getSoundcloudPlayCount(undefined)).toBe(0);
	});
});
