// The eyebrow on each card, and the set of collections that get one at all
// `downloads` is absent by design: it is a stats loader with no titles and no pages
// Pages get no eyebrow; "Page" tells a reader nothing the title does not
const COLLECTION_LABELS = {
	artists: 'Artist',
	eras: 'Era',
	formats: 'Format',
	labels: 'Label',
	mixes: 'Mix',
	pages: undefined,
	posts: 'Blog',
	regions: 'Region',
	reviews: 'Review',
	series: 'Series',
	styles: 'Style',
	topics: 'Topic',
} satisfies Record<string, string | undefined>;

export const OPEN_GRAPH_COLLECTIONS = Object.keys(COLLECTION_LABELS);

export function getCollectionLabel(collection: string): string | undefined {
	return COLLECTION_LABELS[collection as keyof typeof COLLECTION_LABELS];
}
