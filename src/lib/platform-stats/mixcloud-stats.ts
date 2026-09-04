import { mixcloudStatsPath } from '#constants.ts';
import { getPlayCounts, toStatsKey } from '#lib/platform-stats/platform-stats-document.ts';

export async function getMixcloudPlayCount(mixcloudLink: string | undefined): Promise<number> {
	if (!mixcloudLink) return 0;

	const counts = await getPlayCounts(mixcloudStatsPath);

	return counts.get(toStatsKey(mixcloudLink)) ?? 0;
}
