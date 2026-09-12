import { toStatsKey } from '@xsynaptic/shared/platform-stats';

import { mixcloudStatsPath } from '#constants.ts';
import { getPlayCounts } from '#lib/platform-stats/platform-stats-document.ts';

export async function getMixcloudPlayCount(mixcloudLink: string | undefined): Promise<number> {
	if (!mixcloudLink) return 0;

	const counts = await getPlayCounts(mixcloudStatsPath);

	return counts.get(toStatsKey(mixcloudLink)) ?? 0;
}
