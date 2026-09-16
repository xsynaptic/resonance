import { ImageFeaturedSchema } from '@xsynaptic/shared/schemas';
import { reference } from 'astro:content';
import { z } from 'zod';

import { CreditSchema } from '#lib/schemas/credits.ts';
import { TitleSchema } from '#lib/schemas/index.ts';

const termBaseSchema = {
	_appearanceCount: z.number().int().optional(),
	_entryCount: z.number().int().optional(),
	imageFeatured: ImageFeaturedSchema.optional(),
	links: z.string().array().optional(),
	nameVariant: z.string().optional(),
	title: TitleSchema,
};

// members: the people/acts that make up this artist (a group's lineup)
// projects: the acts this artist is part of (a person's groups)
export const artistSchema = z
	.object({
		...termBaseSchema,
		members: CreditSchema.array().optional(),
		projects: CreditSchema.array().optional(),
	})
	.strict();

export const styleSchema = z
	.object({ ...termBaseSchema, parent: reference('styles').optional() })
	.strict();

export const labelSchema = z
	.object({ ...termBaseSchema, parent: reference('labels').optional() })
	.strict();

export const themeSchema = z.object({ ...termBaseSchema }).strict();

export const regionSchema = z
	.object({ ...termBaseSchema, parent: reference('regions').optional() })
	.strict();

export const eraSchema = z
	.object({ ...termBaseSchema, parent: reference('eras').optional() })
	.strict();

export const seriesSchema = z
	.object({ ...termBaseSchema, seriesItems: z.string().array().optional() })
	.strict();
