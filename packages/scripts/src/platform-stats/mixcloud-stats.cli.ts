#!/usr/bin/env tsx
import { pullMixcloudStats } from '#platform-stats/mixcloud-stats.ts';
import { toStatsPullOptions } from '#shared/cli.ts';

await pullMixcloudStats(toStatsPullOptions());
