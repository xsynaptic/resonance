import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const fixturesDirectory = path.join(import.meta.dirname, '.fixtures');

const defaultSource = path.join(import.meta.dirname, '../../content/streams');

// Real music, not a synthetic tone, which has given a false positive through Safari automation before
const cuts = [
	{ name: 'long.mp4', seconds: 60 },
	{ name: 'short.mp4', seconds: 6 },
] as const;

const cutStartSeconds = 600;

// WebKit has no output mute and a zero volume exempts it from autoplay policy, so the file itself is quiet
const attenuationDb = -60;

const names = [...cuts.map(({ name }) => name), 'art.png'];

async function cutArtwork(): Promise<void> {
	await run('ffmpeg', [
		'-loglevel',
		'error',
		'-y',
		'-f',
		'lavfi',
		'-i',
		'color=c=0x2a4a5a:s=512x512',
		'-frames:v',
		'1',
		path.join(fixturesDirectory, 'art.png'),
	]);
}

async function cutAudio(source: string, name: string, seconds: number): Promise<void> {
	await run('ffmpeg', [
		'-loglevel',
		'error',
		'-y',
		'-ss',
		String(cutStartSeconds),
		'-i',
		source,
		'-t',
		String(seconds),
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
		path.join(fixturesDirectory, name),
	]);
}

async function cutFixtures(sourceArgument: string): Promise<void> {
	const source = await resolveSource(sourceArgument);

	await mkdir(fixturesDirectory, { recursive: true });
	await Promise.all([
		...cuts.map(({ name, seconds }) => cutAudio(source, name, seconds)),
		cutArtwork(),
	]);
	console.log(`Cut ${names.join(', ')} from ${path.basename(source)}`);
}

async function resolveSource(source: string): Promise<string> {
	const stats = await stat(source);
	if (stats.isFile()) return source;

	const renditions = await readdir(source);
	const [first] = renditions
		.filter((name) => name.endsWith('.mp4'))
		.toSorted((left, right) => left.localeCompare(right));
	if (first === undefined) throw new Error(`No .mp4 in ${source}`);

	return path.join(source, first);
}

if (names.some((name) => !existsSync(path.join(fixturesDirectory, name)))) {
	await cutFixtures(process.argv[2] ?? defaultSource);
}
