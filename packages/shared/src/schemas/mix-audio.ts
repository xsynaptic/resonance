import { z } from 'zod';

export const mixStreamsVersion = 2;
export const mixWaveformsVersion = 2;

// Measured from the decoded rendition, since its gain and codec overshoot put it apart from the master
const StreamLoudnessSchema = z.object({
	integratedLufs: z.number(),
	truePeakDbtp: z.number(),
});

export type StreamLoudness = z.infer<typeof StreamLoudnessSchema>;

// Both are sorted by `base` so a re-run diffs cleanly
const MixStreamEntrySchema = z.object({
	base: z.string(),
	loudness: StreamLoudnessSchema,
	stream: z.string(),
});

export type MixStreamEntry = z.infer<typeof MixStreamEntrySchema>;

export const MixStreamsDocumentSchema = z.object({
	mixes: MixStreamEntrySchema.array(),
	version: z.literal(mixStreamsVersion),
});

export type MixStreamsDocument = z.infer<typeof MixStreamsDocumentSchema>;

// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixWaveformEntrySchema = z.object({
	archive: z.string(),
	base: z.string(),
	peaks: z.number().array(),
	seconds: z.number(),
	sources: z.string().array(),
});

export type MixWaveformEntry = z.infer<typeof MixWaveformEntrySchema>;

export const MixWaveformsDocumentSchema = z.object({
	mixes: MixWaveformEntrySchema.array(),
	version: z.literal(mixWaveformsVersion),
});

export type MixWaveformsDocument = z.infer<typeof MixWaveformsDocumentSchema>;
