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
	data: Record<string, unknown>;
	digest?: string;
	id: string;
}

// Astro >= 7.1 writes a `data-store/` directory instead when experimental `collectionStorage` is on
const DATA_STORE_CHUNKED_DIR = 'data-store';

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
