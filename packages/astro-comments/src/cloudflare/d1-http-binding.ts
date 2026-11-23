import { z } from 'zod';

import type { D1Binding, D1Statement } from '#cloudflare/d1-store.ts';

export interface D1HttpOptions {
	accountId: string;
	apiToken: string;
	databaseId: string;
}

const queryResultSchema = z.object({
	meta: z.object({ changes: z.number() }).optional(),
	results: z.array(z.unknown()).optional(),
});

const queryResponseSchema = z.object({
	errors: z.array(z.object({ message: z.string() })),
	result: z.array(queryResultSchema).nullish(),
	success: z.boolean(),
});

// Network failures and 5xx only, so a caller can tell an outage from a bad token or query
export class D1UnavailableError extends Error {
	override name = 'D1UnavailableError';
}

// The API takes string parameters only; column affinity reads them back as numbers
export function createD1HttpBinding({ accountId, apiToken, databaseId }: D1HttpOptions): D1Binding {
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

	async function query(
		sql: string,
		values: Array<null | number | string>,
	): Promise<z.infer<typeof queryResultSchema>> {
		const body = JSON.stringify({ params: values.map((value) => toParameter(value)), sql });
		let response: Response;

		try {
			response = await fetch(url, {
				body,
				headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
				method: 'POST',
			});
		} catch (error) {
			throw new D1UnavailableError('D1 could not be reached', { cause: error });
		}

		if (response.status >= 500)
			throw new D1UnavailableError(`D1 answered ${String(response.status)}`);
		const parsed = queryResponseSchema.safeParse(await readJson(response));

		if (!parsed.success)
			throw new Error(`D1 answered ${String(response.status)} with no query result`);

		const [result] = parsed.data.result ?? [];

		if (!result || !parsed.data.success) {
			const messages = parsed.data.errors.map((error) => error.message).join('; ');

			throw new Error(`D1 refused the query (${String(response.status)}): ${messages}`);
		}

		return result;
	}

	function statement(sql: string, values: Array<null | number | string> = []): D1Statement {
		return {
			async all() {
				const { results = [] } = await query(sql, values);

				return { results };
			},
			bind: (...bound) => statement(sql, bound),
			async first() {
				const { results = [] } = await query(sql, values);

				// eslint-disable-next-line unicorn/no-null -- D1's `first()` answers `null` for no row
				return results[0] ?? null;
			},
			async run() {
				const { meta } = await query(sql, values);

				return { meta: { changes: meta?.changes ?? 0 } };
			},
		};
	}

	return { prepare: (sql) => statement(sql) };
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function toParameter(value: null | number | string): string {
	if (value === null) throw new Error('D1 over HTTP cannot bind a SQL NULL');

	return String(value);
}
