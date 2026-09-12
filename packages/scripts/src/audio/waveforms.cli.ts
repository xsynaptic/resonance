#!/usr/bin/env tsx
import { generateWaveforms } from '#audio/waveforms.ts';
import { toDryRunOptions } from '#shared/cli.ts';

await generateWaveforms(toDryRunOptions());
