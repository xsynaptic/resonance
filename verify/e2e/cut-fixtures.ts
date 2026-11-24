import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { audioFixturePath } from '#e2e/constants.ts';

const run = promisify(execFile);

// Real music, not a synthetic tone, which has given a false positive through Safari automation before
const streamsDirectory = path.join(import.meta.dirname, '../../packages/content/streams');

const cutStartSeconds = 600;
const cutSeconds = 60;

// WebKit has no output mute and a zero volume exempts it from autoplay policy, so the file itself is quiet
const attenuationDb = -60;

async function findSource(): Promise<string> {
	const renditions = await readdir(streamsDirectory);
	const [first] = renditions
		.filter((name) => name.endsWith('.mp4'))
		.toSorted((left, right) => left.localeCompare(right));
	if (first === undefined) throw new Error(`No .mp4 in ${streamsDirectory}`);

	return path.join(streamsDirectory, first);
}

async function cutFixture(): Promise<void> {
	const source = await findSource();
	// An interrupted cut would otherwise leave a partial file the existence check never replaces
	const partialPath = `${audioFixturePath}.partial.mp4`;

	await mkdir(path.dirname(audioFixturePath), { recursive: true });
	await run('ffmpeg', [
		'-loglevel',
		'error',
		'-y',
		'-ss',
		String(cutStartSeconds),
		'-i',
		source,
		'-t',
		String(cutSeconds),
		'-vn',
		'-af',
		`volume=${String(attenuationDb)}dB`,
		'-c:a',
		'libopus',
		'-b:a',
		'128k',
		'-movflags',
		'+faststart',
		'-fflags',
		'+bitexact',
		'-flags:a',
		'+bitexact',
		partialPath,
	]);
	await rename(partialPath, audioFixturePath);
	console.log(`Cut ${path.basename(audioFixturePath)} from ${path.basename(source)}`);
}

if (!existsSync(audioFixturePath)) await cutFixture();
