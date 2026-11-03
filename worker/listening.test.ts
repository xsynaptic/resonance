import { fc, test } from '@fast-check/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { handleListenReport } from '#worker/listening.ts';

interface ListenRow {
	day: string;
	heard_seconds: number;
	id: string;
	mix_id: string;
	started_at: number;
	updated_at: number;
	visitor: string;
}

// A `URL` here would be the Workers one, which Node's `readFileSync` does not accept
const migration = readFileSync(
	path.join(import.meta.dirname, '../migrations/stats/0001-listens.sql'),
	'utf8',
);

// SHA-256 of `test-salt2026-09-16198.51.100.7test-agent`, computed outside this suite
const visitorDigest = 'bf0c7a38da97567a9219f12bf3dfc8e5d3276dcdeb7ba82c94f63cfb833c2e36';
const visitorDigestWithoutAgent =
	'bade776ed2907f3ebec617354fb7d45cf1d516c5dd62ff301aa8dba33b06df37';

const defaultHeaders: Record<string, string> = {
	'cf-connecting-ip': '198.51.100.7',
	'sec-fetch-site': 'same-origin',
	'user-agent': 'test-agent',
};

let database: DatabaseSync;

beforeEach(() => {
	database = new DatabaseSync(':memory:');
	database.exec(migration);
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
	database.close();
});

function createEnv(salt = 'test-salt'): Env {
	return { IP_SALT: salt, STATS: createStatsBinding() } as unknown as Env;
}

function createRequest(body: unknown, overrides: Record<string, string | undefined> = {}): Request {
	const headers = new Headers(defaultHeaders);

	for (const [name, value] of Object.entries(overrides)) {
		if (value === undefined) headers.delete(name);
		else headers.set(name, value);
	}

	return new Request('https://example.test/api/listen', {
		body: typeof body === 'string' ? body : JSON.stringify(body),
		headers,
		method: 'POST',
	});
}

