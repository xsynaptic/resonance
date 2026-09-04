import { describe, expect, test } from 'vitest';

import { validatePlatformLinks } from './platform-links.js';
import { makeEntry } from './validate-test-utils.js';

const keys = {
	mixcloud: new Set(['/basilisk/a-mix']),
	soundcloud: new Set(['/djbasilisk/a-mix']),
};

describe('validatePlatformLinks', () => {
	test('passes when both embeds resolve and the SoundCloud URL is also in `links`', () => {
		const mixes = [
			makeEntry({
				data: {
					links: [
						'https://www.mixcloud.com/Basilisk/a-mix/',
						'https://soundcloud.com/djbasilisk/a-mix',
					],
					mixcloudLink: 'https://www.mixcloud.com/Basilisk/a-mix/',
					soundcloudLink: 'https://soundcloud.com/djbasilisk/a-mix',
				},
				id: 'a-mix',
			}),
		];

		expect(validatePlatformLinks(mixes, keys).status).toBe('pass');
	});

	test('fails when `links` carries an own-account URL that `soundcloudLink` does not', () => {
		const mixes = [
			makeEntry({
				data: { links: ['https://soundcloud.com/djbasilisk/a-mix'] },
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformLinks(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `links` has /djbasilisk/a-mix, missing from `soundcloudLink`',
			},
		]);
	});

	// The terms require a visible backlink from every item whose figures are shown
	test('fails when `soundcloudLink` has no matching backlink in `links`', () => {
		const mixes = [
			makeEntry({
				data: { links: [], soundcloudLink: 'https://soundcloud.com/djbasilisk/a-mix' },
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformLinks(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `soundcloudLink` has /djbasilisk/a-mix, missing from `links`',
			},
		]);
	});

	test('fails on an embed key matching no track in the last pull, which is a rename', () => {
		const mixes = [
			makeEntry({
				data: {
					links: ['https://soundcloud.com/djbasilisk/renamed'],
					soundcloudLink: 'https://soundcloud.com/djbasilisk/renamed',
				},
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformLinks(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `soundcloudLink` /djbasilisk/renamed matches no track in the last pull',
			},
		]);
	});

	test('skips the key check where a stats file is absent, and says so', () => {
		const mixes = [
			makeEntry({
				data: {
					links: ['https://soundcloud.com/djbasilisk/renamed'],
					soundcloudLink: 'https://soundcloud.com/djbasilisk/renamed',
				},
				id: 'a-mix',
			}),
		];
		const result = validatePlatformLinks(mixes, { mixcloud: keys.mixcloud });

		expect(result.status).toBe('pass');
		expect(result.notes?.[0]).toContain('soundcloud');
	});

	test('passes for a mix whose embed is an array of resolving URLs', () => {
		const mixes = [
			makeEntry({
				data: {
					links: [
						'https://soundcloud.com/djbasilisk/a-mix',
						'https://soundcloud.com/djbasilisk/b-mix',
					],
					soundcloudLink: [
						'https://soundcloud.com/djbasilisk/a-mix',
						'https://soundcloud.com/djbasilisk/b-mix',
					],
				},
				id: 'a-mix',
			}),
		];
		const withBoth = { ...keys, soundcloud: new Set(['/djbasilisk/a-mix', '/djbasilisk/b-mix']) };

		expect(validatePlatformLinks(mixes, withBoth).status).toBe('pass');
	});
});
