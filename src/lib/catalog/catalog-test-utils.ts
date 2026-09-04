import type {
	ContentCatalogItem,
	ContentCollectionKey,
	TermCatalogItem,
	TermCollectionKey,
} from '#lib/catalog/catalog-types.ts';

export function makeContentItem(
	overrides: Partial<ContentCatalogItem> & Pick<ContentCatalogItem, 'id'>,
): ContentCatalogItem {
	const collection: ContentCollectionKey = overrides.collection ?? 'mixes';

	return {
		collection,
		date: new Date('2020-01-01'),
		title: overrides.id,
		url: `/${collection}/${overrides.id}/`,
		...overrides,
	};
}

export function makeTermItem(
	overrides: Partial<TermCatalogItem> & Pick<TermCatalogItem, 'id'>,
): TermCatalogItem {
	const collection: TermCollectionKey = overrides.collection ?? 'artists';

	return {
		collection,
		title: overrides.id,
		url: `/${collection}/${overrides.id}/`,
		...overrides,
	};
}
