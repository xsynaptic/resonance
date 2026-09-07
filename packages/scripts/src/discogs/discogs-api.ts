import { z } from 'zod';

const apiBaseUrl = 'https://api.discogs.com';

// Discogs rejects a request carrying no descriptive User-Agent, or a default library one
const userAgent = 'ResonanceTracklists/1.0 +https://djbasilisk.com';

const requestTimeout = 15_000;

// Measured against `x-discogs-ratelimit`: the consumer key and secret raise the ceiling from 25/min to 60
const unauthenticatedInterval = 2600;
const authenticatedInterval = 1100;

let nextRequestAt = 0;

// `join` is the separator that follows this credit ("&", ",", "Feat."), empty on the last one
const ArtistCreditSchema = z.object({
	join: z.string().default(''),
	name: z.string(),
});

// `type_` separates a real track from a vinyl side `heading`; `position` and `duration` go missing
const TrackSchema = z.object({
	artists: ArtistCreditSchema.array().optional(),
	duration: z.string().default(''),
	position: z.string().default(''),
	title: z.string().default(''),
	type_: z.string().default('track'),
});

const ReleaseSchema = z.object({
	artists: ArtistCreditSchema.array().default([]),
	id: z.number(),
	tracklist: TrackSchema.array().default([]),
});

export type DiscogsArtistCredit = z.infer<typeof ArtistCreditSchema>;
export type DiscogsRelease = z.infer<typeof ReleaseSchema>;
export type DiscogsTrack = z.infer<typeof TrackSchema>;

export async function fetchRelease(releaseId: number): Promise<DiscogsRelease> {
	await awaitSlot();

	const credentials = toCredentials();
	const url = `${apiBaseUrl}/releases/${String(releaseId)}`;
	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			'User-Agent': userAgent,
			...(credentials ? { Authorization: credentials } : {}),
		},
		signal: AbortSignal.timeout(requestTimeout),
	});

	if (!response.ok) throw new Error(`Discogs returned ${String(response.status)} for ${url}`);

	return ReleaseSchema.parse(await response.json());
}

async function awaitSlot(): Promise<void> {
	const waitFor = nextRequestAt - Date.now();

	if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));

	nextRequestAt = Date.now() + (toCredentials() ? authenticatedInterval : unauthenticatedInterval);
}

// Reading a release needs the app's key and secret only; OAuth 1.0a is for acting as a user
function toCredentials(): string | undefined {
	const key = process.env.DISCOGS_CONSUMER_KEY;
	const secret = process.env.DISCOGS_CONSUMER_SECRET;

	if (!key || !secret) return undefined;

	return `Discogs key=${key}, secret=${secret}`;
}
