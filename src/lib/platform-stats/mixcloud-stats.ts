import { mixcloudStatsPath } from '#constants.ts';
import { getPlayCounts, toStatsKey } from '#lib/platform-stats/platform-stats-document.ts';

export async function getMixcloudPlayCount(mixcloudEmbed: string | undefined): Promise<number> {
	if (!mixcloudEmbed) return 0;

	const counts = await getPlayCounts(mixcloudStatsPath);

	return counts.get(toStatsKey(mixcloudEmbed)) ?? 0;
}
