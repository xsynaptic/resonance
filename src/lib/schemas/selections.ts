import { z } from 'zod';

import { LabelRefSchema, RefSchema } from '#lib/schemas/refs.ts';

// `entryId` names a mix, review, or post by bare slug and fills in whatever the selection leaves unset
const SelectionSchema = z
	.object({
		artist: RefSchema.optional(),
		description: z.string().optional(),
		entryId: z.string().optional(),
		imageFeatured: z.string().optional(),
		labels: LabelRefSchema.array().optional(),
		link: z.string().optional(),
		linkDiscogs: z.string().optional(),
		linkSource: z.string().optional(),
		linkYoutubeSearch: z.boolean().optional(),
		title: z.string().optional(),
		year: z.string().optional(),
	})
	.strict()
	.refine((value) => value.title !== undefined || value.entryId !== undefined, {
		message: 'A selection needs a title, an entryId, or both',
	});

export type SelectionValue = z.infer<typeof SelectionSchema>;

// A bare root array; order and variant are authored on the <Selections> tag, not in frontmatter
export const selectionFields = {
	selections: SelectionSchema.array().optional(),
};
