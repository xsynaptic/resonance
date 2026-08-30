/**
 * Reads Astro's data store outside the Astro runtime, so build scripts can see content collections.
 * Astro serializes with `devalue`, so parsing has to match.
 *
 * @see https://github.com/withastro/astro/blob/main/packages/astro/src/content/mutable-data-store.ts
 */
import * as devalue from 'devalue';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type DataStoreCollections = Map<string, Map<string, DataStoreEntry>>;

// Only the fields build scripts read; the store carries rendered HTML and asset imports besides
export interface DataStoreEntry {
	body?: string;
	data: Record<string, unknown>;
	digest?: string;
	filePath?: string;
	id: string;
}

// Astro >= 7.1 writes a `data-store/` directory instead when experimental `collectionStorage` is on
const DATA_STORE_CHUNKED_DIR = 'data-store';

export function getDataStoreCollection(
	collections: DataStoreCollections,
	names: Array<string>,
): Array<DataStoreEntry> {
	const entries: Array<DataStoreEntry> = [];

	for (const name of names) {
		const collection = collections.get(name);

		if (!collection) throw new Error(`Unknown collection: "${name}"`);

		entries.push(...collection.values());
	}

	return entries;
}

export function loadDataStore(dataStorePath: string): DataStoreCollections {
	if (!existsSync(dataStorePath)) {
		const chunkedPath = path.join(path.dirname(dataStorePath), DATA_STORE_CHUNKED_DIR);

		if (existsSync(chunkedPath)) {
			throw new Error(
				`Found the chunked data store at ${chunkedPath}. Experimental \`collectionStorage\` is on and this reader only handles the single-file layout; port the chunked branch from spectralcodex.`,
			);
		}

		throw new Error(`Data store not found at ${dataStorePath}. Run \`astro sync\` first.`);
	}

	return devalue.parse(readFileSync(dataStorePath, 'utf8')) as DataStoreCollections;
}

// Free text in the polymorphic artist and label refs is a bare string, carrying no id to collect
// A scalar is accepted alongside an array because a track's `artists` is written either way
export function toReferenceIds(value: unknown): Array<string> {
	const values: Array<unknown> = Array.isArray(value) ? (value as Array<unknown>) : [value];

	const ids: Array<string> = [];

	for (const item of values) {
		if (item === null || typeof item !== 'object') continue;

		const { id } = item as { id?: unknown };

		if (typeof id === 'string') ids.push(id);
	}

	return ids;
}
