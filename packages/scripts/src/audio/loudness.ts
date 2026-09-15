import { $ } from 'zx';

export interface LoudnessMeasurement {
	integratedLufs: number;
	truePeakDbtp: number;
}

// BS.1770 integrated loudness and oversampled true peak, decoded to float so overs above full scale read as they are
// framelog=verbose keeps the per-frame readout out of stderr; a four-hour mix would otherwise log 144,000 lines
export async function measureLoudness(file: string): Promise<LoudnessMeasurement> {
	const result =
		await $`ffmpeg -nostdin -hide_banner -nostats -i ${file} -vn -af aformat=sample_fmts=flt,ebur128=peak=true:framelog=verbose -f null -`.quiet();

	return parseEbur128(result.stderr);
}

export function parseEbur128(stderr: string): LoudnessMeasurement {
	const summaryStart = stderr.lastIndexOf('Summary:');
	if (summaryStart === -1) throw new Error('ebur128 produced no summary');

	const summary = stderr.slice(summaryStart);

	return {
		integratedLufs: matchDb(summary, /I:\s+(-?[\d.]+|-inf) LUFS/, 'integrated loudness'),
		truePeakDbtp: matchDb(summary, /Peak:\s+(-?[\d.]+|-inf) dBFS/, 'true peak'),
	};
}

function matchDb(summary: string, pattern: RegExp, label: string): number {
	const value = pattern.exec(summary)?.[1];
	if (value === undefined) throw new Error(`ebur128 summary missing ${label}`);

	return value === '-inf' ? -Infinity : Number(value);
}
