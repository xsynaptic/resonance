import { reference } from 'astro:content';
import { z } from 'zod';

import { TitleSchema } from '#lib/schemas/index.ts';
import { RefSchema } from '#lib/schemas/refs.ts';

// Shared term fields; `description` lives in the body, not frontmatter
const termBaseSchema = {
	imageFeatured: z.string().optional(),
	imageHero: z.string().optional(),
	links: z.string().array().optional(),
	nameVariant: z.string().optional(),
	title: TitleSchema,
};

// members: the people/acts that make up this artist (a group's lineup)
// projects: the acts this artist is part of (a person's groups)
export const artistSchema = z
	.object({
		...termBaseSchema,
		members: RefSchema.array().optional(),
		projects: RefSchema.array().optional(),
	})
	.strict();

export const styleSchema = z
	.object({ ...termBaseSchema, parent: reference('styles').optional() })
	.strict();

export const labelSchema = z
	.object({ ...termBaseSchema, parent: reference('labels').optional() })
	.strict();

export const formatSchema = z.object({ ...termBaseSchema }).strict();

export const themeSchema = z.object({ ...termBaseSchema }).strict();

export const regionSchema = z
	.object({ ...termBaseSchema, parent: reference('regions').optional() })
	.strict();

export const eraSchema = z
	.object({ ...termBaseSchema, parent: reference('eras').optional() })
	.strict();

// The series entry owns its members: `seriesItems` is an ordered list of content ids
// Plain strings, not references, so one field resolves members across collections
// Array order is display order
export const seriesSchema = z
	.object({ ...termBaseSchema, seriesItems: z.string().array().optional() })
	.strict();
