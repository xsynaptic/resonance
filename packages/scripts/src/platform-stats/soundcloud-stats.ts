import chalk from 'chalk';
import path from 'node:path';

import type { StatsGeneration, StatsItem } from './platform-stats-file.js';
import type { SoundcloudTrack } from './soundcloud-api.js';

import {
	appendGeneration,
	isFresh,
	readLastGeneration,
	toStatsKey,
} from './platform-stats-file.js';
import { fetchAccessToken, fetchAccountTracks, resolveAccountUrn } from './soundcloud-api.js';

// Written as an array to match the Mixcloud sweep, so a second account is a one-line edit
const accounts = ['djbasilisk'];

const freshnessHours = 24;
export const soundcloudStatsPath = 'packages/content/data/soundcloud-stats.jsonl';

interface Credentials {
	clientId: string;
	clientSecret: string;
}

interface SoundcloudStatsOptions {
	dryRun?: boolean;
	force?: boolean;
	rootPath: string;
}

// Soft-fail by design, as the Mixcloud pull is: a deploy is never blocked on fresh counts
export async function pullSoundcloudStats(options: SoundcloudStatsOptions): Promise<void> {
	console.log(chalk.blue('Pulling SoundCloud stats...'));

	const credentials = toCredentials();

	if (!credentials) {
		console.log(chalk.yellow('  No SOUNDCLOUD_CLIENT_ID/SECRET; skipping'));
		return;
	}

	const filePath = path.join(options.rootPath, soundcloudStatsPath);

	try {
		await sweep(filePath, credentials, options);
	} catch (error) {
		console.log(
			chalk.yellow(
				`SoundCloud pull failed; appending nothing to ${soundcloudStatsPath}: ${String(error)}`,
			),
		);
	}
}

async function fetchAccounts(credentials: Credentials): Promise<Array<SoundcloudTrack>> {
	const accessToken = await fetchAccessToken(credentials.clientId, credentials.clientSecret);
	const tracks: Array<SoundcloudTrack> = [];

	for (const account of accounts) {
		const accountUrn = await resolveAccountUrn(accessToken, account);
		const fetched = await fetchAccountTracks(accessToken, accountUrn);
		const plays = fetched.reduce((total, track) => total + track.playback_count, 0);

		console.log(
			chalk.gray(
				`  ${account}: ${String(fetched.length)} tracks, ${plays.toLocaleString('en')} plays`,
			),
		);
		tracks.push(...fetched);
	}

	return tracks;
}

function hasRows(generation: StatsGeneration | undefined): boolean {
	return generation !== undefined && Object.keys(generation.items).length > 0;
}

async function sweep(
	filePath: string,
	credentials: Credentials,
	{ dryRun = false, force = false }: SoundcloudStatsOptions,
): Promise<void> {
	const lastGeneration = await readLastGeneration(filePath);
	const skipReason = toSkipReason(lastGeneration, force);

	if (skipReason) {
		console.log(chalk.gray(skipReason));
		return;
	}

	const tracks = await fetchAccounts(credentials);

	// A generation of zeroes poisons every delta spanning it, where a gap only interrupts one
	if (tracks.length === 0 && hasRows(lastGeneration)) {
		throw new Error('The sweep returned no tracks where the last generation had rows');
	}

	if (dryRun) {
		console.log(chalk.yellow(`  DRY RUN: ${String(tracks.length)} tracks not written`));
		return;
	}

	await appendGeneration(filePath, toItems(tracks));
	console.log(chalk.green(`Appended ${String(tracks.length)} tracks to ${soundcloudStatsPath}`));
}

function toCredentials(): Credentials | undefined {
	const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
	const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET;

	if (!clientId || !clientSecret) return undefined;

	return { clientId, clientSecret };
}

function toItems(tracks: Array<SoundcloudTrack>): Record<string, StatsItem> {
	const sorted = [...tracks].sort((first, second) =>
		first.permalink_url.localeCompare(second.permalink_url),
	);
	const items: Record<string, StatsItem> = {};

	for (const track of sorted) {
		items[toStatsKey(track.permalink_url)] = {
			comments: track.comment_count,
			id: track.urn,
			likes: track.favoritings_count,
			plays: track.playback_count,
			reposts: track.reposts_count,
		};
	}

	return items;
}

function toSkipReason(
	generation: StatsGeneration | undefined,
	isForced: boolean,
): string | undefined {
	if (isForced || !isFresh(generation, freshnessHours)) return undefined;

	return `  Last generation ${generation?.generated_at ?? ''} is under 24h; skipping`;
}
