import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema, termFields, termFieldsShared } from '#lib/schemas/index.ts';
import { LabelRefSchema, RefSchema } from '#lib/schemas/refs.ts';

// Timestamps drive cue sheet generation, so the shape is enforced rather than warned about
// Minutes and seconds must be in range; hours carry the overflow
// A failed parse is a build error naming the entry and field
const TimestampSchema = z.string().regex(/^\d{2}:[0-5]\d:[0-5]\d(\.\d{1,2})?$/, {
	message: 'Use HH:MM:SS or HH:MM:SS.dd, with minutes and seconds under 60',
});

const TrackSchema = z
	.object({
		artists: z.union([RefSchema, RefSchema.array()]).optional(),
		duration: z.string().optional(),
		labels: LabelRefSchema.array().optional(),
		mixArtists: z.union([RefSchema, RefSchema.array()]).optional(),
		position: z.string().optional(),
		timestamp: TimestampSchema.optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

export type TrackValue = z.infer<typeof TrackSchema>;

const TrackGroupSchema = z
	.object({
		description: z.string().optional(),
		files: z.string().array().optional(),
		title: z.string(),
		tracks: TrackSchema.array(),
	})
	.strict();

const TracklistSchema = z.union([TrackSchema.array(), TrackGroupSchema.array()]);

export type TrackGroupValue = z.infer<typeof TrackGroupSchema>;
export type TracklistValue = z.infer<typeof TracklistSchema>;

const audioFields = {
	links: z.string().array().optional(),
	tracks: TracklistSchema.optional(),
};

export const mixSchema = z
	.object({
		...contentBaseSchema,
		...termFieldsShared,
		...audioFields,
		alias: reference('artists').optional(),
		commentsEnabled: z.boolean().optional(),
		downloadsLegacy: z.record(z.string(), z.number().int().nonnegative()).optional(),
		files: z.string().array().optional(),
		mixcloudLink: z.string().optional(),
		soundcloudLink: z.union([z.string(), z.string().array()]).optional(),
	})
	.strict();

export const reviewSchema = z
	.object({
		...contentBaseSchema,
		...termFields,
		...audioFields,
		commentsEnabled: z.boolean().optional(),
		discogsReleaseId: z.number().int().positive().optional(),
		discogsUrl: z.string().optional(),
		rating: z.number().min(1).max(100).optional(),
		// Reviews only: on a mix releaseTitle duplicates title and releaseYear duplicates its date
		// releaseTitle is the album title without the "Artist - " prefix, so `title` can't yield it
		releaseTitle: z.string().optional(),
		releaseYear: z.string().optional(),
		youtubeSearch: z.boolean().optional(),
	})
	.strict();
