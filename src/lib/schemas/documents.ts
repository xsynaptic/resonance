import { z } from 'zod';

import { contentBaseSchema, termFields } from '#lib/schemas/index.ts';
import { selectionFields } from '#lib/schemas/selections.ts';

export const pageSchema = z
	.object({
		...contentBaseSchema,
		...selectionFields,
	})
	.strict();

export const postSchema = z
	.object({
		...contentBaseSchema,
		...termFields,
		...selectionFields,
		commentsEnabled: z.boolean().optional(),
	})
	.strict();
