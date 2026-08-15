import { z } from 'zod';

import { LabelRefSchema } from '#lib/schemas/refs.ts';

// One curated list entry; `description` is runtime-rendered markdown
// `linkId` links a review/entry by bare slug (like the <Link> component)
const ListItemSchema = z
	.object({
		artist: z.string().optional(),
		artistId: z.string().optional(),
		description: z.string().optional(),
		imageFeatured: z.string().optional(),
		labels: LabelRefSchema.array().optional(),
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

// Only the items are structured data; list-level props (order) live on the <List> in the body
// So `listItems` is a bare root array referenced via frontmatter
// Spread into posts and pages; stays here so ListItemSchema, its only member, need not move too
export const listFields = {
	listItems: ListItemSchema.array().optional(),
};
