import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';
import { LabelRefSchema } from '#lib/schemas/refs.ts';

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
		labels: LabelRefSchema.array().optional(),
	})
	.strict();
