import { handleCommentSubmission } from './comments.ts';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/api/comments') {
			return handleCommentSubmission(request, env);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
