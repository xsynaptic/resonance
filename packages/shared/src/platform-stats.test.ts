import { describe, expect, test } from 'vitest';

import { toStatsKey } from '#platform-stats.ts';

describe('toStatsKey', () => {
	// Mixcloud's API returns the bare path and the frontmatter carries the full URL, for one cast
	test('folds a `key` and an embed URL for the same cast onto one key', () => {
		expect(toStatsKey('/Basilisk/Crystalline-Expanse/')).toBe('/basilisk/crystalline-expanse');
		expect(toStatsKey('https://www.mixcloud.com/Basilisk/Crystalline-Expanse/')).toBe(
			'/basilisk/crystalline-expanse',
		);
	});

	test('strips the UTM query SoundCloud appends to every permalink', () => {
		expect(toStatsKey('https://soundcloud.com/djbasilisk/in-exile?utm_source=id_1')).toBe(
			'/djbasilisk/in-exile',
		);
	});
});
