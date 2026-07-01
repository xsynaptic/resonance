import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema, LabelSchema } from '#lib/schemas/index.ts';

export const pageSchema = z
	.object({
		...contentBaseSchema,
		menuOrder: z.number().optional(),
		parent: reference('pages').optional(),
	})
	.strict();

export const postSchema = z
	.object({
		...contentBaseSchema,
		categories: reference('categories').array().optional(),
		tags: reference('tags').array().optional(),
	})
	.strict();

// "Album Artwork" / visual-work showcase; featured image + category + label taxonomy, no audio meta
export const designSchema = z
	.object({
		...contentBaseSchema,
		categories: reference('categories').array().optional(),
		labels: LabelSchema.array().optional(),
	})
	.strict();
