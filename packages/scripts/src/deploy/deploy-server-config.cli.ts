#!/usr/bin/env tsx
import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { deployServerConfig } from '#deploy/deploy-server-config.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await deployServerConfig({ ...toDryRunOptions(), config: loadDeployConfig() });
