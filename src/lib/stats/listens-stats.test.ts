import { afterEach, describe, expect, test, vi } from 'vitest';

const files = vi.hoisted(() => ({ existsSync: vi.fn(), readFile: vi.fn() }));

vi.mock('node:fs', () => ({ existsSync: files.existsSync }));
vi.mock('node:fs/promises', () => ({ readFile: files.readFile }));

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

// The map is memoized per module, so each test loads its own copy
async function loadStats(contents: string) {
	files.existsSync.mockReturnValue(true);
	files.readFile.mockResolvedValue(contents);
	vi.resetModules();

	return import('#lib/stats/listens-stats.ts');
}

function toSnapshot(rows: Array<Record<string, number | string>>): string {
	return JSON.stringify({ pulledAt: new Date().toISOString(), rows });
}

describe('getListenStats', () => {
	test("sums a mix's days, and answers zeroes for a mix with none", async () => {
		const { getListenStats } = await loadStats(
			toSnapshot([
				{ day: '2026-09-15', listens: 2, mix_id: 'voyager', seconds: 600 },
				{ day: '2026-09-16', listens: 3, mix_id: 'voyager', seconds: 900 },
				{ day: '2026-09-16', listens: 1, mix_id: 'uroboros', seconds: 300 },
			]),
		);

		await expect(getListenStats('voyager')).resolves.toEqual({ listens: 5, seconds: 1500 });
		await expect(getListenStats('uroboros')).resolves.toEqual({ listens: 1, seconds: 300 });
		await expect(getListenStats('nothing-here')).resolves.toEqual({ listens: 0, seconds: 0 });
	});

	test('an unreadable file warns once and yields zeroes', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
		const { getListenStats } = await loadStats('{ not json');

		await expect(getListenStats('voyager')).resolves.toEqual({ listens: 0, seconds: 0 });
		await expect(getListenStats('uroboros')).resolves.toEqual({ listens: 0, seconds: 0 });
		expect(warned).toHaveBeenCalledOnce();
	});

	test('a missing file is silent', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

		files.existsSync.mockReturnValue(false);
		vi.resetModules();

		const { getListenStats } = await import('#lib/stats/listens-stats.ts');

		await expect(getListenStats('voyager')).resolves.toEqual({ listens: 0, seconds: 0 });
		expect(warned).not.toHaveBeenCalled();
	});
});
