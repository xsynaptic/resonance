// Plain `fetch`: nothing in `package.json` handles SoundCloud's OAuth and the surface is three requests

import { z } from 'zod';

const apiBaseUrl = 'https://api.soundcloud.com';
const tokenUrl = 'https://secure.soundcloud.com/oauth/token';

// SoundCloud rejects a request that omits the charset
const acceptHeader = 'application/json; charset=utf-8';

const pageLimit = 200;
const requestTimeout = 15_000;

const CountSchema = z.number().int().nonnegative().default(0);

// Narrow by design: everything else the Track object carries is User Content we must not persist
// `permalink_url` is the join key, so a track without one cannot be matched and is skipped
// `urn` is the stable id, which survives a permalink rename; `id` is the same number unprefixed
const TrackSchema = z.object({
	comment_count: CountSchema,
	favoritings_count: CountSchema,
	permalink_url: z.string(),
	playback_count: CountSchema,
	reposts_count: CountSchema,
	urn: z.string(),
});

export type SoundcloudTrack = z.infer<typeof TrackSchema>;

const TrackPageSchema = z.object({
	collection: z.unknown().array(),
	next_href: z.string().nullish(),
});

const TokenSchema = z.object({ access_token: z.string() });

// `/resolve` answers 302 with the canonical resource URL, whose last segment is the account's URN
const ResolveSchema = z.object({ location: z.string() });

// One token per run, then left to expire; rotating single-use refresh tokens needs durable atomic writes
export async function fetchAccessToken(clientId: string, clientSecret: string): Promise<string> {
	const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

	// For this grant SoundCloud rejects credentials in the body, so they go in the header only
	const response = await fetch(tokenUrl, {
		body: 'grant_type=client_credentials',
		headers: {
			Accept: acceptHeader,
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		method: 'POST',
		signal: AbortSignal.timeout(requestTimeout),
	});

	await assertOk(response, tokenUrl);

	return TokenSchema.parse(await response.json()).access_token;
}

// A track missing its join key is named and dropped rather than stored under a key nothing matches
export async function fetchAccountTracks(
	accessToken: string,
	accountUrn: string,
): Promise<Array<SoundcloudTrack>> {
	const tracks: Array<SoundcloudTrack> = [];

	let nextUrl: string | undefined =
		`${apiBaseUrl}/users/${accountUrn}/tracks?limit=${String(pageLimit)}&linked_partitioning=true`;

	while (nextUrl) {
		const response = await fetch(nextUrl, {
			headers: toAuthHeaders(accessToken),
			signal: AbortSignal.timeout(requestTimeout),
		});

		await assertOk(response, nextUrl);

		const page = TrackPageSchema.parse(await response.json());

		for (const item of page.collection) {
			const track = TrackSchema.safeParse(item);

			if (track.success) tracks.push(track.data);
			else console.warn(`  Skipping an unreadable track: ${track.error.issues[0]?.message ?? ''}`);
		}

		nextUrl = page.next_href ?? undefined;
	}

	return tracks;
}

export async function resolveAccountUrn(accessToken: string, account: string): Promise<string> {
	const url = `${apiBaseUrl}/resolve?url=${encodeURIComponent(`https://soundcloud.com/${account}`)}`;

	// `redirect: 'manual'` keeps the 302 body, which is the whole answer; following it costs a request
	const response = await fetch(url, {
		headers: toAuthHeaders(accessToken),
		redirect: 'manual',
		signal: AbortSignal.timeout(requestTimeout),
	});

	if (response.status !== 302) await assertOk(response, url);

	const { location } = ResolveSchema.parse(await response.json());
	const urn = location.split('/').at(-1);

	if (!urn) throw new Error(`Unreadable resolve location for ${account}: ${location}`);

	return urn;
}

// A 429 body carries `rate_limit` and `reset_time`, and both belong in the log verbatim
async function assertOk(response: Response, url: string): Promise<void> {
	if (response.ok) return;

	let body = '';

	try {
		body = await response.text();
	} catch {
		// A body that will not read changes nothing; the status is the error
	}

	throw new Error(
		`SoundCloud returned ${String(response.status)} for ${url}: ${body.slice(0, 300)}`,
	);
}

function toAuthHeaders(accessToken: string) {
	return { Accept: acceptHeader, Authorization: `OAuth ${accessToken}` };
}