// The guards live in SQL, so the tests drive a real SQLite through the shape D1 presents
function createStatsBinding() {
	return {
		prepare: (sql: string) => {
			const statement = database.prepare(sql);

			return {
				bind: (...values: Array<number | string>) => ({
					all: () => Promise.resolve({ results: statement.all(...values) }),
					first: () => Promise.resolve(statement.get(...values) ?? undefined),
					run: () => {
						const { changes } = statement.run(...values);

						return Promise.resolve({ meta: { rows_written: Number(changes) }, success: true });
					},
				}),
			};
		},
	};
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function post(
	body: unknown,
	overrides: Record<string, string | undefined> = {},
): Promise<Response> {
	return handleListenReport(createRequest(body, overrides), createEnv());
}

function rows(): Array<ListenRow> {
	return database.prepare('SELECT * FROM listens ORDER BY id').all() as unknown as Array<ListenRow>;
}

function toListenId(index: number): string {
	return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

const listenId = toListenId(1);

describe('handleListenReport', () => {
	test('a same-origin report opens one listen, back-dated by the seconds it carries', async () => {
		const response = await post({ id: listenId, mixId: 'voyager', seconds: 300 });
		const [row] = rows();

		expect(response.status).toBe(204);
		expect(row?.mix_id).toBe('voyager');
		expect(row?.heard_seconds).toBe(300);
		expect(row?.started_at).toBe(nowSeconds() - 300);
		expect(row?.updated_at).toBe(nowSeconds());
		expect(row?.day).toBe('2026-09-16');
	});

	test('the row keeps the larger total, capped by how long the listen has been open', async () => {
		await post({ id: listenId, mixId: 'voyager', seconds: 300 });

		vi.advanceTimersByTime(300_000);
		await post({ id: listenId, mixId: 'voyager', seconds: 600 });

		expect(rows()[0]?.heard_seconds).toBe(600);

		await post({ id: listenId, mixId: 'voyager', seconds: 600 });

		expect(rows()[0]?.heard_seconds).toBe(600);

		vi.advanceTimersByTime(10_000);
		await post({ id: listenId, mixId: 'voyager', seconds: 5000 });

		expect(rows()[0]?.heard_seconds).toBe(670);

		await post({ id: listenId, mixId: 'voyager', seconds: 300 });

		expect(rows()[0]?.heard_seconds).toBe(670);
	});

	test('a first report under 30 s writes nothing, and an enormous one starts clipped', async () => {
		await post({ id: listenId, mixId: 'voyager', seconds: 20 });

		expect(rows()).toHaveLength(0);

		await post({ id: listenId, mixId: 'voyager', seconds: 86_400 });

		expect(rows()[0]?.heard_seconds).toBe(360);
	});

	test('the 51st new listen of a day writes nothing, while the first still updates', async () => {
		for (let index = 0; index < 50; index += 1) {
			await post({ id: toListenId(index), mixId: 'voyager', seconds: 60 });
		}

		expect(rows()).toHaveLength(50);

		await post({ id: toListenId(50), mixId: 'voyager', seconds: 60 });

		expect(rows()).toHaveLength(50);

		vi.advanceTimersByTime(120_000);
		await post({ id: toListenId(0), mixId: 'voyager', seconds: 120 });

		const first = rows().find((row) => row.id === toListenId(0));

		expect(first?.heard_seconds).toBe(120);
	});

	test('a listen id cannot move to another mix, and survives a change of network', async () => {
		await post({ id: listenId, mixId: 'voyager', seconds: 300 });
		vi.advanceTimersByTime(60_000);

		await post({ id: listenId, mixId: 'uroboros', seconds: 600 });

		expect(rows()).toHaveLength(1);
		expect(rows()[0]?.heard_seconds).toBe(300);

		await post(
			{ id: listenId, mixId: 'voyager', seconds: 360 },
			{ 'cf-connecting-ip': '203.0.113.9' },
		);

		expect(rows()[0]?.heard_seconds).toBe(360);
	});

	test('anything but a same-origin beacon with a client IP writes nothing', async () => {
		const report = { id: listenId, mixId: 'voyager', seconds: 300 };

		for (const overrides of [
			{ 'sec-fetch-site': undefined },
			{ 'sec-fetch-site': 'cross-site' },
			{ 'cf-connecting-ip': undefined },
		]) {
			const response = await post(report, overrides);

			expect(response.status).toBe(204);
		}

		expect(rows()).toHaveLength(0);
	});

	test('an oversized, malformed or padded body writes nothing', async () => {
		const bodies = [
			JSON.stringify({ id: listenId, mixId: 'voyager', padding: 'x'.repeat(1024), seconds: 300 }),
			'{',
			JSON.stringify({ extra: 1, id: listenId, mixId: 'voyager', seconds: 300 }),
		];

		for (const body of bodies) {
			const response = await post(body);

			expect(response.status).toBe(204);
		}

		expect(rows()).toHaveLength(0);
	});

	test('the visitor is a digest of the salt, the day, the client IP and the user agent', async () => {
		await post({ id: listenId, mixId: 'voyager', seconds: 300 });

		expect(rows()[0]?.visitor).toBe(visitorDigest);

		await post({ id: toListenId(2), mixId: 'voyager', seconds: 300 }, { 'user-agent': undefined });

		expect(rows().find((row) => row.id === toListenId(2))?.visitor).toBe(visitorDigestWithoutAgent);
	});

	test('a missing salt throws rather than hashing against the literal `undefined`', async () => {
		await expect(
			handleListenReport(
				createRequest({ id: listenId, mixId: 'voyager', seconds: 300 }),
				createEnv(''),
			),
		).rejects.toThrow('IP_SALT');
	});
});

interface ListenReport {
	clockStepSeconds: number;
	ip: string;
	listen: number;
	mixId: string;
	seconds: number;
}

interface OpenedListen {
	claimedSeconds: number;
	mixId: string;
	openedAt: number;
	openingSeconds: number;
}

// Assumes the Worker's clock never goes backwards between reports; only Cloudflare's clock sync guarantees that
const forwardClockStep = fc.integer({ max: 400, min: 0 });

// Few listen ids and visitors, so reports often land on the same row but never reach the daily cap
const anyListenReports = fc.array(
	fc.record({
		clockStepSeconds: forwardClockStep,
		ip: fc.constantFrom('198.51.100.7', '203.0.113.9'),
		listen: fc.integer({ max: 3, min: 0 }),
		mixId: fc.oneof(
			{ arbitrary: fc.constant('voyager'), weight: 4 },
			{ arbitrary: fc.constant('uroboros'), weight: 1 },
		),
		seconds: fc.oneof(
			fc.integer({ max: 40, min: 1 }),
			fc.integer({ max: 400, min: 340 }),
			fc.integer({ max: 86_400, min: 1 }),
		),
	}),
	{ maxLength: 30, minLength: 1 },
);

// An honest client never reports more listening than the time that passed, though a beacon can be resent or arrive late
const honestListenReports = fc
	.tuple(
		fc.integer({ max: 360, min: 30 }),
		fc.array(
			fc.record({
				clockStepSeconds: forwardClockStep,
				heardShare: fc.double({ max: 1, min: 0, noNaN: true }),
				isResent: fc.boolean(),
			}),
			{ maxLength: 20 },
		),
	)
	.map(([openingSeconds, later]) => {
		const totals = [openingSeconds];
		const reports: Array<ListenReport> = [
			{
				clockStepSeconds: 0,
				ip: '198.51.100.7',
				listen: 0,
				mixId: 'voyager',
				seconds: openingSeconds,
			},
		];

		for (const { clockStepSeconds, heardShare, isResent } of later) {
			const latest = totals.at(-1) ?? openingSeconds;
			const seconds = isResent
				? (totals[Math.floor(heardShare * totals.length)] ?? latest)
				: Math.min(86_400, latest + Math.floor(heardShare * clockStepSeconds));

			if (!isResent) totals.push(seconds);
			reports.push({ clockStepSeconds, ip: '198.51.100.7', listen: 0, mixId: 'voyager', seconds });
		}

		return reports;
	});

// Starts ten minutes before midnight so some runs span two days
const startOfRun = new Date('2026-09-16T23:50:00Z').getTime();

async function sendReports(
	reports: Array<ListenReport>,
	onStored: (
		report: ListenReport,
		before: ListenRow | undefined,
		after: ListenRow | undefined,
	) => void,
): Promise<void> {
	database.exec('DELETE FROM listens');

	let now = startOfRun;

	for (const report of reports) {
		const id = toListenId(report.listen);
		const before = rows().find((row) => row.id === id);

		now += report.clockStepSeconds * 1000;
		vi.setSystemTime(now);
		await post(
			{ id, mixId: report.mixId, seconds: report.seconds },
			{ 'cf-connecting-ip': report.ip },
		);

		onStored(
			report,
			before,
			rows().find((row) => row.id === id),
		);
	}
}

describe('handleListenReport over any sequence of reports', () => {
	test.prop([anyListenReports])(
		'a listen opens on 30 s, keeps its mix, never falls, and never outruns its clock or its claims',
		async (reports) => {
			const opened = new Map<number, OpenedListen>();

			await sendReports(reports, (report, before, after) => {
				if (!before) {
					expect(after !== undefined).toBe(report.seconds >= 30);
					if (after) {
						expect(after.heard_seconds).toBe(Math.min(report.seconds, 360));
						opened.set(report.listen, {
							claimedSeconds: report.seconds,
							mixId: report.mixId,
							openedAt: nowSeconds(),
							openingSeconds: report.seconds,
						});
					}

					return;
				}

				const listen = opened.get(report.listen);

				if (!after || !listen) throw new Error('A stored listen disappeared');
				if (report.mixId === listen.mixId) {
					listen.claimedSeconds = Math.max(listen.claimedSeconds, report.seconds);
				}

				expect(after.mix_id).toBe(listen.mixId);
				expect(after.heard_seconds).toBeGreaterThanOrEqual(before.heard_seconds);
				expect(after.heard_seconds).toBeLessThanOrEqual(listen.claimedSeconds);
				expect(after.heard_seconds).toBeLessThanOrEqual(
					nowSeconds() - listen.openedAt + Math.min(listen.openingSeconds, 360) + 60,
				);
			});
		},
	);

	test.prop([honestListenReports])(
		'an honest listen stores the largest total it has reported, resent or late beacons included',
		async (reports) => {
			let largest = 0;

			await sendReports(reports, (report, _before, after) => {
				largest = Math.max(largest, report.seconds);

				expect(after?.heard_seconds).toBe(largest);
			});
		},
	);
});
