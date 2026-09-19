import { getContentPath } from '@xsynaptic/shared/routing';
import { getCollection } from 'astro:content';

import type { TitledCollectionKey } from '#lib/utils/terms.ts';

import { getTermHierarchy, isHierarchical } from '#lib/collections/terms/hierarchy.ts';

// `sortKey` is set only where alphabetical order is wrong for the vocabulary; see `getEraSortKey`
export interface DirectoryTerm {
	children?: Array<DirectoryTerm>;
	id: string;
	sortKey?: string;
	title: string;
	url: string;
}

const eraPhaseRank: Record<string, string> = { early: '1', late: '3', mid: '2' };

export async function getDirectoryTerms(
	collection: TitledCollectionKey,
): Promise<Array<DirectoryTerm>> {
	const entries = await getCollection(collection);

	const toTerm = (id: string, title: string): DirectoryTerm => {
		const sortKey = collection === 'eras' ? getEraSortKey(id) : undefined;

		return {
			id,
			title,
			url: getContentPath(collection, id),
			...(sortKey === undefined ? {} : { sortKey }),
		};
	};

	if (!isHierarchical(collection)) {
		return entries.map((entry) => toTerm(entry.id, entry.data.title));
	}

	const hierarchy = await getTermHierarchy(collection);
	const titlesById = new Map(entries.map((entry) => [entry.id, entry.data.title]));

	function buildTerm(id: string): DirectoryTerm {
		const children = hierarchy.childrenOf(id).map((childId) => buildTerm(childId));

		return {
			...toTerm(id, titlesById.get(id) ?? id),
			...(children.length > 0 ? { children } : {}),
		};
	}

	return hierarchy.roots.map((id) => buildTerm(id));
}

function getEraSortKey(id: string): string {
	const [phase, ...rest] = id.split('-');
	const rank = phase === undefined ? undefined : eraPhaseRank[phase];

	return rank === undefined ? `${id}-0` : `${rest.join('-')}-${rank}`;
}
