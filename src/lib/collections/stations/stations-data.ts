import { getEntry } from 'astro:content';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

import { stationsDataPath } from '#constants.ts';
import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { TitleSchema } from '#lib/schemas/index.ts';
import { site } from '#lib/site.ts';
import { getWorkTitle } from '#lib/utils/work-title.ts';

const stationsSchema = z
	.object({
		imageFeatured: z.string().optional(),
		stationItems: z.string().array().min(1),
		title: TitleSchema,
	})
	.strict()
	.array();

export interface Station {
	image?: string | undefined;
	items: Array<PlayerPayloadItem>;
	title: string;
}

// Read on every call rather than cached, so an edit shows on the next dev refresh
export async function getStations(): Promise<Array<Station>> {
	const text = await readFile(path.resolve(stationsDataPath), 'utf8');

	const stations = await Promise.all(
		stationsSchema.parse(parse(text)).map(async ({ imageFeatured, stationItems, title }) => {
			const items = await Promise.all(stationItems.map((mixId) => getStationItem(mixId, title)));

			return { image: imageFeatured, items: items.filter((item) => item !== undefined), title };
		}),
	);

	return stations.filter((station) => station.items.length > 0);
}

async function getStationItem(
	mixId: string,
	stationTitle: string,
): Promise<PlayerPayloadItem | undefined> {
	const entry = await getEntry('mixes', mixId);
	const work = entry ? await getWorkTitle(entry) : undefined;
	const item = entry ? await getMixQueueItem(entry, work?.credit?.name ?? site.title) : undefined;

	if (!item) console.warn(`[stations] "${stationTitle}" has no playable mix "${mixId}"`);

	return item;
}
