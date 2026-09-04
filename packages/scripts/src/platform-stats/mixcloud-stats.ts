import chalk from 'chalk';
import path from 'node:path';

import type { StatsItem } from './platform-stats-file.js';

import {
	appendGeneration,
	isFresh,
	readLastGeneration,
	toStatsKey,
} from './platform-stats-file.js';

// Mixcloud's public REST API: no key, no auth, no registration
// An account sweep returns the whole catalog, so never fetch per mix
const accounts = ['Basilisk', 'SynapticFX'];
const apiBaseUrl = 'https://api.mixcloud.com';
const pageLimit = 100;

const freshnessHours = 24;
export const mixcloudStatsPath = 'packages/content/mixcloud-stats.jsonl';

interface Cloudcast {
	item: StatsItem;
	key: string;
}

interface CloudcastPage {
	data: Array<unknown>;
	paging?: { next?: string };
}

interface MixcloudStatsOptions {
	dryRun?: boolean;
	force?: boolean;
	rootPath: string;
}

// Soft-fail by design, as the download stats pull is: a deploy is never blocked on fresh counts
export async function pullMixcloudStats(options: MixcloudStatsOptions): Promise<void> {
	const { dryRun = false, force = false, rootPath } = options;

	console.log(chalk.blue('Pulling Mixcloud stats...'));

	const filePath = path.join(rootPath, mixcloudStatsPath);

	try {
		const lastGeneration = await readLastGeneration(filePath);

		if (!force && isFresh(lastGeneration, freshnessHours)) {
			console.log(
				chalk.gray(
					`  Last generation ${String(lastGeneration?.generated_at)} is under 24h; skipping`,
				),
			);
			return;
		}

		const cloudcasts = await fetchAccounts();

		if (dryRun) {
			console.log(chalk.yellow(`  DRY RUN: ${String(cloudcasts.length)} cloudcasts not written`));
			return;
		}

		await appendGeneration(filePath, toItems(cloudcasts));
		console.log(
			chalk.green(`Appended ${String(cloudcasts.length)} cloudcasts to ${mixcloudStatsPath}`),
		);
	} catch (error) {
		console.log(
			chalk.yellow(
				`Mixcloud pull failed; appending nothing to ${mixcloudStatsPath}: ${String(error)}`,
			),
		);
	}
}

async function fetchAccount(account: string): Promise<Array<Cloudcast>> {
	const cloudcasts: Array<Cloudcast> = [];

	let nextUrl: string | undefined =
		`${apiBaseUrl}/${account}/cloudcasts/?limit=${String(pageLimit)}`;

	while (nextUrl) {
		const response = await fetch(nextUrl, { signal: AbortSignal.timeout(15_000) });

		if (!response.ok) {
			throw new Error(`Mixcloud returned ${String(response.status)} for ${nextUrl}`);
		}

		const page = (await response.json()) as CloudcastPage;

		for (const item of page.data) {
			cloudcasts.push(toCloudcast(item));
		}

		nextUrl = page.paging?.next;
	}

	return cloudcasts;
}

// One failed account aborts the sweep, so a half-swept file never appends beside a whole one
async function fetchAccounts(): Promise<Array<Cloudcast>> {
	const cloudcasts: Array<Cloudcast> = [];

	for (const account of accounts) {
		const fetched = await fetchAccount(account);
		const plays = fetched.reduce((total, cloudcast) => total + cloudcast.item.plays, 0);

		console.log(
			chalk.gray(
				`  ${account}: ${String(fetched.length)} cloudcasts, ${plays.toLocaleString('en')} plays`,
			),
		);
		cloudcasts.push(...fetched);
	}

	return cloudcasts.sort((first, second) => first.key.localeCompare(second.key));
}

// The counts are the whole point of the pull, so a row missing one is worth stopping for
function toCloudcast(value: unknown): Cloudcast {
	const { comment_count, favorite_count, key, listener_count, play_count, repost_count } =
		value as Record<string, unknown>;

	if (
		typeof key !== 'string' ||
		typeof comment_count !== 'number' ||
		typeof favorite_count !== 'number' ||
		typeof listener_count !== 'number' ||
		typeof play_count !== 'number' ||
		typeof repost_count !== 'number'
	) {
		throw new TypeError(`Unexpected cloudcast: ${JSON.stringify(value).slice(0, 200)}`);
	}

	return {
		item: {
			comments: comment_count,
			likes: favorite_count,
			listeners: listener_count,
			plays: play_count,
			reposts: repost_count,
		},
		key: toStatsKey(key),
	};
}

function toItems(cloudcasts: Array<Cloudcast>): Record<string, StatsItem> {
	const items: Record<string, StatsItem> = {};

	for (const cloudcast of cloudcasts) {
		items[cloudcast.key] = cloudcast.item;
	}

	return items;
}
