#!/usr/bin/env tsx
import { writeDiscogsTracklists } from '#discogs/discogs-tracklists.ts';
import { toDryRunOptions } from '#shared/cli.ts';

const { dryRun, rootPath } = toDryRunOptions();

await writeDiscogsTracklists(rootPath, dryRun);
