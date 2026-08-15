import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema, termFields } from '#lib/schemas/index.ts';
import { listFields } from '#lib/schemas/lists.ts';

export const pageSchema = z
	.object({
		...contentBaseSchema,
		...listFields,
		menuOrder: z.number().optional(),
		parent: reference('pages').optional(),
	})
	.strict();

// `format` is what shape the post takes and `topics` what it is about
// format stays optional because a couple of posts are only ever "about this site"
export const postSchema = z
	.object({
		...contentBaseSchema,
		...termFields,
		...listFields,
		format: reference('formats').optional(),
		topics: reference('topics').array().optional(),
	})
	.strict();
