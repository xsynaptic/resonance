import { reference } from 'astro:content';
import { z } from 'zod';

import { TitleSchema } from '#lib/schemas/index.ts';
import { RefSchema } from '#lib/schemas/refs.ts';

// Shared term fields; `description` lives in the body, not frontmatter
const taxonomyBaseSchema = {
	imageFeatured: z.string().optional(),
	imageHero: z.string().optional(),
	nameVariant: z.string().optional(),
	termLinks: z.string().array().optional(),
	title: TitleSchema,
};

// members: the people/acts that make up this artist (a group's lineup)
// projects: the acts this artist is part of (a person's groups)
export const artistSchema = z
	.object({
		...taxonomyBaseSchema,
		members: RefSchema.array().optional(),
		projects: RefSchema.array().optional(),
	})
	.strict();

export const styleSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('styles').optional() })
	.strict();

export const labelSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('labels').optional() })
	.strict();

export const tagSchema = z.object({ ...taxonomyBaseSchema }).strict();

export const regionSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('regions').optional() })
	.strict();

export const eraSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('eras').optional() })
	.strict();

// The series entry owns its members: `seriesItems` is an ordered list of content ids (plain strings,
// not references, so one field resolves members across collections); array order is display order
export const seriesSchema = z
	.object({ ...taxonomyBaseSchema, seriesItems: z.string().array().optional() })
	.strict();
