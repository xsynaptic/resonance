import type { CollectionEntry, CollectionKey } from 'astro:content';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';
import type { termCollectionData } from '#lib/collections/terms/term-data.ts';

type CollectionDataEntry<F extends () => Promise<{ entries: Array<unknown> }>> = Awaited<
	ReturnType<F>
>['entries'][number];

export type ComputedEntry<K extends CollectionKey> = K extends TermCollectionKey
	? CollectionDataEntry<(typeof termCollectionData)[K]>
	: CollectionEntry<K>;
