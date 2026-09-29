import { describe, expect, test } from 'vitest';

import { validatePlaylistItems } from '#validate-content/playlist-items.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const mixes = [makeEntry({ id: 'moonshadow' }), makeEntry({ id: 'reunion' })];

const playlistsYaml = `
- title: Goa Trance
  playlistItems:
    - moonshadow
    - gone

- title: House & Techno
  playlistItems:
    - reunion
`;

describe('validatePlaylistItems', () => {
	test('fails on an item naming no mix, with the playlist it sits in', () => {
		expect(validatePlaylistItems(playlistsYaml, 'data/playlists.yaml', mixes)).toEqual({
			issues: [{ message: 'data/playlists.yaml: "Goa Trance" has unknown mix "gone"' }],
			status: 'fail',
			summary: 'Found 1 unknown playlist item(s)',
		});
	});
});
