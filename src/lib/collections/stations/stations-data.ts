import { getCollection, getEntry } from 'astro:content';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { site } from '#lib/site.ts';
import { getWorkTitle } from '#lib/utils/work-title.ts';

export interface Station {
	id: string;
	image?: string | undefined;
	items: Array<PlayerPayloadItem>;
	title: string;
}

// An item with no playable Mix behind it is dropped here and reported by `pnpm validate station-items`
export async function getStations(): Promise<Array<Station>> {
	const collection = await getCollection('stations');
	const entries = collection.toSorted(
		(first, second) => first.data.position - second.data.position,
	);

	const stations = await Promise.all(
		entries.map(async ({ data, id }) => {
			const items = await Promise.all(data.stationItems.map((mixId) => getStationItem(mixId)));

			return {
				id,
				image: data.imageFeatured,
				items: items.filter((item) => item !== undefined),
				title: data.title,
			};
		}),
	);

	return stations.filter((station) => station.items.length > 0);
}

async function getStationItem(mixId: string): Promise<PlayerPayloadItem | undefined> {
	const entry = await getEntry('mixes', mixId);
	if (!entry) return undefined;

	const work = await getWorkTitle(entry);

	return getMixQueueItem(entry, work.credit?.name ?? site.title);
}
