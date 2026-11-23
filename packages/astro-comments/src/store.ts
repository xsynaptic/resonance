import { z } from 'zod';

import type { ApprovedComment } from '#schemas.ts';

import { approvedCommentSchema } from '#schemas.ts';

export const commentStatuses = ['approved', 'pending', 'rejected', 'spam'] as const;

export type CommentStatus = (typeof commentStatuses)[number];

export interface CommentStore {
	findApprovedParent: (parentId: string) => Promise<string | undefined>;
	insert: (comment: NewComment) => Promise<void>;
}

export interface CommentModerationStore {
	deleteComment: (id: string) => Promise<StoredComment | undefined>;
	getComment: (id: string) => Promise<StoredComment | undefined>;
	listApproved: () => Promise<Array<ApprovedComment>>;
	listPending: () => Promise<Array<StoredComment>>;
	setOwner: (ids: Array<string>, isOwner: boolean) => Promise<number>;
	setStatus: (ids: Array<string>, status: CommentStatus) => Promise<number>;
}

// Stored as `pending` from the `web` source; the store supplies both
export interface NewComment {
	author: string;
	authorEmail?: string;
	authorUrl?: string;
	body: string;
	createdAt: number;
	emailHash?: string;
	id: string;
	ipHash?: string;
	parentId?: string;
	thread: string;
}

export const storedCommentSchema = approvedCommentSchema.omit({ emailHash: true }).extend({
	authorEmail: z.string().optional(),
	source: z.string(),
	status: z.enum(commentStatuses),
});

export type StoredComment = z.infer<typeof storedCommentSchema>;
