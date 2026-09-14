// Stands in for `astro:content`, which has no module outside the Astro build; wired in by the vitest alias

export interface StubEntry {
	body?: string;
	collection: string;
	data: Record<string, unknown>;
	id: string;
}

const collections = new Map<string, Array<StubEntry>>();

export function getCollection(collection: string): Promise<Array<StubEntry>> {
	return Promise.resolve(collections.get(collection) ?? []);
}

export async function getEntries(
	references: Array<{ collection: string; id: string }>,
): Promise<Array<StubEntry>> {
	const entries = await Promise.all(
		references.map((reference) => getEntry(reference.collection, reference.id)),
	);

	return entries.filter((entry) => entry !== undefined);
}

export async function getEntry(collection: string, id: string): Promise<StubEntry | undefined> {
	const entries = await getCollection(collection);

	return entries.find((entry) => entry.id === id);
}

// Enough of a marker to prove a selection rendered the entry's body rather than its own description
export function render(entry: StubEntry): Promise<{ Content: string }> {
	return Promise.resolve({ Content: `body:${entry.id}` });
}

export function setCollections(next: Record<string, Array<Omit<StubEntry, 'collection'>>>): void {
	collections.clear();

	for (const [collection, entries] of Object.entries(next)) {
		collections.set(
			collection,
			entries.map((entry) => ({ ...entry, collection })),
		);
	}
}
