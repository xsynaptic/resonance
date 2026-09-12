#!/usr/bin/env tsx
import { pullSoundcloudStats } from '#platform-stats/soundcloud-stats.ts';
import { toStatsPullOptions } from '#shared/cli.ts';

await pullSoundcloudStats(toStatsPullOptions());
