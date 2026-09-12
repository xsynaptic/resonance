// The eyebrow on each card, and the set of collections that get one at all
// `downloads` is absent by design: it is a stats loader with no titles and no pages
// Pages get no eyebrow; "Page" tells a reader nothing the title does not
const collectionLabels = {
	artists: 'Artist',
	eras: 'Era',
	labels: 'Label',
	mixes: 'Mix',
	pages: undefined,
	posts: 'Posts',
	regions: 'Region',
	reviews: 'Review',
	series: 'Series',
	styles: 'Style',
	themes: 'Theme',
} satisfies Record<string, string | undefined>;

// `Object.keys` widens to `string`, and the keys have to stay collection names for the content read
export const openGraphCollections = Object.keys(collectionLabels) as Array<
	keyof typeof collectionLabels
>;

export function getCollectionLabel(collection: string): string | undefined {
	return collectionLabels[collection as keyof typeof collectionLabels];
}
