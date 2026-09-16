import { z } from 'zod';

import { sha256 } from '#worker/sha256.ts';

// A total is idempotent, so the body stays small enough that anything longer is not one of ours
const maximumBodyCharacters = 1024;

const reportSchema = z.strictObject({
	id: z.uuid(),
	mixId: z
		.string()
		.max(200)
		.regex(/^[a-z0-9-]+$/),
	seconds: z.number().int().min(1).max(86_400),
});

type Report = z.infer<typeof reportSchema>;

// The update reads `?5` rather than `excluded.heard_seconds`, which holds the value clipped to 360 for an
// insert and would cap every listen there
const upsertListen = `
INSERT INTO listens (id, mix_id, day, started_at, updated_at, heard_seconds, visitor)
SELECT ?1, ?2, ?3, ?4 - MIN(?5, 360), ?4, MIN(?5, 360), ?6
WHERE (?5 >= 30 AND (SELECT COUNT(*) FROM listens WHERE visitor = ?6 AND day = ?3) < 50)
   OR EXISTS (SELECT 1 FROM listens WHERE id = ?1)
ON CONFLICT (id) DO UPDATE SET
  heard_seconds = MAX(heard_seconds, MIN(?5, excluded.updated_at - started_at + 60)),
  updated_at    = excluded.updated_at
WHERE listens.mix_id = excluded.mix_id`;

// Every outcome answers 204: a beacon has no reader for an error, and a probe learns nothing from one
export async function handleListenReport(request: Request, env: Env): Promise<Response> {
	// A falsy salt hashes every visitor against the literal string `undefined`, which is brute-forceable
	if (!env.IP_SALT) throw new Error('IP_SALT is not set');

	if (request.headers.get('sec-fetch-site') !== 'same-origin') return noContent();

	const body = await request.text();

	if (body.length > maximumBodyCharacters) return noContent();

	const report = readReport(body);

	if (!report) return noContent();

	const remoteIp = request.headers.get('CF-Connecting-IP');

	if (!remoteIp) return noContent();

	const now = Math.floor(Date.now() / 1000);
	const day = new Date(now * 1000).toISOString().slice(0, 10);
	// The day is mixed in so a visitor's digest changes daily; only the daily cap reads it
	const visitor = await sha256(
		`${env.IP_SALT}${day}${remoteIp}${request.headers.get('user-agent') ?? ''}`,
	);

	await env.STATS.prepare(upsertListen)
		.bind(report.id, report.mixId, day, now, report.seconds, visitor)
		.run();

	return noContent();
}

function noContent(): Response {
	return new Response(undefined, { status: 204 });
}

function readReport(body: string): Report | undefined {
	try {
		const parsed = reportSchema.safeParse(JSON.parse(body));

		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}
