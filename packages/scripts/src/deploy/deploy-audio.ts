import { log, withStep } from '@xsynaptic/astro-scripts';
import { waveformsCacheDir } from '@xsynaptic/shared/constants';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';
import type { RsyncSummary } from '#deploy/rsync-exec.ts';

import { audioSourceDir, streamsDir } from '#audio/audio-paths.ts';
import { describeRsyncSummary, rsyncTo } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain, isPathPresent } from '#shared/utils.ts';

// The one place the server layout is named; stats-pull derives its own path from this
export const remoteRoot = '/srv/resonance';

const rsyncExcludes = ['.DS_Store', '*.tmp', '.gitkeep'];

const rsyncFlags = [
	'--partial',
	'--partial-dir=.rsync-partial',
	// -a would carry a 0600 source through to the box, where the web server's worker could not read it
	'--chmod=D755,F644',
	// A sleeping laptop should fail the run and resume from the partial file, not hang on TCP
	'--timeout=60',
	// The remote host serves other traffic; nice this side so rsync never wins the CPU
	'--rsync-path=nice -n19 rsync',
];

const transferredOriginal = /\.(?:flac|mp3)$/i;
const transferredRendition = /\.mp4$/i;
const transferredWaveformFile = /\.(?:bands|dat)$/i;

export interface DeployedAudio {
	originals: Array<string>;
	renditions: Array<string>;
	waveformFiles: Array<string>;
}

interface DeployAudioOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

interface DerivedLeg {
	excludes: Array<string>;
	key: 'renditions' | 'waveformFiles';
	label: string;
	localDir: string;
	missingHint: string;
	remoteDir: string;
	transferred: RegExp;
}

interface LegSync {
	config: DeployConfig;
	dryRun: boolean;
	extraFlags: Array<string>;
	label: string;
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
		// The overviews share this directory but are inlined into pages, so nothing serves them
		excludes: [...rsyncExcludes, '*.json'],
		key: 'waveformFiles',
		label: 'Waveform files',
		localDir: waveformsCacheDir,
		missingHint: 'run audio-waveforms and audio-bands first',
		remoteDir: 'waveform',
		transferred: transferredWaveformFile,
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

	return withStep('Deploying audio', async () => {
		if (dryRun) log.warn('Dry run');

		log.detail(`Originals: ${sourceDir}/ -> ${config.remoteHost}:${remoteRoot}/artifacts/`);
		const artifactsSummary = await rsyncTo(
			`${sourceDir}/`,
			`${config.remoteHost}:${remoteRoot}/artifacts/`,
			{
				config,
				dryRun,
				excludes: rsyncExcludes,
				extraFlags: rsyncFlags,
				label: 'Uploading originals',
			},
		);

		log.detail(`Originals · ${describeRsyncSummary(artifactsSummary)}`);

		// One leg at a time, because the box serves other traffic
		const derived: Pick<DeployedAudio, 'renditions' | 'waveformFiles'> = {
			renditions: [],
			waveformFiles: [],
		};

		for (const leg of derivedLegs) {
			const localPath = path.join(rootPath, leg.localDir);

			if (!(await isPathPresent(localPath))) {
				log.warn(
					`No ${leg.label.toLowerCase()} directory yet; skipping /${leg.remoteDir}/ (${leg.missingHint})`,
				);
				continue;
			}

			log.detail(
				`${leg.label}: ${localPath}/ -> ${config.remoteHost}:${remoteRoot}/${leg.remoteDir}/`,
			);

			const summary = await rsyncLeg(leg, localPath, {
				config,
				dryRun,
				extraFlags: rsyncFlags,
				label: `Uploading ${leg.label.toLowerCase()}`,
			});

			log.detail(`${leg.label} · ${describeRsyncSummary(summary)}`);
			derived[leg.key] = getTransferred(summary, leg.transferred);
		}

		const originals = getTransferred(artifactsSummary, transferredOriginal);

		log.detail(
			`${String(originals.length)} original(s), ${String(derived.renditions.length)} rendition(s), ${String(derived.waveformFiles.length)} waveform file(s) transferred`,
		);

		return { ...derived, originals };
	});
}

// Both are named for their own bytes, so a re-derivation lands beside the live generation
// Deleting before the new pages ship would 404 every one of them for the whole upload
// Nothing transfers here: the upload pass already matched mtime and size, so only orphans go
export async function reapDerivedAudio(options: DeployAudioOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	// fallow-ignore-next-line code-duplication -- a loop header and a guard; the upload warns on a missing leg, this skips it
	for (const leg of derivedLegs) {
		const localPath = path.join(rootPath, leg.localDir);

		if (!(await isPathPresent(localPath))) continue;

		const label = leg.label.toLowerCase();

		if (dryRun) log.warn('Dry run');

		const { changes } = await rsyncLeg(leg, localPath, {
			config,
			dryRun,
			extraFlags: [...rsyncFlags, '--delete'],
			label: `Reaping superseded ${label}`,
		});

		// Any extension counts, so a superseded format (the .webm renditions) is reported as it goes
		const reaped = changes.filter((change) => change.kind === 'removed').length;

		log.detail(`Reaped ${String(reaped)} superseded ${label}`);
	}
}

function getTransferred({ changes }: RsyncSummary, pattern: RegExp): Array<string> {
	return changes
		.filter((change) => change.kind !== 'removed' && pattern.test(change.path))
		.map((change) => change.path);
}

// The reap deletes against the same destination and excludes the upload wrote through
function rsyncLeg(
	leg: DerivedLeg,
	localPath: string,
	{ config, dryRun, extraFlags, label }: LegSync,
): Promise<RsyncSummary> {
	return rsyncTo(`${localPath}/`, `${config.remoteHost}:${remoteRoot}/${leg.remoteDir}/`, {
		config,
		dryRun,
		excludes: leg.excludes,
		extraFlags,
		label,
	});
}
