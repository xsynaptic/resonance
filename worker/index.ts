import { t } from '#lib/i18n/i18n-strings.ts';

import { fail, handleCommentSubmission } from './comments.ts';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/api/comments') {
			try {
				return await handleCommentSubmission(request, env);
			} catch {
				// Without this a D1 or siteverify failure answers with Cloudflare's generic error page
				return fail(request, 500, t('comments.error.unexpected'));
			}
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
