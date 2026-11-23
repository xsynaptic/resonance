import { z } from 'zod';

// Path-safe segments joined by single slashes, so a site may build a URL from a key without `..` or a stray host
export const threadKeyPattern = /^[\w-]+(?:\/[\w-]+)*$/;

export const maximumThreadKeyLength = 200;

// What a build may render; a store's private columns stay out
export const approvedCommentSchema = z.object({
	author: z.string(),
	authorUrl: z.string().optional(),
	body: z.string(),
	createdAt: z.number(),
	emailHash: z.string().optional(),
	id: z.string(),
	isOwner: z.boolean(),
	parentId: z.string().optional(),
	thread: z.string(),
});

export type ApprovedComment = z.infer<typeof approvedCommentSchema>;
