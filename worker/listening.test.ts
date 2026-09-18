import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
	path.join(import.meta.dirname, '../migrations-stats/0001-listens.sql'),
	'utf8',
);

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

	test('a missing salt throws rather than hashing against the literal `undefined`', async () => {
		await expect(
			handleListenReport(
				createRequest({ id: listenId, mixId: 'voyager', seconds: 300 }),
				createEnv(''),
			),
		).rejects.toThrow('IP_SALT');
	});
});
