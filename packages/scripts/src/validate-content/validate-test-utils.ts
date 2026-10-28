import type { ContentEntry } from '@xsynaptic/astro-scripts';

export function makeEntry(
	overrides: Partial<ContentEntry> & Pick<ContentEntry, 'id'>,
): ContentEntry {
	return { collection: 'mixes', data: {}, ...overrides };
}
