import { reference } from 'astro:content';
import { z } from 'zod';

import { TitleSchema } from '#lib/schemas/index.ts';

// Shared term fields
const taxonomyBaseSchema = {
	description: z.string().optional(),
	heroImageId: z.string().optional(),
	imageId: z.string().optional(),
	nameVariant: z.string().optional(),
	teaser: z.string().optional(),
	teaserSize: z.string().optional(),
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

export const seriesSchema = z
	.object({ ...taxonomyBaseSchema, ordered: z.boolean().optional() })
	.strict();
