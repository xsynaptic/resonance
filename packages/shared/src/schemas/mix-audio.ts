import { z } from 'zod';

export const mixAudioVersion = 6;

// Measured from the decoded rendition, since its gain and codec overshoot put it apart from the master
const StreamLoudnessSchema = z.object({
	integratedLufs: z.number(),
	truePeakDbtp: z.number(),
});

export type StreamLoudness = z.infer<typeof StreamLoudnessSchema>;

// The 10th and 95th percentiles of the levels above -60 dBFS; [0, 0] for a mix with none
const LevelRangeSchema = z.tuple([z.number(), z.number()]);

const MixAudioBandsSchema = z.object({
	file: z.string(),
	frameCount: z.number(),
	framesPerSecond: z.number(),
	// In level bytes, low band first
	medians: z.number().array(),
});

// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixAudioEntrySchema = z.object({
	bands: MixAudioBandsSchema,
	base: z.string(),
	loudness: StreamLoudnessSchema,
	// Base64 of one byte per bucket, 255 at the loudest
	overview: z.string(),
	pairCount: z.number(),
	pairsPerSecond: z.number(),
	peaks: z.string(),
	// In the Peaks' Int8 units
	rmsRange: LevelRangeSchema,
	seconds: z.number(),
	sources: z.string().array(),
	stream: z.string(),
});

export type MixAudioEntry = z.infer<typeof MixAudioEntrySchema>;

// Sorted by `base` so a re-run diffs cleanly
export const MixAudioDocumentSchema = z.object({
	mixes: MixAudioEntrySchema.array(),
	version: z.literal(mixAudioVersion),
});
