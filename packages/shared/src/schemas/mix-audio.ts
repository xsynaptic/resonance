import { z } from 'zod';

export const mixAudioVersion = 1;

// Sorted by `base` so a re-run diffs cleanly
// `sources` lists every file sharing the base, so a consumer looks up a name it already has
const MixAudioEntrySchema = z.object({
	base: z.string(),
	peaks: z.number().array(),
	seconds: z.number(),
	sources: z.string().array(),
	stream: z.string(),
});

export type MixAudioEntry = z.infer<typeof MixAudioEntrySchema>;

export const MixAudioDocumentSchema = z.object({
	mixes: MixAudioEntrySchema.array(),
	version: z.literal(mixAudioVersion),
});

export type MixAudioDocument = z.infer<typeof MixAudioDocumentSchema>;
