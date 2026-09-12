#!/usr/bin/env tsx
import { generateRenditions } from '#audio/renditions.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await generateRenditions(toDryRunOptions());
