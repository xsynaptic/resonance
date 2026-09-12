import { ImageFeaturedSchema } from '@xsynaptic/shared/schemas';
import { reference } from 'astro:content';
import { z } from 'zod';

import { CreditSchema, LabelCreditSchema } from '#lib/schemas/credits.ts';

// Titles can be long (e.g. "Album Artwork: The Beginning Is at the End"), no upper bound
export const TitleSchema = z.string().min(1);

// Dates are wall-clock days anchored to UTC; a day of slack covers authoring from any timezone
function isNotFutureDate(date: Date) {
	const now = new Date();

	return date.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2);
}

// YAML parses `YYYY-MM-DD` and `YYYY-MM-DD HH:mm:ss` into UTC dates, so frontmatter leaves them bare
// A time without seconds stays a string and fails here, which is the quirk to know
const DateSchema = z.date().refine(isNotFutureDate, {
	message: 'Dates must not be in the future.',
});

export const contentBaseSchema = {
	dateCreated: DateSchema,
	dateUpdated: DateSchema.optional(),
	description: z.string().optional(),
	// Permalinks this entry used to answer to; generate-redirects is the only consumer
	formerIds: z.string().array().optional(),
	imageFeatured: ImageFeaturedSchema.optional(),
	title: TitleSchema,
};

// Term reference fields; these are what place an entry into a term index
// See lib/collections/terms/term-index.ts
// `artists` is split out because a mix carries an `alias` (the persona it was published as) instead
export const termFieldsShared = {
	eras: reference('eras').array().optional(),
	labels: LabelCreditSchema.array().optional(),
	regions: reference('regions').array().optional(),
	styles: reference('styles').array().optional(),
	themes: reference('themes').array().optional(),
};

export const termFields = {
	...termFieldsShared,
	artists: CreditSchema.array().optional(),
};
