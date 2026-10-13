import { createSqliteCache } from '@xsynaptic/shared/cache';
import { sqliteCachePath } from '@xsynaptic/shared/constants';

import type { DescribableEntry } from '#lib/utils/description.ts';

import { createEntryDescriptionFunction } from '#lib/utils/description.ts';

let entryDescriptionFunction: ReturnType<typeof createEntryDescriptionFunction> | undefined;

export function getEntryDescription(entry: DescribableEntry) {
	if (!entryDescriptionFunction) {
		entryDescriptionFunction = createEntryDescriptionFunction({
			cache: createSqliteCache(sqliteCachePath, 'entry-descriptions'),
		});
	}
	return entryDescriptionFunction(entry);
}
