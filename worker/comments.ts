import type { CommentMessages } from '@xsynaptic/astro-comments';

import { handleCommentSubmission } from '@xsynaptic/astro-comments';

import { t } from '#lib/i18n/i18n-strings.ts';
import { createD1CommentStore } from '#worker/comments-store.ts';
import { createTurnstileChallenge } from '#worker/turnstile.ts';

const threadPattern = /^(?<collection>mixes|posts|reviews)\/(?<entryId>[a-z0-9-]+)$/;

const commentMessages = {
	challenge: t('comments.error.challenge'),
	invalid: t('comments.error.invalid'),
	parentMissing: t('comments.error.parentMissing'),
	threadMissing: t('comments.error.entryMissing'),
	tooFast: t('comments.error.tooFast'),
	tooLarge: t('comments.error.tooLarge'),
	unexpected: t('comments.error.unexpected'),
	unreadable: t('comments.error.unreadable'),
} satisfies CommentMessages;

export function handleComment(request: Request, env: Env): Promise<Response> {
	return handleCommentSubmission(request, {
		challenge: createTurnstileChallenge(env.TURNSTILE_SECRET_KEY),
		getClientIp: (incoming) => incoming.headers.get('CF-Connecting-IP') ?? undefined,
		ipSalt: env.IP_SALT,
		messages: commentMessages,
		// The built pages are the thread registry: a thread exists when its entry's page does
		resolveThread: async (thread, incoming): Promise<string | undefined> => {
			const entryPath = toEntryPath(thread);

			if (entryPath === undefined) return undefined;

			const page = await env.ASSETS.fetch(new URL(entryPath, incoming.url));

			return page.ok ? entryPath : undefined;
		},
		store: createD1CommentStore(env.DB),
	});
}

// Posts render at the site root, matching `getContentUrl`, which pulls in Astro and cannot be imported here
function toEntryPath(thread: string): string | undefined {
	const groups = threadPattern.exec(thread)?.groups;

	if (!groups?.collection || !groups.entryId) return undefined;

	return groups.collection === 'posts'
		? `/${groups.entryId}/`
		: `/${groups.collection}/${groups.entryId}/`;
}
