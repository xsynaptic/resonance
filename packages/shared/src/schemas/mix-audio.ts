import { z } from 'zod';

export const mixAudioVersion = 8;

// Measured from the decoded rendition, since its gain and codec overshoot put it apart from the master
const StreamLoudnessSchema = z.object({
	integratedLufs: z.number(),
	truePeakDbtp: z.number(),
});

export type StreamLoudness = z.infer<typeof StreamLoudnessSchema>;

export const WaveformFactsSchema = z.object({
	bands: z.object({
		bandCount: z.number(),
		byteOffset: z.number(),
		frameCount: z.number(),
		framesPerSecond: z.number(),
		medians: z.number().array().readonly(),
		minDecibels: z.number(),
	}),
	byteOffset: z.number(),
	formatVersion: z.number(),
	pairCount: z.number(),
	pairsPerSecond: z.number(),
	rmsRange: z.tuple([z.number(), z.number()]).readonly(),
});

// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixAudioEntrySchema = z.object({
	bands: z.string(),
	base: z.string(),
	facts: WaveformFactsSchema,
	loudness: StreamLoudnessSchema,
	// Base64 of one byte per bucket, 255 at the loudest
	overview: z.string(),
	peaks: z.string(),
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
