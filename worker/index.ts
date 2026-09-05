import { t } from '#lib/i18n/i18n-strings.ts';
import { fail, handleCommentSubmission } from '#worker/comments.ts';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === '/api/comments') {
			// `run_worker_first` routes every method here, so anything but POST would answer with the 404 page
			if (request.method !== 'POST')
				return new Response(undefined, { headers: { allow: 'POST' }, status: 405 });

			try {
				return await handleCommentSubmission(request, env);
			} catch (error) {
				console.error(error);

				// Without this a D1 or siteverify failure answers with Cloudflare's generic error page
				return fail(request, 500, t('comments.error.unexpected'));
			}
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
