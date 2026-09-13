import type { CollectionEntry } from 'astro:content';

import { getContentPath } from '@xsynaptic/shared/routing';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';
import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { StringKey } from '#lib/i18n/i18n-strings.ts';
import type { LinkedName } from '#lib/utils/terms.ts';

import { getTermHierarchy, isHierarchical } from '#lib/collections/terms/hierarchy.ts';
import { getTermCollection } from '#lib/collections/terms/term-data.ts';
import { t } from '#lib/i18n/i18n-strings.ts';

export interface TermRelationGroup {
	heading: string;
	terms: Array<LinkedName>;
}

interface RelationConfig {
	children: StringKey;
	siblings?: StringKey;
}

const relationConfig = {
	eras: { children: 'terms.subEras' },
	labels: { children: 'terms.subLabels' },
	regions: { children: 'terms.subRegions', siblings: 'terms.otherRegions' },
	styles: { children: 'terms.subStyles', siblings: 'terms.otherStyles' },
} as const satisfies Record<HierarchicalCollection, RelationConfig>;

// A Term's children, and for styles and regions its siblings, ranked by how much content each holds
export async function getTermRelations(
	collection: TermCollectionKey,
	id: string,
): Promise<Array<TermRelationGroup>> {
	if (!isHierarchical(collection)) return [];

	const config: RelationConfig = relationConfig[collection];

	const [hierarchy, { entriesMap }] = await Promise.all([
		getTermHierarchy(collection),
		getTermCollection(collection),
	]);

	function toGroup(heading: StringKey, ids: ReadonlyArray<string>): TermRelationGroup {
		const terms = ids
			.map((termId) => entriesMap.get(termId))
			.filter((entry) => entry !== undefined)
			.filter((entry) => (entry.data._entryCount ?? 0) > 0)
			.sort(byEntryCount)
			.map((entry) => ({
				name: entry.data.title,
				url: getContentPath(collection, entry.id),
			}));

		return { heading: t(heading), terms };
	}

	const groups = [toGroup(config.children, hierarchy.childrenOf(id))];

	if (config.siblings) groups.push(toGroup(config.siblings, hierarchy.siblingsOf(id)));

	return groups.filter((group) => group.terms.length > 0);
}

function byEntryCount(
	first: CollectionEntry<TermCollectionKey>,
	second: CollectionEntry<TermCollectionKey>,
) {
	const difference = (second.data._entryCount ?? 0) - (first.data._entryCount ?? 0);

	return difference === 0 ? first.data.title.localeCompare(second.data.title) : difference;
}
