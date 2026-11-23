import { z } from 'zod';

import type { CommentMessages } from '#messages.ts';
import type { CommentStore, NewComment } from '#store.ts';

import { commentFields } from '#fields.ts';
import { defaultMessages } from '#messages.ts';
import { maximumThreadKeyLength, threadKeyPattern } from '#schemas.ts';
import { sha256 } from '#sha256.ts';

export interface CommentChallenge {
	tokenField: string;
	verify: (token: string, remoteIp: string | undefined) => Promise<boolean>;
}

export interface CommentSubmissionConfig {
	challenge: CommentChallenge;
	getClientIp: (request: Request) => string | undefined;
	ipSalt: string;
	messages?: Partial<CommentMessages>;
	// The thread's page path on this site, or `undefined` when the thread does not exist
	resolveThread: (thread: string, request: Request) => Promise<string | undefined>;
	store: CommentStore;
}

type Submission = Omit<z.infer<typeof submissionSchema>, 'challengeToken'> & {
	challengeToken: string;
};

// The form is rendered into a static page, so the client sets this on load; a build-time value would always pass
const minimumFormAgeMs = 3000;

// `request.formData()` parses the whole body before the schema's 8000-character cap can apply
const maximumBodyBytes = 32_768;

// Ids are read back as the `#comment-<id>` permalink, so they stay short; 32 chars masks to 5 bits with no bias
const commentIdAlphabet = 'abcdefghijklmnopqrstuvwxyz234567';
const commentIdLength = 10;

const submissionSchema = z.object({
	author: z.string().min(1).max(80),
	authorEmail: z.email().max(200).optional(),
	authorUrl: z.httpUrl().max(200).optional(),
	body: z.string().min(2).max(8000),
	challengeToken: z.string().max(2048).optional(),
	parentId: z.string().min(1).max(200).optional(),
	renderedAt: z.coerce.number().int().positive(),
	thread: z.string().max(maximumThreadKeyLength).regex(threadKeyPattern),
});

export async function handleCommentSubmission(
	request: Request,
	config: CommentSubmissionConfig,
): Promise<Response> {
	// A mount without this would read a GET's missing body as an oversized one
	if (request.method !== 'POST') {
		return new Response(undefined, { headers: { allow: 'POST' }, status: 405 });
	}

	const messages = { ...defaultMessages, ...config.messages };

	try {
		return await processSubmission(request, config, messages);
	} catch (error) {
		console.error(error);

		return reject(request, 500, messages.unexpected);
	}
}

// The native form post reads the redirect; the client asks for JSON so it can stay on the page
function accept(request: Request, threadUrl: URL): Response {
	if (isJsonWanted(request)) return new Response(undefined, { status: 201 });

	return Response.redirect(threadUrl.href, 303);
}

function createCommentId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(commentIdLength));

	return [...bytes].map((byte) => commentIdAlphabet.charAt(byte & 31)).join('');
}

// A missing header rejects too: a body of unknown size cannot be capped before it is parsed
function isBodySizeAcceptable(request: Request): boolean {
	const contentLength = Number(request.headers.get('content-length'));

	return (
		Number.isSafeInteger(contentLength) && contentLength > 0 && contentLength <= maximumBodyBytes
	);
}

function isJsonWanted(request: Request): boolean {
	return request.headers.get('accept')?.includes('application/json') === true;
}

// A parent under a former key of the same page still counts, so a renamed entry's old comments stay answerable
async function isValidParent(
	submission: Submission,
	threadPath: string,
	{ config, request }: { config: CommentSubmissionConfig; request: Request },
): Promise<boolean> {
	if (submission.parentId === undefined) return true;

	const parentThread = await config.store.findApprovedParent(submission.parentId);

	if (parentThread === undefined) return false;

	if (parentThread === submission.thread) return true;

	return (await config.resolveThread(parentThread, request)) === threadPath;
}

