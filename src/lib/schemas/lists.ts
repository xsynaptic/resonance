import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';

// One curated list entry; `description` is runtime-rendered markdown; `linkId` links a review/entry by
// bare slug (like the <Link> component)
const ListItemSchema = z
	.object({
		artist: z.string().optional(),
		artistId: z.string().optional(),
		description: z.string().optional(),
		imageFeatured: z.string().optional(),
		label: z.string().optional(),
		labelId: z.string().optional(),
		link: z.string().optional(),
		linkDiscogs: z.string().optional(),
		linkId: z.string().optional(),
		linkSource: z.string().optional(),
		linkYoutubeSearch: z.boolean().optional(),
		releaseType: z.string().optional(),
		title: z.string(),
		year: z.string().optional(),
	})
	.strict();

export type ListItemValue = z.infer<typeof ListItemSchema>;

// Only the items are structured data; list-level props (order) live on the <List> in the body, so
// `listItems` is a bare root array referenced via frontmatter
export const listSchema = z
	.object({
		...contentBaseSchema,
		listItems: ListItemSchema.array().optional(),
		styles: reference('styles').array().optional(),
	})
	.strict();
