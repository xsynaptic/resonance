import { z } from 'zod';

// Path-safe segments joined by single slashes, so a site may build a URL from a key without `..` or a stray host
export const threadKeyPattern = /^[\w-]+(?:\/[\w-]+)*$/;

export const maximumThreadKeyLength = 200;

// What a build may render; a store's private columns stay out
export const approvedCommentSchema = z.object({
	author: z.string(),
	author_url: z.string().nullable(),
	body: z.string(),
	created_at: z.number(),
	gravatar_hash: z.string().nullable(),
	id: z.string(),
	parent_id: z.string().nullable(),
	thread: z.string(),
});

export type ApprovedComment = z.infer<typeof approvedCommentSchema>;
