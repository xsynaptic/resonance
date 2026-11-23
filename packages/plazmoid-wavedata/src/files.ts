import {
	bandCount,
	bandEdges,
	bandsDecibelRange,
	bandsHeaderBytes,
	formatVersion,
	minMaxRmsKind,
	peaksFieldCount,
	peaksHeaderBytes,
	rmsDecibelsKind,
	samplesPerFrame,
	samplesPerPair,
} from '#format.ts';

type HeaderField = [name: string, offset: number, value: number];

interface HeaderLayout {
	fields: ReadonlyArray<HeaderField>;
	headerBytes: number;
	label: string;
	tooShort: string;
}

interface HeaderInspection {
	count: number | undefined;
	problems: Array<string>;
	sampleRate: number | undefined;
}

const sampleRateOffset = 4;
const countOffset = 12;

const peaksLayout: HeaderLayout = {
	fields: [
		['version', 0, formatVersion],
		['samples per pair', 8, samplesPerPair],
		['field count', 16, peaksFieldCount],
		['value kind', 20, minMaxRmsKind],
	],
	headerBytes: peaksHeaderBytes,
	label: 'Peaks',
	tooShort: 'Peaks are shorter than their header',
};

const bandsLayout: HeaderLayout = {
	fields: [
		['version', 0, formatVersion],
		['samples per frame', 8, samplesPerFrame],
		['band count', 16, bandCount],
		['first band edge', 20, bandEdges[0]],
		['second band edge', 24, bandEdges[1]],
		['value kind', 28, rmsDecibelsKind],
		['decibel range', 32, bandsDecibelRange],
	],
	headerBytes: bandsHeaderBytes,
	label: 'Band data',
	tooShort: 'Band data is shorter than its header',
};

export function buildPeaks(fields: Int8Array | Uint8Array, sampleRate: number) {
	return buildFile(peaksLayout, toBytes(fields), {
		count: fields.length / peaksFieldCount,
		sampleRate,
	});
}

export function buildBands(levels: Uint8Array, sampleRate: number) {
	return buildFile(bandsLayout, levels, { count: levels.length / bandCount, sampleRate });
}

export function parsePeaksHeader(bytes: Uint8Array) {
	const { count, sampleRate } = parseHeader(peaksLayout, bytes);

	return { pairCount: count, sampleRate };
}

export function parseBandsHeader(bytes: Uint8Array) {
	const { count, sampleRate } = parseHeader(bandsLayout, bytes);

	return { frameCount: count, sampleRate };
}

export function inspectPeaksHeader(bytes: Uint8Array) {
	return inspectHeader(peaksLayout, bytes);
}

export function inspectBandsHeader(bytes: Uint8Array) {
	return inspectHeader(bandsLayout, bytes);
}

export function toSigned(bytes: Uint8Array) {
	return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function buildFile(
	layout: HeaderLayout,
	body: Uint8Array,
	{ count, sampleRate }: { count: number; sampleRate: number },
) {
	const file = new Uint8Array(layout.headerBytes + body.length);
	const view = new DataView(file.buffer);

	for (const [, offset, value] of layout.fields) view.setUint32(offset, value, true);

	view.setUint32(sampleRateOffset, sampleRate, true);
	view.setUint32(countOffset, count, true);
	file.set(body, layout.headerBytes);

	return file;
}

function inspectHeader(layout: HeaderLayout, bytes: Uint8Array): HeaderInspection {
	if (bytes.length < layout.headerBytes) {
		return { count: undefined, problems: [layout.tooShort], sampleRate: undefined };
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, layout.headerBytes);
	const problems: Array<string> = [];

	for (const [name, offset, value] of layout.fields) {
		const found = view.getUint32(offset, true);

		if (found !== value) {
			problems.push(`${layout.label} has ${name} ${String(found)}, expected ${String(value)}`);
		}
	}

	return {
		count: view.getUint32(countOffset, true),
		problems,
		sampleRate: view.getUint32(sampleRateOffset, true),
	};
}

function parseHeader(layout: HeaderLayout, bytes: Uint8Array) {
	const { count, problems, sampleRate } = inspectHeader(layout, bytes);
	const [problem] = problems;

	if (problem !== undefined || count === undefined || sampleRate === undefined) {
		throw new Error(problem ?? layout.tooShort);
	}

	return { count, sampleRate };
}

function toBytes(values: Int8Array | Uint8Array) {
	return new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
}
