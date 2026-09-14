import { z } from 'zod';

import { TitleSchema } from '#lib/schemas/index.ts';

export const stationSchema = z
	.object({
		id: z.string(),
		imageFeatured: z.string().optional(),
		position: z.number().int().default(0),
		stationItems: z.string().array().min(1),
		title: TitleSchema,
	})
	.strict();
