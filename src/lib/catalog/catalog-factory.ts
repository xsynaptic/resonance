import type {
	CatalogCollectionKey,
	CatalogItem,
	CatalogItemOf,
} from '#lib/catalog/catalog-types.ts';

export interface Catalog {
	byCollection: <Collection extends CatalogCollectionKey>(
		...collections: Array<Collection>
	) => Array<CatalogItemOf<Collection>>;
	getById: (id: string) => CatalogItem | undefined;
}

export function createCatalog(items: ReadonlyArray<CatalogItem>): Catalog {
	const itemsById = new Map(items.map((item) => [item.id, item] as const));

	function byCollection<Collection extends CatalogCollectionKey>(
		...collections: Array<Collection>
	): Array<CatalogItemOf<Collection>> {
		const wanted = new Set<CatalogCollectionKey>(collections);

		// A runtime collection check cannot prove the conditional item type to the compiler
		return items.filter((item) => wanted.has(item.collection)) as Array<CatalogItemOf<Collection>>;
	}

	function getById(id: string) {
		return itemsById.get(id);
	}

	return { byCollection, getById };
}
