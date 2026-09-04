import { soundcloudStatsPath } from '#constants.ts';
import { getPlayCounts, toStatsKey } from '#lib/platform-stats/platform-stats-document.ts';

// A mix published as two tracks sums its parts, so the figure appears on neither SoundCloud page
export async function getSoundcloudPlayCount(
	soundcloudLink: Array<string> | string | undefined,
): Promise<number> {
	if (!soundcloudLink) return 0;

	const counts = await getPlayCounts(soundcloudStatsPath);
	const urls = Array.isArray(soundcloudLink) ? soundcloudLink : [soundcloudLink];

	let plays = 0;

	for (const url of urls) {
		plays += counts.get(toStatsKey(url)) ?? 0;
	}

	return plays;
}
