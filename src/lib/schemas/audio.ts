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

// Only the per-track fields that actually carry data
// Flat and short-keyed for hand-editing; `year`/`timestamp` stay strings (verbatim, e.g. "00:07:51")
// Ref fields are polymorphic, matching top-level artists/labels: bare string is free text, {id} links
// The extractor emits one-element arrays; multiples are for hand-editing
const TrackSchema = z
	.object({
		artists: RefSchema.array(),
		labels: LabelRefSchema.array().optional(),
		mixArtists: RefSchema.array().optional(),
		timestamp: TimestampSchema.optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

export type TrackValue = z.infer<typeof TrackSchema>;

// Audio-only release metadata for mixes and reviews
// One unified `releaseType` enum spans both (mix-live/mix-studio vs standard/compilation/album/remixes)
// Series membership lives on the series entry
const audioFields = {
	links: z.string().array().optional(),
	releaseType: z
		.enum(['standard', 'mix-live', 'mix-studio', 'compilation', 'album', 'remixes'])
		.optional(),
	// Verbatim backup, not rendered (`tracks` drives display)
	// Kept because the extractor merges multi-tracklist mixes into `tracks` lossily
	tracklistRaw: z.string().optional(),
	tracks: TrackSchema.array().optional(),
};

export const mixSchema = z
	.object({
		...contentBaseSchema,
		...termFieldsShared,
		...audioFields,
		// Which persona the mix was published as, not who it is about, so it replaces `artists` here
		alias: reference('artists').optional(),
		files: z.string().array().optional(),
		mixcloudEmbed: z.string().optional(),
		soundcloudEmbed: z.string().optional(),
	})
	.strict();

export const reviewSchema = z
	.object({
		...contentBaseSchema,
		...termFields,
		...audioFields,
		discogsUrl: z.string().optional(),
		// Ektoplazm's editorial weighting of a release, never a type of anything
		prominence: z.enum(['default', 'major', 'minor', 'other']).optional(),
		rating: z.number().min(1).max(100).optional(),
		// Reviews only: on mixes all three were redundant
		// releaseTitle duplicated title, releaseYear duplicated dateCreated's year
		// prominence was an Ektoplazm concept
		// Here releaseTitle is the album title without the "Artist - " prefix, so title can't yield it
		releaseTitle: z.string().optional(),
		releaseYear: z.string().optional(),
		reviewAttributes: z.enum(['recommended', 'dj_fodder', 'youtube_link']).array().optional(),
		youtubeSearch: z.boolean().optional(),
	})
	.strict();
