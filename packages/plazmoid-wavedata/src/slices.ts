import type { BandsDescriptor, PeaksDescriptor } from '#descriptor.ts';

import { toSigned } from '#files.ts';
import { peaksFieldCount } from '#format.ts';

export function pairsByteRange(
	{ byteOffset, pairCount }: Pick<PeaksDescriptor, 'byteOffset' | 'pairCount'>,
	firstPair: number,
	endPair: number,
) {
	return spanByteRange(firstPair, endPair, {
		byteOffset,
		bytesPerCell: peaksFieldCount,
		count: pairCount,
	});
}

export function framesByteRange(
	{
		bandCount,
		byteOffset,
		frameCount,
	}: Pick<BandsDescriptor, 'bandCount' | 'byteOffset' | 'frameCount'>,
	firstFrame: number,
	endFrame: number,
) {
	return spanByteRange(firstFrame, endFrame, {
		byteOffset,
		bytesPerCell: bandCount,
		count: frameCount,
	});
}

export function splitPairs(
	bytes: Uint8Array,
	target: { rms: Int8Array; samples: Int8Array },
	firstPair: number,
): void {
	const fields = toSigned(bytes);
	const pairs = Math.floor(fields.length / peaksFieldCount);

	for (let pair = 0; pair < pairs; pair += 1) {
		const at = pair * peaksFieldCount;
		const into = firstPair + pair;

		target.samples[into * 2] = fields[at] ?? 0;
		target.samples[into * 2 + 1] = fields[at + 1] ?? 0;
		target.rms[into] = fields[at + 2] ?? 0;
	}
}

function spanByteRange(
	first: number,
	end: number,
	{ byteOffset, bytesPerCell, count }: { byteOffset: number; bytesPerCell: number; count: number },
): [start: number, end: number] | undefined {
	const from = Math.max(0, first);
	const to = Math.min(count, end);

	if (to <= from) return undefined;

	return [byteOffset + from * bytesPerCell, byteOffset + to * bytesPerCell];
}
