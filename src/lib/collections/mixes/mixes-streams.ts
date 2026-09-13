import { getCollection } from 'astro:content';

import { getInHouseStreamTotal } from '#lib/collections/downloads/downloads-data.ts';
import { getMixcloudPlayCount } from '#lib/platform-stats/mixcloud-stats.ts';
import { getSoundcloudPlayCount } from '#lib/platform-stats/soundcloud-stats.ts';

// We only count plays for mixes linked on this site
export async function getStreamTotal(): Promise<number> {
	const mixes = await getCollection('mixes');

	let total = await getInHouseStreamTotal();

	for (const mix of mixes) {
		total += await getMixcloudPlayCount(mix.data.mixcloudLink);
		total += await getSoundcloudPlayCount(mix.data.soundcloudLink);
	}

	return total;
}
