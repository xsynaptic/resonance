import { reference } from 'astro:content';
import { z } from 'zod';

import { TitleSchema } from '#lib/schemas/index.ts';

// Shared term fields; `description` lives in the body, not frontmatter
const taxonomyBaseSchema = {
	imageFeatured: z.string().optional(),
	imageHero: z.string().optional(),
	nameVariant: z.string().optional(),
	termLinks: z.string().array().optional(),
	title: TitleSchema,
};

export const artistSchema = z.object({ ...taxonomyBaseSchema }).strict();

export const styleSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('styles').optional() })
	.strict();

export const labelSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('labels').optional() })
	.strict();

export const categorySchema = z.object({ ...taxonomyBaseSchema }).strict();

export const tagSchema = z.object({ ...taxonomyBaseSchema }).strict();

export const regionSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('regions').optional() })
	.strict();

export const eraSchema = z
	.object({ ...taxonomyBaseSchema, parent: reference('eras').optional() })
	.strict();

// The series entry owns its members: `seriesItems` is an ordered list of content ids. Plain strings,
// not references, so a single field can resolve members by bare id across content collections without
// binding to one target collection. Array order is the display order.
export const seriesSchema = z
	.object({ ...taxonomyBaseSchema, seriesItems: z.string().array().optional() })
	.strict();
