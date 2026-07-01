import { reference } from 'astro:content';
import { z } from 'zod';

import { contentBaseSchema } from '#lib/schemas/index.ts';

// List items and ordering now live in the body as <List>/<ListItem> MDX, not frontmatter
export const listSchema = z
	.object({
		...contentBaseSchema,
		categories: reference('categories').array().optional(),
		seriesOrder: z.number().optional(),
		styles: reference('styles').array().optional(),
	})
	.strict();