async function processSubmission(
	request: Request,
	config: CommentSubmissionConfig,
	messages: CommentMessages,
): Promise<Response> {
	// A falsy salt hashes every IP against a constant, which is brute-forceable
	if (!config.ipSalt) throw new Error('The comment IP salt is not set');

	const submission = await readSubmission(request, config.challenge.tokenField, messages);

	if (submission instanceof Response) return submission;

	const threadPath = await config.resolveThread(submission.thread, request);

	if (threadPath === undefined) return reject(request, 400, messages.threadMissing);

	const threadUrl = toThreadUrl(threadPath, request);

	if (!(await isValidParent(submission, threadPath, { config, request })))
		return reject(request, 400, messages.parentMissing);

	const remoteIp = config.getClientIp(request);

	// Last, after the local checks: a challenge may be a network round trip, and a rejected request burns a single-use token
	if (!(await config.challenge.verify(submission.challengeToken, remoteIp))) {
		return reject(request, 403, messages.challenge);
	}

	await config.store.insert(await toNewComment(submission, remoteIp, config.ipSalt));

	return accept(request, threadUrl);
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

// The local rejections, in their deliberate order: size, honeypot, schema, form age, then a missing token, all before any network call
async function readSubmission(
	request: Request,
	challengeField: string,
	messages: CommentMessages,
): Promise<Response | Submission> {
	if (!isBodySizeAcceptable(request)) return reject(request, 413, messages.tooLarge);

	const form = await readFormData(request);

	if (!form) return reject(request, 400, messages.unreadable);

	// Answered as `invalid`, so a bot cannot tell the trap from a schema failure
	if (readField(form, commentFields.honeypot) !== undefined)
		return reject(request, 400, messages.invalid);

	const parsed = submissionSchema.safeParse({
		author: readField(form, commentFields.author),
		authorEmail: readField(form, commentFields.authorEmail),
		authorUrl: readField(form, commentFields.authorUrl),
		body: readField(form, commentFields.body),
		challengeToken: readField(form, challengeField),
		parentId: readField(form, commentFields.parentId),
		renderedAt: readField(form, commentFields.renderedAt),
		thread: readField(form, commentFields.thread),
	});

	if (!parsed.success) return reject(request, 400, messages.invalid);

	if (Date.now() - parsed.data.renderedAt < minimumFormAgeMs)
		return reject(request, 400, messages.tooFast);

	const { challengeToken, ...fields } = parsed.data;

	// Usually a widget that never finished or never loaded, which the challenge message explains better than `invalid`
	if (challengeToken === undefined) return reject(request, 403, messages.challenge);

	return { ...fields, challengeToken };
}

// The client asks for JSON so it can render the message inline; the native form post still gets the text page
function reject(request: Request, status: number, message: string): Response {
	if (isJsonWanted(request)) return Response.json({ message }, { status });

	return new Response(`${message}\n`, {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
		status,
	});
}

async function toNewComment(
	submission: Submission,
	remoteIp: string | undefined,
	ipSalt: string,
): Promise<NewComment> {
	const comment: NewComment = {
		author: submission.author,
		body: submission.body,
		createdAt: Math.floor(Date.now() / 1000),
		id: createCommentId(),
		thread: submission.thread,
	};

	if (submission.authorEmail !== undefined) {
		comment.authorEmail = submission.authorEmail;
		comment.emailHash = await sha256(submission.authorEmail.toLowerCase());
	}

	if (submission.authorUrl !== undefined) comment.authorUrl = submission.authorUrl;

	if (submission.parentId !== undefined) comment.parentId = submission.parentId;

	if (remoteIp) comment.ipHash = await sha256(`${ipSalt}${remoteIp}`);

	return comment;
}

// Checked before the insert, since a resolver answering `//host` would turn the 303 into an open redirect
function toThreadUrl(threadPath: string, request: Request): URL {
	const origin = new URL(request.url).origin;
	const url = new URL(threadPath, origin);

	if (!threadPath.startsWith('/') || url.origin !== origin) {
		throw new Error(`resolveThread answered "${threadPath}", which is not a path on this site`);
	}

	url.searchParams.set('comment', 'received');
	url.hash = 'comments';

	return url;
}
