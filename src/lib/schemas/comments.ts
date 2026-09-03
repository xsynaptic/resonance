import { z } from 'zod';

// One store entry per `collection/entry_id`, built from D1 rows; nulls stay explicit, as the row has them
const commentSchema = z
	.object({
		author: z.string().min(1),
		authorUrl: z.string().nullable(),
		body: z.string(),
		date: z.coerce.date(),
		gravatarHash: z.string().nullable(),
		id: z.string().min(1),
		parentId: z.string().nullable(),
	})
	.strict();

export type CommentValue = z.infer<typeof commentSchema>;

export const commentsSchema = z
	.object({
		collection: z.enum(['mixes', 'posts', 'reviews']),
		comments: commentSchema.array(),
		entryId: z.string().min(1),
	})
	.strict();
