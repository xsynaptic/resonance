import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';

// Only the per-track fields that actually carry data
// Flat and short-keyed for hand-editing; `year`/`time` stay strings (verbatim, e.g. "62:14")
const TrackSchema = z
	.object({
		artist: z.string(),
		label: z.string().optional(),
		remixer: z.string().optional(),
		time: z.string().optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

const ReleaseLabelSchema = z.object({ code: z.string().optional(), name: z.string() }).strict();

// Shared release metadata for mixes and reviews (enums are supersets; only some values are used)
// No release-level `project` scalar; the `artists` reference is the canonical artist link
const audioReleaseFields = {
	artists: reference('artists').array().optional(),
	eras: reference('eras').array().optional(),
	format: z
		.enum(['standard', 'mix-live', 'mix-studio', 'compilation', 'album', 'remixes'])
		.optional(),
	labels: ReleaseLabelSchema.array().optional(),
	labelsRef: reference('labels').array().optional(),
	links: z.string().array().optional(),
	notes: z.string().optional(),
	regions: reference('regions').array().optional(),
	releaseAttributes: z.enum(['various', 'nonexclusive', 'mixed']).array().optional(),
	releaseTitle: z.string().optional(),
	releaseType: z.enum(['default', 'major', 'minor', 'other']).optional(),
	releaseYear: z.string().optional(),
	series: reference('series').array().optional(),
	seriesOrder: z.number().optional(),
	styles: reference('styles').array().optional(),
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
