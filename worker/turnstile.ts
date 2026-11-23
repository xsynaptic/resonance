import type { CommentChallenge } from '@xsynaptic/astro-comments';

const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const turnstileTokenField = 'cf-turnstile-response';

export function createTurnstileChallenge(secretKey: string): CommentChallenge {
	return {
		tokenField: turnstileTokenField,
		async verify(token, remoteIp) {
			const body = new FormData();

			body.append('secret', secretKey);
			body.append('response', token);

			if (remoteIp) body.append('remoteip', remoteIp);

			const response = await fetch(siteverifyUrl, { body, method: 'POST' });

			// An outage is a 500, not a visitor who failed the challenge
			if (!response.ok) throw new Error(`Turnstile siteverify answered ${String(response.status)}`);

			return isSuccess(await response.json());
		},
	};
}

function isSuccess(result: unknown): boolean {
	return (
		typeof result === 'object' && result !== null && 'success' in result && result.success === true
	);
}
