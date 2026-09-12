import { z } from 'zod';

import { CreditSchema, LabelCreditSchema } from '#lib/schemas/credits.ts';

// Field names match a review's, so a row and the review it links describe a release alike
// `entryId` names a mix, review, or post by bare slug and fills in whatever the selection leaves unset
const SelectionSchema = z
	.object({
		// One name from the extractor, kept whole; an array is for hand-editing a credit worth splitting
		artists: z.union([CreditSchema, CreditSchema.array()]).optional(),
		description: z.string().optional(),
		discogsUrl: z.string().optional(),
		entryId: z.string().optional(),
		imageFeatured: z.string().optional(),
		labels: LabelCreditSchema.array().optional(),
		links: z.string().array().optional(),
		title: z.string().optional(),
		year: z.string().optional(),
		youtubeSearch: z.boolean().optional(),
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
