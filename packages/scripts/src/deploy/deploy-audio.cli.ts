#!/usr/bin/env tsx
import { deployAudio } from '#deploy/deploy-audio.ts';
import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await deployAudio({ ...toDryRunOptions(), config: loadDeployConfig() });
