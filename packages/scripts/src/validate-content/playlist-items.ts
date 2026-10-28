import type { ContentEntry } from '@xsynaptic/astro-scripts';

import { toValidationResult } from '@xsynaptic/astro-scripts';
import { parse } from 'yaml';

// The build drops an unknown item with only a warning, and a Playlist left empty disappears
export function validatePlaylistItems(
	playlistsYaml: string,
	location: string,
	mixes: Array<ContentEntry>,
) {
	const mixIds = new Set(mixes.map((entry) => entry.id));
	const playlists = parse(playlistsYaml) as Array<{
		playlistItems?: Array<string>;
		title?: string;
	}>;

	const issues: Array<{ id: string; title: string }> = [];

	for (const { playlistItems = [], title = '' } of playlists) {
		for (const id of playlistItems) {
			if (!mixIds.has(id)) issues.push({ id, title });
		}
	}

	return toValidationResult(
		issues.map(({ id, title }) => ({ location, message: `"${title}" has unknown mix "${id}"` })),
		{
			fail: `Found ${issues.length.toString()} unknown playlist item(s)`,
			pass: 'Playlist items valid',
		},
	);
}
