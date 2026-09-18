import { getEntry } from 'astro:content';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

import { playlistsDataPath } from '#constants.ts';
import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { TitleSchema } from '#lib/schemas/index.ts';
import { site } from '#lib/site.ts';
import { getWorkTitle } from '#lib/utils/work-title.ts';

const playlistsSchema = z
	.object({
		imageFeatured: z.string().optional(),
		playlistItems: z.string().array().min(1),
		title: TitleSchema,
	})
	.strict()
	.array();

export interface Playlist {
	image?: string | undefined;
	items: Array<PlayerPayloadItem>;
	title: string;
}

// Read on every call rather than cached, so an edit shows on the next dev refresh
export async function getPlaylists(): Promise<Array<Playlist>> {
	const text = await readFile(path.resolve(playlistsDataPath), 'utf8');

	const playlists = await Promise.all(
		playlistsSchema.parse(parse(text)).map(async ({ imageFeatured, playlistItems, title }) => {
			const items = await Promise.all(playlistItems.map((mixId) => getPlaylistItem(mixId, title)));

			return { image: imageFeatured, items: items.filter((item) => item !== undefined), title };
		}),
	);

	return playlists.filter((playlist) => playlist.items.length > 0);
}

async function getPlaylistItem(
	mixId: string,
	playlistTitle: string,
): Promise<PlayerPayloadItem | undefined> {
	const entry = await getEntry('mixes', mixId);
	const work = entry ? await getWorkTitle(entry) : undefined;
	const item = entry ? await getMixQueueItem(entry, work?.credit?.name ?? site.title) : undefined;

	if (!item) console.warn(`[playlists] "${playlistTitle}" has no playable mix "${mixId}"`);

	return item;
}
