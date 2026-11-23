import { handleComment } from '#worker/comments.ts';
import { handleListenReport } from '#worker/listening.ts';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// The handler answers every method and every failure itself, so nothing falls through to the 404 page
		if (url.pathname === '/api/comments') return handleComment(request, env);

		if (url.pathname === '/api/listen') {
			// `run_worker_first` routes every method here, so anything but POST would answer with the 404 page
			if (request.method !== 'POST')
				return new Response(undefined, { headers: { allow: 'POST' }, status: 405 });

			try {
				return await handleListenReport(request, env);
			} catch (error) {
				console.error(error);

				// A beacon has no reader for the failure, so the report is simply lost
				return new Response(undefined, { status: 204 });
			}
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
