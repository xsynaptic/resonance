import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';
import { LabelRefSchema, RefSchema } from '#lib/schemas/refs.ts';

// Only the per-track fields that actually carry data
// Flat and short-keyed for hand-editing; `year`/`time` stay strings (verbatim, e.g. "62:14")
// artist/label/remixer are free text; the optional *Id fields link them to a catalog entry
const TrackSchema = z
	.object({
		artist: z.string(),
		artistId: z.string().optional(),
		label: z.string().optional(),
		labelId: z.string().optional(),
		remixer: z.string().optional(),
		remixerId: z.string().optional(),
		time: z.string().optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

export type TrackValue = z.infer<typeof TrackSchema>;

// Shared release metadata for mixes and reviews. One unified `format` enum spanning both (mixes use
// mix-live/mix-studio, reviews use standard/compilation/album/remixes). Series membership lives on the
// series entry (`seriesItems`), not here, so releases carry no series reference.
const audioReleaseFields = {
	artists: RefSchema.array().optional(),
	eras: reference('eras').array().optional(),
	format: z
		.enum(['standard', 'mix-live', 'mix-studio', 'compilation', 'album', 'remixes'])
		.optional(),
	labels: LabelRefSchema.array().optional(),
	links: z.string().array().optional(),
	regions: reference('regions').array().optional(),
	releaseTitle: z.string().optional(),
	releaseType: z.enum(['default', 'major', 'minor', 'other']).optional(),
	releaseYear: z.string().optional(),
	styles: reference('styles').array().optional(),
	// Verbatim source-of-truth backup, intentionally not rendered; `tracks` drives display. Kept because
	// the extractor merges multi-tracklist mixes into `tracks` lossily, and this preserves the original
	tracklistRaw: z.string().optional(),
	tracks: TrackSchema.array().optional(),
};

export const mixSchema = z
	.object({
		...contentBaseSchema,
		...audioReleaseFields,
		files: z.string().array().optional(),
		mixcloudEmbed: z.string().optional(),
		soundcloudEmbed: z.string().optional(),
	})
	.strict();

export const reviewSchema = z
	.object({
		...contentBaseSchema,
		...audioReleaseFields,
		discogsUrl: z.string().optional(),
		rating: z.number().min(1).max(100).optional(),
		reviewAttributes: z.enum(['recommended', 'dj_fodder', 'youtube_link']).array().optional(),
		youtubeSearch: z.boolean().optional(),
	})
	.strict();
