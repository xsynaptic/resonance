#!/usr/bin/env tsx
import { deployApp } from '#deploy/deploy-app.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await deployApp(toDryRunOptions());
