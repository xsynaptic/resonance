#!/usr/bin/env tsx
import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { pullStats } from '#deploy/stats-pull.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await pullStats({ ...toDryRunOptions(), config: loadDeployConfig() });
