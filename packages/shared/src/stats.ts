import { z } from 'zod';

import type { D1CommandOptions } from '#d1.ts';

import { runD1Command } from '#d1.ts';

export const statsDatabaseName = 'resonance-stats';

// The pull and the site both parse with this, so their shapes cannot drift
export const listensSnapshotSchema = z.object({
	pulledAt: z.iso.datetime(),
	rows: z
		.object({
			day: z.string(),
			listens: z.number().int().nonnegative(),
			mix_id: z.string(),
			seconds: z.number().int().nonnegative(),
		})
		.array(),
});

export type ListensRow = ListensSnapshot['rows'][number];

export type ListensSnapshot = z.infer<typeof listensSnapshotSchema>;

export async function queryStats<Row>(
	sql: string,
	options: D1CommandOptions = {},
): Promise<Array<Row>> {
	const results = await runD1Command<Row>(statsDatabaseName, sql, options);

	return results.flatMap((result) => result.results);
}
