import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema, termFields, termFieldsShared } from '#lib/schemas/index.ts';
import { LabelRefSchema, RefSchema } from '#lib/schemas/refs.ts';

// Timestamps drive cue sheet generation, so the shape is enforced rather than warned about
// Minutes and seconds must be in range; hours carry the overflow
// A failed parse is a build error naming the entry and field, which is the point
const TimestampSchema = z.string().regex(/^\d{2}:[0-5]\d:[0-5]\d(\.\d{1,2})?$/, {
	message: 'Use HH:MM:SS or HH:MM:SS.dd, with minutes and seconds under 60',
});

// Flat and short-keyed for hand-editing; `year`/`timestamp` stay strings (verbatim, e.g. "00:07:51")
// Ref fields are polymorphic, matching top-level artists/labels: bare string is free text, {id} links
// One schema serves a mix and a release tracklist; which optionals are filled is the only difference
const TrackSchema = z
	.object({
		// The extractor emits one name, kept whole; an array is for hand-editing a credit worth splitting
		artists: z.union([RefSchema, RefSchema.array()]),
		// A release track's own length, display only, where `timestamp` is a cue point into a set
		duration: z.string().optional(),
		labels: LabelRefSchema.array().optional(),
		mixArtists: z.union([RefSchema, RefSchema.array()]).optional(),
		// Vinyl side and index on a release ("A1"), standing in for the ordinal
		position: z.string().optional(),
		timestamp: TimestampSchema.optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

export type TrackValue = z.infer<typeof TrackSchema>;

// `files` names what a group's timestamps run against, so a split set carries one cue sheet per part
const TrackGroupSchema = z
	.object({
		description: z.string().optional(),
		files: z.string().array().optional(),
		title: z.string(),
		tracks: TrackSchema.array(),
	})
	.strict();

// Union of arrays, not an array of unions: a half-grouped list is a mistake, not a shape
const TracklistSchema = z.union([TrackSchema.array(), TrackGroupSchema.array()]);

export type TrackGroupValue = z.infer<typeof TrackGroupSchema>;
export type TracklistValue = z.infer<typeof TracklistSchema>;

// Series membership lives on the series entry
const audioFields = {
	links: z.string().array().optional(),
	tracks: TracklistSchema.optional(),
};

export const mixSchema = z
	.object({
		...contentBaseSchema,
		...termFieldsShared,
		...audioFields,
		// Which persona the mix was published as, not who it is about, so it replaces `artists` here
		alias: reference('artists').optional(),
		commentsEnabled: z.boolean().optional(),
		// Keyed on format, not filename: a filename is a delivery path and a rename must not orphan a count
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
		// Which release a tracklist came from, where `discogsUrl` stays the reader-facing link
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
