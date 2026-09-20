import { TimestampSchema } from '@xsynaptic/shared/schemas';
import { reference } from 'astro:content';
import { z } from 'zod';

import { CreditSchema, LabelCreditSchema } from '#lib/schemas/credits.ts';
import { contentBaseSchema, termFields, termFieldsShared } from '#lib/schemas/index.ts';

const TrackSchema = z
	.object({
		artists: z.union([CreditSchema, CreditSchema.array()]).optional(),
		duration: z.string().optional(),
		labels: LabelCreditSchema.array().optional(),
		mixArtists: z.union([CreditSchema, CreditSchema.array()]).optional(),
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
