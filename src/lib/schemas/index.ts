import { reference } from 'astro:content';
import { z } from 'zod';

import { LabelRefSchema, RefSchema } from '#lib/schemas/refs.ts';

// Titles can be long (e.g. "Album Artwork: The Beginning Is at the End"), no upper bound
export const TitleSchema = z.string().min(1);

// Frontmatter dates are ISO `YYYY-MM-DD`, optionally with ` HH:mm` (24-hour), transformed to Date
const dateRegex = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;

const DateStringSchema = z
	.string()
	.refine((value) => dateRegex.test(value), {
		message: 'Use ISO YYYY-MM-DD (optionally " HH:mm")',
	})
	.transform((value) => {
		const [datePart = '', timePart] = value.split(' ', 2);
		return new Date(`${datePart}T${timePart ?? '00:00'}:00Z`);
	});

// Cover image as a normalized path string, until originals are hosted
const ImageFeaturedSchema = z.string();

export const contentBaseSchema = {
	dateCreated: DateStringSchema,
	dateUpdated: DateStringSchema.optional(),
	description: z.string().optional(),
	imageFeatured: ImageFeaturedSchema.optional(),
	imageHero: ImageFeaturedSchema.optional(),
	title: TitleSchema,
};

// Term reference fields; these are what place an entry into a term index
// See lib/collections/terms/term-index.ts
// `artists` is split out because a mix carries an `alias` (the persona it was published as) instead
export const termFieldsShared = {
	eras: reference('eras').array().optional(),
	labels: LabelRefSchema.array().optional(),
	regions: reference('regions').array().optional(),
	styles: reference('styles').array().optional(),
	themes: reference('themes').array().optional(),
};

export const termFields = {
	...termFieldsShared,
	artists: RefSchema.array().optional(),
};
