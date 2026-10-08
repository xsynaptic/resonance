import { z } from 'zod';

export const mixAudioVersion = 1;

// Measured from the decoded rendition, since its gain and codec overshoot put it apart from the master
const StreamLoudnessSchema = z.object({
	integratedLufs: z.number(),
	truePeakDbtp: z.number(),
});

export type StreamLoudness = z.infer<typeof StreamLoudnessSchema>;

const MixAudioBandsSchema = z.object({
	file: z.string(),
	frames: z.number(),
	framesPerSecond: z.number(),
});

// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixAudioEntrySchema = z.object({
	archive: z.string(),
	bands: MixAudioBandsSchema.optional(),
	base: z.string(),
	loudness: StreamLoudnessSchema,
	pairs: z.number(),
	pairsPerSecond: z.number(),
	peaks: z.number().array(),
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
