// Never fatal: a missing file is normal locally, and an unreadable one warns once and renders no counts

import type { ListensSnapshot } from '@xsynaptic/shared/stats';

import { listensSnapshotSchema } from '@xsynaptic/shared/stats';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pMemoize from 'p-memoize';

import { listensStatsPath } from '#constants.ts';

export interface ListenStats {
	listens: number;
	seconds: number;
}

const getTotals = pMemoize(buildListenStats);

export async function getListenStats(mixId: string): Promise<ListenStats> {
	const totals = await getTotals();

	return totals.get(mixId) ?? { listens: 0, seconds: 0 };
}

async function buildListenStats(): Promise<Map<string, ListenStats>> {
	const filePath = path.resolve(listensStatsPath);

	if (!existsSync(filePath)) return new Map();

	const snapshot = await readSnapshot(filePath);

	if (!snapshot) {
		console.warn(`No readable snapshot in ${listensStatsPath}; building without listen counts`);

		return new Map();
	}

	const totals = new Map<string, ListenStats>();

	for (const row of snapshot.rows) {
		const total = totals.get(row.mix_id) ?? { listens: 0, seconds: 0 };

		total.listens += row.listens;
		total.seconds += row.seconds;
		totals.set(row.mix_id, total);
	}

	return totals;
}

async function readSnapshot(filePath: string): Promise<ListensSnapshot | undefined> {
	try {
		return listensSnapshotSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
	} catch {
		return undefined;
	}
}
