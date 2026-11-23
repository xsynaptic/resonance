import type { CommentMessages } from '@xsynaptic/astro-comments';

import { handleCommentSubmission } from '@xsynaptic/astro-comments';
import {
	createAssetsThreadResolver,
	createD1CommentStore,
	createTurnstileChallenge,
} from '@xsynaptic/astro-comments/cloudflare';

import { t } from '#lib/i18n/i18n-strings.ts';

const commentMessages = {
	challenge: t('comments.error.challenge'),
	closed: t('comments.error.closed'),
	invalid: t('comments.error.invalid'),
	parentMissing: t('comments.error.parentMissing'),
	threadMissing: t('comments.error.entryMissing'),
	tooFast: t('comments.error.tooFast'),
	tooLarge: t('comments.error.tooLarge'),
	unexpected: t('comments.error.unexpected'),
	unreadable: t('comments.error.unreadable'),
} satisfies Partial<CommentMessages>;

export function handleComment(request: Request, env: Env): Promise<Response> {
	return handleCommentSubmission(request, {
		challenge: createTurnstileChallenge(env.TURNSTILE_SECRET_KEY),
		getClientIp: (incoming) => incoming.headers.get('CF-Connecting-IP') ?? undefined,
		ipSalt: env.IP_SALT,
		messages: commentMessages,
		resolveThread: createAssetsThreadResolver(env.ASSETS, '/comment-threads.json'),
		store: createD1CommentStore(env.DB),
	});
}
