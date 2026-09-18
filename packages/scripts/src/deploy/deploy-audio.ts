import chalk from 'chalk';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';

import { audioSourceDir, streamsDir, waveformsCacheDir } from '#audio/audio-paths.ts';
import { rsyncTo } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain, isPathPresent } from '#shared/utils.ts';

// The one place the server layout is named; stats-pull derives its own path from this
export const remoteRoot = '/srv/resonance';

const rsyncExcludes = ['.DS_Store', '*.tmp', '.gitkeep'];

const rsyncFlags = [
	'--partial',
	// -a would carry a 0600 source through to the box, where the web server's worker could not read it
	'--chmod=D755,F644',
	// A sleeping laptop should fail the run and resume from the partial file, not hang on TCP
	'--timeout=60',
	'-e',
	'ssh -o ConnectTimeout=15',
	// The remote host serves other traffic; nice this side so rsync never wins the CPU
	'--rsync-path=nice -n19 rsync',
	// One line per transferred file, which the health check probes
	'--out-format=%n',
];

const transferredOriginal = /\.(?:flac|mp3)$/i;
const transferredRendition = /\.mp4$/i;
const transferredArchive = /\.dat$/i;

export interface DeployedAudio {
	archives: Array<string>;
	originals: Array<string>;
	renditions: Array<string>;
}

interface DeployAudioOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

interface DerivedLeg {
	excludes: Array<string>;
	key: 'archives' | 'renditions';
	label: string;
	localDir: string;
	missingHint: string;
	remoteDir: string;
	transferred: RegExp;
}

const derivedLegs: Array<DerivedLeg> = [
	{
		excludes: rsyncExcludes,
		key: 'renditions',
		label: 'Renditions',
		localDir: streamsDir,
		missingHint: 'run audio-renditions first',
		remoteDir: 'stream',
		transferred: transferredRendition,
	},
	{
		// The previews share this directory but are inlined into pages, so nothing serves them
		excludes: [...rsyncExcludes, '*.json'],
		key: 'archives',
		label: 'Archives',
		localDir: waveformsCacheDir,
		missingHint: 'run audio-waveforms first',
		remoteDir: 'waveform',
		transferred: transferredArchive,
	},
];

// mtime+size, not checksum: audio is append-only and multi-gigabyte, so a no-op run is near-instant
// The originals leg never deletes, so a local mistake can't wipe the archive
// Neither do the derived legs; reapDerivedAudio clears superseded hashes once the new pages are live
export async function deployAudio(options: DeployAudioOptions): Promise<DeployedAudio> {
	const { config, dryRun = false, rootPath } = options;

	const sourceDir = path.join(rootPath, audioSourceDir);

	if (!(await isPathPresent(sourceDir))) {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	await ensureSshKeychain();

	console.log(chalk.blue('Deploying audio...'));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	console.log(
		chalk.gray(`  Originals: ${sourceDir}/ -> ${config.remoteHost}:${remoteRoot}/artifacts/`),
	);
	const artifactsOutput = await rsyncTo(
		`${sourceDir}/`,
		`${config.remoteHost}:${remoteRoot}/artifacts/`,
		{ archive: 'av', config, dryRun, excludes: rsyncExcludes, extraFlags: rsyncFlags },
	);

	// One leg at a time, because the box serves other traffic
	const derived: Pick<DeployedAudio, 'archives' | 'renditions'> = { archives: [], renditions: [] };

	for (const leg of derivedLegs) {
		const localPath = path.join(rootPath, leg.localDir);

		if (!(await isPathPresent(localPath))) {
			console.log(
				chalk.yellow(
					`  No ${leg.label.toLowerCase()} directory yet; skipping /${leg.remoteDir}/ (${leg.missingHint})`,
				),
			);
			continue;
		}

		console.log(
			chalk.gray(
				`  ${leg.label}: ${localPath}/ -> ${config.remoteHost}:${remoteRoot}/${leg.remoteDir}/`,
			),
		);

		const output = await rsyncTo(
			`${localPath}/`,
			`${config.remoteHost}:${remoteRoot}/${leg.remoteDir}/`,
			{ archive: 'av', config, dryRun, excludes: leg.excludes, extraFlags: rsyncFlags },
		);

		derived[leg.key] = parseTransferred(output, leg.transferred);
	}

	const originals = parseTransferred(artifactsOutput, transferredOriginal);

	console.log(
		chalk.green(
			`Done in ${((Date.now() - start) / 1000).toFixed(1)}s (${String(originals.length)} original(s), ${String(derived.renditions.length)} rendition(s), ${String(derived.archives.length)} archive(s) transferred)`,
		),
	);

	return { ...derived, originals };
}

// Both are named for their own bytes, so a re-derivation lands beside the live generation
// Deleting before the new pages ship would 404 every one of them for the whole upload
// Nothing transfers here: the upload pass already matched mtime and size, so only orphans go
export async function reapDerivedAudio(options: DeployAudioOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	for (const leg of derivedLegs) {
		const localPath = path.join(rootPath, leg.localDir);

		if (!(await isPathPresent(localPath))) continue;

		console.log(chalk.blue(`Reaping superseded ${leg.label.toLowerCase()}...`));
		if (dryRun) console.log(chalk.yellow('  DRY RUN'));

		const output = await rsyncTo(
			`${localPath}/`,
			`${config.remoteHost}:${remoteRoot}/${leg.remoteDir}/`,
			{
				archive: 'av',
				config,
				dryRun,
				excludes: leg.excludes,
				extraFlags: [...rsyncFlags, '--delete'],
			},
		);

		console.log(
			chalk.green(`Reaped ${String(countDeleted(output))} superseded ${leg.label.toLowerCase()}`),
		);
	}
}

// Any extension counts, so a superseded format (the .webm renditions) is reported as it goes
function countDeleted(output: string): number {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('deleting ') && !line.endsWith('/')).length;
}

// --progress writes its own lines into the same stream, so match on the extension rather than shape
// `--delete` writes `deleting <name>`, which also ends in the extension and is not a transfer
function parseTransferred(output: string, pattern: RegExp): Array<string> {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => !line.startsWith('deleting ') && pattern.test(line));
}
