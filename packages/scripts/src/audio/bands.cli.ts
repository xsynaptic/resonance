#!/usr/bin/env tsx
import { generateBands } from '#audio/bands.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await generateBands(toDryRunOptions());
