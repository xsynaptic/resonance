import { fail, handleCommentSubmission } from './comments.ts';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/api/comments') {
			try {
				return await handleCommentSubmission(request, env);
			} catch {
				// Without this a D1 or siteverify failure answers with Cloudflare's generic error page
				return fail(request, 500, 'Something went wrong here. Please try again in a moment.');
			}
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
