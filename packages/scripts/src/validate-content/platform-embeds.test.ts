import { describe, expect, test } from 'vitest';

import { validatePlatformEmbeds } from './platform-embeds.js';
import { makeEntry } from './validate-test-utils.js';

const keys = {
	mixcloud: new Set(['/basilisk/a-mix']),
	soundcloud: new Set(['/djbasilisk/a-mix']),
};

describe('validatePlatformEmbeds', () => {
	test('passes when both embeds resolve and the SoundCloud URL is also in `links`', () => {
		const mixes = [
			makeEntry({
				data: {
					links: [
						'https://www.mixcloud.com/Basilisk/a-mix/',
						'https://soundcloud.com/djbasilisk/a-mix',
					],
					mixcloudEmbed: 'https://www.mixcloud.com/Basilisk/a-mix/',
					soundcloudEmbed: 'https://soundcloud.com/djbasilisk/a-mix',
				},
				id: 'a-mix',
			}),
		];

		expect(validatePlatformEmbeds(mixes, keys).status).toBe('pass');
	});

	test('fails when `links` carries an own-account URL that `soundcloudEmbed` does not', () => {
		const mixes = [
			makeEntry({
				data: { links: ['https://soundcloud.com/djbasilisk/a-mix'] },
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformEmbeds(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `links` has /djbasilisk/a-mix, missing from `soundcloudEmbed`',
			},
		]);
	});

	// The terms require a visible backlink from every item whose figures are shown
	test('fails when `soundcloudEmbed` has no matching backlink in `links`', () => {
		const mixes = [
			makeEntry({
				data: { links: [], soundcloudEmbed: 'https://soundcloud.com/djbasilisk/a-mix' },
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformEmbeds(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `soundcloudEmbed` has /djbasilisk/a-mix, missing from `links`',
			},
		]);
	});

	test('fails on an embed key matching no track in the last pull, which is a rename', () => {
		const mixes = [
			makeEntry({
				data: {
					links: ['https://soundcloud.com/djbasilisk/renamed'],
					soundcloudEmbed: 'https://soundcloud.com/djbasilisk/renamed',
				},
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validatePlatformEmbeds(mixes, keys).issues).toEqual([
			{
				message:
					'collections/mixes/2015/a-mix.mdx: `soundcloudEmbed` /djbasilisk/renamed matches no track in the last pull',
			},
		]);
	});

	test('skips the key check where a stats file is absent, and says so', () => {
		const mixes = [
			makeEntry({
				data: {
					links: ['https://soundcloud.com/djbasilisk/renamed'],
					soundcloudEmbed: 'https://soundcloud.com/djbasilisk/renamed',
				},
				id: 'a-mix',
			}),
		];
		const result = validatePlatformEmbeds(mixes, { mixcloud: keys.mixcloud });

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
					soundcloudEmbed: [
						'https://soundcloud.com/djbasilisk/a-mix',
						'https://soundcloud.com/djbasilisk/b-mix',
					],
				},
				id: 'a-mix',
			}),
		];
		const withBoth = { ...keys, soundcloud: new Set(['/djbasilisk/a-mix', '/djbasilisk/b-mix']) };

		expect(validatePlatformEmbeds(mixes, withBoth).status).toBe('pass');
	});
});
