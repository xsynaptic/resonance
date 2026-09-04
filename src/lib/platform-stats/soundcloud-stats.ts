import { soundcloudStatsPath } from '#constants.ts';
import { getPlayCounts, toStatsKey } from '#lib/platform-stats/platform-stats-document.ts';

// A mix published as two tracks sums its parts, so the figure appears on neither SoundCloud page
export async function getSoundcloudPlayCount(
	soundcloudEmbed: Array<string> | string | undefined,
): Promise<number> {
	if (!soundcloudEmbed) return 0;

	const counts = await getPlayCounts(soundcloudStatsPath);
	const urls = Array.isArray(soundcloudEmbed) ? soundcloudEmbed : [soundcloudEmbed];

	let plays = 0;

	for (const url of urls) {
		plays += counts.get(toStatsKey(url)) ?? 0;
	}

	return plays;
}
