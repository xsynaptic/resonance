import type { CommentMessages, ThreadResolver } from '@xsynaptic/astro-comments';

import { createThreadResolver, handleCommentSubmission } from '@xsynaptic/astro-comments';
import {
	createD1CommentStore,
	createTurnstileChallenge,
} from '@xsynaptic/astro-comments/cloudflare';

import { t } from '#lib/i18n/i18n-strings.ts';

const threadRegistryPath = '/comment-threads.json';

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

const resolvers = new WeakMap<Env['ASSETS'], ThreadResolver>();

export function handleComment(request: Request, env: Env): Promise<Response> {
	return handleCommentSubmission(request, {
		challenge: createTurnstileChallenge(env.TURNSTILE_SECRET_KEY),
		getClientIp: (incoming) => incoming.headers.get('CF-Connecting-IP') ?? undefined,
		ipSalt: env.IP_SALT,
		messages: commentMessages,
		resolveThread: (thread, incoming) => getThreadResolver(env.ASSETS, incoming.url)(thread),
		store: createD1CommentStore(env.DB),
	});
}

// Once per isolate: the registry only changes with a deploy, which starts new isolates
function getThreadResolver(assets: Env['ASSETS'], requestUrl: string): ThreadResolver {
	const existing = resolvers.get(assets);

	if (existing) return existing;

	const resolver = createThreadResolver(async () => {
		const response = await assets.fetch(new URL(threadRegistryPath, requestUrl));

		if (!response.ok) throw new Error(`The thread registry answered ${String(response.status)}`);

		return response.json();
	});

	resolvers.set(assets, resolver);

	return resolver;
}
