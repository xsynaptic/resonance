import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';

// Manual list entries; the supported subfields (no code/dateReleased/linkYoutube)
const ListCustomItemSchema = z
	.object({
		description: z.string().optional(),
		image: z.string().optional(),
		label: z.string().optional(),
		link: z.string().optional(),
		linkDiscogs: z.string().optional(),
		linkSource: z.string().optional(),
		linkYoutubeSearch: z.boolean().optional(),
		project: z.string().optional(),
		releaseType: z.enum(['default', 'major', 'minor', 'other']).optional(),
		title: z.string().optional(),
		year: z.string().optional(),
	})
	.strict();

export const listSchema = z
	.object({
		...contentBaseSchema,
		banner: z.enum(['none', 'banner', 'random']).optional(),
		categories: reference('categories').array().optional(),
		format: z.enum(['full', 'table', 'basic', 'text']).optional(),
		listCustom: ListCustomItemSchema.array().optional(),
		// Association to mix/review entries as slugs (cross-collection, so not a reference())
		listPosts: z.string().array().optional(),
		order: z.enum(['unordered', 'ordered', 'countdown']).optional(),
		postscript: z.string().optional(),
		seriesOrder: z.number().optional(),
		styles: reference('styles').array().optional(),
	})
	.strict();
