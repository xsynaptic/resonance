export { describeWavedata } from '#describe.ts';
export type { BandsDescriptor, BandsFacts, PeaksDescriptor, PeaksFacts } from '#descriptor.ts';
export { buildBands, buildPeaks, parseBandsHeader, parsePeaksHeader } from '#files.ts';
export {
	bandCount,
	bandEdges,
	bandsDecibelRange,
	bandsHeaderBytes,
	formatVersion,
	overviewFullScale,
	peaksFieldCount,
	peaksFullScale,
	peaksHeaderBytes,
	samplesPerFrame,
	samplesPerPair,
} from '#format.ts';
export { framesByteRange, pairsByteRange, splitPairs } from '#slices.ts';
export { validateWavedata } from '#validate.ts';
