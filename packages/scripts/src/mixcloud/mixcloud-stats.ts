import chalk from 'chalk';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Mixcloud's public REST API: no key, no auth, no registration
// An account sweep returns the whole catalog, so never fetch per mix
const accounts = ['Basilisk', 'SynapticFX'];
const apiBaseUrl = 'https://api.mixcloud.com';
const pageLimit = 100;

const documentVersion = 1;
const statsPath = 'packages/content/mixcloud-stats.json';
const tmpExtension = '.tmp';

interface Cloudcast {
	key: string;
	listener_count: number;
	play_count: number;
}

interface CloudcastPage {
	data: Array<unknown>;
	paging?: { next?: string };
}

interface MixcloudStatsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Soft-fail by design, as the download stats pull is: a deploy is never blocked on fresh counts
export async function pullMixcloudStats(options: MixcloudStatsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	console.log(chalk.blue('Pulling Mixcloud stats...'));

	try {
		const cloudcasts = await fetchAccounts();

		if (dryRun) {
			console.log(chalk.yellow(`  DRY RUN: ${String(cloudcasts.length)} cloudcasts not written`));
			return;
		}

		await writeStats(path.join(rootPath, statsPath), cloudcasts);
		console.log(chalk.green(`Wrote ${String(cloudcasts.length)} cloudcasts to ${statsPath}`));
	} catch (error) {
		console.log(
			chalk.yellow(
				`Mixcloud pull failed; keeping the last ${statsPath} (if any): ${String(error)}`,
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

// One failed account aborts the sweep, so a half-swept file never replaces a whole one
async function fetchAccounts(): Promise<Array<Cloudcast>> {
	const cloudcasts: Array<Cloudcast> = [];

	for (const account of accounts) {
		const fetched = await fetchAccount(account);
		const plays = fetched.reduce((total, cloudcast) => total + cloudcast.play_count, 0);

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
	const { key, listener_count, play_count } = value as Partial<Cloudcast>;

	if (
		typeof key !== 'string' ||
		typeof listener_count !== 'number' ||
		typeof play_count !== 'number'
	) {
		throw new TypeError(`Unexpected cloudcast: ${JSON.stringify(value).slice(0, 200)}`);
	}

	return { key, listener_count, play_count };
}

// Written aside and renamed, so a crash mid-write leaves the previous file intact
async function writeStats(filePath: string, cloudcasts: Array<Cloudcast>): Promise<void> {
	const document = {
		cloudcasts,
		generated_at: `${new Date().toISOString().slice(0, 19)}Z`,
		version: documentVersion,
	};
	const tmp = `${filePath}${tmpExtension}`;

	await writeFile(tmp, `${JSON.stringify(document, undefined, '\t')}\n`, 'utf8');
	await rename(tmp, filePath);
}
