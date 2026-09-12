#!/usr/bin/env tsx
import { generateAudioManifest } from '#audio/manifest.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await generateAudioManifest(toDryRunOptions());
