import { z } from 'zod';

export const mixAudioVersion = 9;

// Measured from the decoded rendition, since its gain and codec overshoot put it apart from the master
const StreamLoudnessSchema = z.object({
	integratedLufs: z.number(),
	truePeakDbtp: z.number(),
});

export type StreamLoudness = z.infer<typeof StreamLoudnessSchema>;

// Strict, so a field a newer writer adds fails here instead of being dropped before the player
export const WavedataFactsSchema = z.strictObject({
	bands: z.strictObject({ medians: z.tuple([z.number(), z.number(), z.number()]).readonly() }),
	formatVersion: z.literal(2),
	mode: z.literal('overall'),
	overview: z.string(),
	pairCount: z.number(),
	rmsRange: z.tuple([z.number(), z.number()]).readonly(),
	sampleRate: z.number(),
});

const MixWaveformSchema = WavedataFactsSchema.extend({ path: z.string() });

// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixAudioEntrySchema = z.object({
	base: z.string(),
	loudness: StreamLoudnessSchema,
	seconds: z.number(),
	sources: z.string().array(),
	stream: z.string(),
	waveform: MixWaveformSchema,
});

export type MixAudioEntry = z.infer<typeof MixAudioEntrySchema>;

// Sorted by `base` so a re-run diffs cleanly
export const MixAudioDocumentSchema = z.object({
	mixes: MixAudioEntrySchema.array(),
	version: z.literal(mixAudioVersion),
});
