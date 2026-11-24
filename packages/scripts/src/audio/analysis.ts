import type { WavedataFacts } from '@xsynaptic/plazmoid-wavedata';

import { readSubprocess } from '@xsynaptic/astro-scripts';
import { createWavedataWriter, validateWavedata } from '@xsynaptic/plazmoid-wavedata';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { z } from 'zod';

export interface MixAnalysis {
	facts: WavedataFacts;
	file: Uint8Array;
	seconds: number;
}

const ProbeSchema = z.object({
	streams: z
		.tuple([
			z.object({
				duration_ts: z.number().int().positive(),
				sample_rate: z.coerce.number().int().positive(),
				time_base: z.string(),
			}),
		])
		.rest(z.unknown()),
});

export async function analyzeMix(source: string): Promise<MixAnalysis> {
	const name = path.basename(source);
	const { frameCount, sampleRate } = await readSourceLength(source);
	const writer = createWavedataWriter({ hasBands: true, mode: 'overall', sampleRate });
	const ffmpeg = spawn('ffmpeg', writer.analysisArguments(source), {
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	const feed = async (): Promise<void> => {
		for await (const chunk of ffmpeg.stdout) writer.push(chunk as Buffer);
	};
	// Awaited together, so a failed spawn rejects here instead of going unhandled
	const [[code]] = (await Promise.all([once(ffmpeg, 'close'), feed()])) as [
		[null | number],
		undefined,
	];

	if (code !== 0) throw new Error(`ffmpeg exited ${String(code)} on ${name}`);

	const { facts, file, sampleCount } = writer.finish();

	// ffmpeg exits 0 on a truncated or damaged source, so this is the only proof the whole mix was read
	if (sampleCount !== frameCount) {
		throw new Error(
			`The analysis of ${name} read ${String(sampleCount)} frames, but the source has ${String(frameCount)}`,
		);
	}

	const problems = validateWavedata(file);

	if (problems.length > 0) {
		throw new Error(`Waveform data for ${name} is not valid: ${problems.join('; ')}`);
	}

	return { facts, file, seconds: Math.round((sampleCount / sampleRate) * 10) / 10 };
}

// `duration_ts` counts frames only when the time base is one frame, as FLAC's is
async function readSourceLength(
	source: string,
): Promise<{ frameCount: number; sampleRate: number }> {
	const name = path.basename(source);
	const result = await readSubprocess([
		'ffprobe',
		'-v',
		'error',
		'-select_streams',
		'a:0',
		'-show_entries',
		'stream=sample_rate,time_base,duration_ts',
		'-of',
		'json',
		source,
	]);
	const parsed = ProbeSchema.safeParse(JSON.parse(result.stdout));

	if (!parsed.success) throw new Error(`No sample rate and frame count from ffprobe for ${name}`);

	const [{ duration_ts: frameCount, sample_rate: sampleRate, time_base: timeBase }] =
		parsed.data.streams;

	if (timeBase !== `1/${String(sampleRate)}`) {
		throw new Error(`The time base of ${name} is ${timeBase}, so ffprobe gives no frame count`);
	}

	return { frameCount, sampleRate };
}
