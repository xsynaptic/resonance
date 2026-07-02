import { z } from 'zod';

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
		const [datePart = '', timePart] = value.split(' ');
		return new Date(`${datePart}T${timePart ?? '00:00'}:00Z`);
	});

// Cover image as a normalized path string, until originals are hosted
const ImageFeaturedSchema = z.string();

// Shared base fields for document collections (pages, posts, mixes, reviews, lists, designs)
export const contentBaseSchema = {
	dateCreated: DateStringSchema,
	dateUpdated: DateStringSchema.optional(),
	description: z.string().optional(),
	imageFeatured: ImageFeaturedSchema.optional(),
	imageHero: ImageFeaturedSchema.optional(),
	title: TitleSchema,
};
