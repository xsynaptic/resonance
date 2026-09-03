import { z } from 'zod';

const siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// The form is rendered into a static page, so the client sets this on load; a build-time value would always pass
const minimumFormAgeMs = 3000;

const entryIdPattern = /^[a-z0-9-]+$/;

// Ids are read back as the `#comment-<id>` permalink, so they stay short; 32 chars masks to 5 bits with no bias
const commentIdAlphabet = 'abcdefghijklmnopqrstuvwxyz234567';
const commentIdLength = 10;

const submissionSchema = z.object({
	author: z.string().min(1).max(80),
	authorEmail: z.email().max(200).optional(),
	authorUrl: z.httpUrl().max(200).optional(),
	body: z.string().min(2).max(8000),
	collection: z.enum(['mixes', 'posts', 'reviews']),
	entryId: z.string().max(200).regex(entryIdPattern),
	parentId: z.string().min(1).max(200).optional(),
	renderedAt: z.coerce.number().int().positive(),
	turnstileToken: z.string().min(1).max(2048),
});

type Submission = z.infer<typeof submissionSchema>;

// The client asks for JSON so it can render the message inline; the native form post still gets the text page
export function fail(request: Request, status: number, message: string): Response {
	if (isJsonWanted(request)) return Response.json({ message }, { status });

	return new Response(`${message}\n`, {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
		status,
	});
}

export async function handleCommentSubmission(request: Request, env: Env): Promise<Response> {
	const form = await readFormData(request);

	if (!form) return fail(request, 400, 'That submission could not be read.');

	if (readField(form, 'website') !== undefined)
		return fail(request, 400, 'That submission was not accepted.');

	const parsed = submissionSchema.safeParse({
		author: readField(form, 'author'),
		authorEmail: readField(form, 'authorEmail'),
		authorUrl: readField(form, 'authorUrl'),
		body: readField(form, 'body'),
		collection: readField(form, 'collection'),
		entryId: readField(form, 'entryId'),
		parentId: readField(form, 'parentId'),
		renderedAt: readField(form, 'renderedAt'),
		turnstileToken: readField(form, 'cf-turnstile-response'),
	});

	if (!parsed.success) return fail(request, 400, 'That submission was not valid.');

	const submission = parsed.data;

	if (Date.now() - submission.renderedAt < minimumFormAgeMs)
		return fail(request, 400, 'That was too fast. Please try again.');

	const entryPath = toEntryPath(submission.collection, submission.entryId);
	const entry = await env.ASSETS.fetch(new URL(entryPath, request.url));

	if (!entry.ok) return fail(request, 400, 'That entry does not exist.');

	if (!(await isValidParent(env, submission)))
		return fail(request, 400, 'That reply target does not exist.');

	const remoteIp = request.headers.get('CF-Connecting-IP');

	// Last, after the local checks: siteverify is a network round trip, and a rejected request burns a single-use token
	if (!(await isTurnstileValid(submission.turnstileToken, env.TURNSTILE_SECRET_KEY, remoteIp))) {
		return fail(request, 403, 'The challenge did not pass. Please reload the page and try again.');
	}

	await insertComment(env, submission, remoteIp);

	return succeed(request, entryPath);
}

function createCommentId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(commentIdLength));

	return [...bytes].map((byte) => commentIdAlphabet.charAt(byte & 31)).join('');
}

async function insertComment(
	env: Env,
	submission: Submission,
	remoteIp: null | string,
): Promise<void> {
	const gravatarHash = submission.authorEmail
		? await sha256(submission.authorEmail.toLowerCase())
		: undefined;
	const ipHash = remoteIp ? await sha256(`${env.IP_SALT}${remoteIp}`) : undefined;

	await env.DB.prepare(
		`INSERT INTO comments (id, collection, entry_id, parent_id, author, author_email, author_url, gravatar_hash, body, status, source, created_at, ip_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web', ?, ?)`,
	)
		.bind(
			createCommentId(),
			submission.collection,
			submission.entryId,
			toNullable(submission.parentId),
			submission.author,
			toNullable(submission.authorEmail),
			toNullable(submission.authorUrl),
			toNullable(gravatarHash),
			submission.body,
			Math.floor(Date.now() / 1000),
			toNullable(ipHash),
		)
		.run();
}

function isJsonWanted(request: Request): boolean {
	return request.headers.get('accept')?.includes('application/json') === true;
}

async function isTurnstileValid(
	token: string,
	secret: string,
	remoteIp: null | string,
): Promise<boolean> {
	const body = new FormData();

	body.append('secret', secret);
	body.append('response', token);

	if (remoteIp) body.append('remoteip', remoteIp);

	const response = await fetch(siteverifyUrl, { body, method: 'POST' });

	if (!response.ok) return false;

	const result = await response.json<{ success?: boolean }>();

	return result.success === true;
}

// Legacy `entry_id` is the slug at the time of writing, so a reply to a comment older than a rename cannot resolve here
async function isValidParent(env: Env, submission: Submission): Promise<boolean> {
	if (submission.parentId === undefined) return true;

	const parent = await env.DB.prepare(
		`SELECT id FROM comments WHERE id = ? AND collection = ? AND entry_id = ? AND status = 'approved'`,
	)
		.bind(submission.parentId, submission.collection, submission.entryId)
		.first();

	return parent !== null;
}

// Empty and whitespace-only fields read as absent, so an untouched optional input is not a validation error
function readField(form: FormData, name: string): string | undefined {
	const value = form.get(name);

	if (typeof value !== 'string') return undefined;

	const trimmed = value.trim();

	return trimmed === '' ? undefined : trimmed;
}

async function readFormData(request: Request): Promise<FormData | undefined> {
	try {
		return await request.formData();
	} catch {
		return undefined;
	}
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The native form post reads the redirect; the client asks for JSON so it can stay on the page
function succeed(request: Request, entryPath: string): Response {
	if (isJsonWanted(request)) {
		return Response.json(
			{ message: 'Your comment is in the moderation queue and will appear once it is approved.' },
			{ status: 201 },
		);
	}

	return Response.redirect(
		new URL(`${entryPath}?comment=received#comments`, request.url).href,
		303,
	);
}

// Posts render at the site root, matching `getContentUrl`; the worker cannot import from the Astro project
function toEntryPath(collection: Submission['collection'], entryId: string): string {
	return collection === 'posts' ? `/${entryId}/` : `/${collection}/${entryId}/`;
}

function toNullable(value: string | undefined): null | string {
	// eslint-disable-next-line unicorn/no-null -- D1 takes `null` for a SQL NULL; `undefined` is not a valid bound parameter
	return value ?? null;
}
