import { getCollection } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';
import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { CreditValue, LabelCreditValue } from '#lib/schemas/credits.ts';
import type { LinkableEntry } from '#lib/utils/entries.ts';

import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { getTermHierarchy } from '#lib/collections/terms/hierarchy.ts';
import { getSlugs, toCreditArray } from '#lib/utils/terms.ts';
import { toSlug } from '#lib/utils/text.ts';
import { toFlatTracks } from '#lib/utils/track-groups.ts';

interface CreditSlugs {
	artists: Map<string, string>;
	labels: Map<string, string>;
}

interface ListedRow {
	artists?: Array<CreditValue> | CreditValue | undefined;
	labels?: Array<LabelCreditValue> | undefined;
	mixArtists?: Array<CreditValue> | CreditValue | undefined;
}

interface RelatedContext {
	ancestors: Map<string, ReadonlyArray<string>>;
	items: Map<string, ContentCatalogItem>;
	profiles: Map<string, RelatedProfile>;
	rarity: Map<string, number>;
}

interface RelatedProfile {
	collection: LinkableEntry['collection'];
	dateCreated: Date;
	id: string;
	references: Set<string>;
	terms: Map<string, number>;
	year: number | undefined;
}

interface Scored {
	candidate: RelatedProfile;
	score: number;
}

type Vocabulary = 'artists' | 'eras' | 'labels' | 'regions' | 'styles' | 'themes';

const signalWeights = {
	artistsAuthored: 3,
	artistsListed: 1,
	eras: 1,
	labelsAuthored: 1.5,
	labelsListed: 0.5,
	regions: 1,
	styles: 3,
	themes: 2,
} as const;

const ancestorShare = 0.4;
const referenceWeight = 20;
const sameCollectionMultiplier = 1.5;

// One shared common Era or Region scores under this, so "Related" never rests on it alone
const relatedThreshold = 3;

// Three screens of a 4-up carousel
const relatedLimit = 12;

const relatedCollections = ['mixes', 'posts', 'reviews'] as const;

const hierarchicalVocabularies = [
	'eras',
	'labels',
	'regions',
	'styles',
] as const satisfies ReadonlyArray<HierarchicalCollection>;

const linkPattern = /<Link\s+id="([^"]+)"/gu;

let contextPromise: Promise<RelatedContext> | undefined;

export async function getRelatedItems(id: string): Promise<Array<ContentCatalogItem>> {
	const context = await getRelatedContext();
	const entry = context.profiles.get(id);

	if (!entry) return [];

	return [...context.profiles.values()]
		.filter((candidate) => candidate.id !== id)
		.map((candidate) => ({ candidate, score: scoreCandidate(entry, candidate, context) }))
		.filter((scored) => scored.score >= relatedThreshold)
		.sort(byScoreThenNearness(entry))
		.slice(0, relatedLimit)
		.map((scored) => context.items.get(scored.candidate.id))
		.filter((item) => item !== undefined);
}

function ancestorScore(
	descendant: RelatedProfile,
	other: RelatedProfile,
	context: RelatedContext,
): number {
	let score = 0;

	for (const [key, weight] of descendant.terms) {
		if (other.terms.has(key)) continue;

		const ancestorKey = context.ancestors.get(key)?.find((ancestor) => other.terms.has(ancestor));

		// An ancestor both sides carry was already counted by `sharedScore`
		if (ancestorKey === undefined || descendant.terms.has(ancestorKey)) continue;

		const otherWeight = other.terms.get(ancestorKey) ?? 0;

		score += ancestorShare * Math.max(weight, otherWeight) * rarityOf(context, ancestorKey);
	}

	return score;
}

// A mix's alias is the site's own persona on nearly every mix, so it would join them all
function authoredArtists(entry: LinkableEntry): Array<CreditValue> {
	if (entry.collection === 'mixes') return [];

	return entry.data.artists ?? [];
}

async function buildRelatedContext(): Promise<RelatedContext> {
	const [catalog, collections, artists, labels, ancestors] = await Promise.all([
		getCatalog(),
		Promise.all(relatedCollections.map((collection) => getCollection(collection))),
		getSlugs('artists'),
		getSlugs('labels'),
		collectAncestors(),
	]);

	const profiles = collections.flat().map((entry) => toProfile(entry, { artists, labels }));
	const items = catalog.byCollection(...relatedCollections);

	return {
		ancestors,
		items: new Map(items.map((item) => [item.id, item] as const)),
		profiles: new Map(profiles.map((profile) => [profile.id, profile] as const)),
		rarity: measureRarity(profiles),
	};
}

function byScoreThenNearness(entry: RelatedProfile) {
	return (first: Scored, second: Scored) =>
		second.score - first.score ||
		yearDistance(entry, first.candidate) - yearDistance(entry, second.candidate) ||
		second.candidate.dateCreated.getTime() - first.candidate.dateCreated.getTime();
}

async function collectAncestors(): Promise<Map<string, ReadonlyArray<string>>> {
	const hierarchies = await Promise.all(
		hierarchicalVocabularies.map(async (vocabulary) => ({
			hierarchy: await getTermHierarchy(vocabulary),
			vocabulary,
		})),
	);

	const ancestors = new Map<string, ReadonlyArray<string>>();

	for (const { hierarchy, vocabulary } of hierarchies) {
		for (const id of hierarchy.ordinalById.keys()) {
			const keys = hierarchy.ancestorsOf(id).map((ancestorId) => termKey(vocabulary, ancestorId));

			ancestors.set(termKey(vocabulary, id), keys);
		}
	}

	return ancestors;
}

// A Term's id never names a candidate, since catalog ids are unique across collections
function collectReferences(entry: LinkableEntry): Set<string> {
	const body = entry.body ?? '';
	const linked = Array.from(body.matchAll(linkPattern), (match) => match[1]);
	const selected =
		entry.collection === 'posts'
			? (entry.data.selections ?? []).map((selection) => selection.entryId)
			: [];

	return new Set([...linked, ...selected].filter((id) => id !== undefined));
}

function collectTerms(entry: LinkableEntry, slugs: CreditSlugs): Map<string, number> {
	const { data } = entry;
	const listed = listedRows(entry);
	const terms = new Map<string, number>();

	function add(keys: Array<string>, weight: number) {
		for (const key of keys) terms.set(key, Math.max(weight, terms.get(key) ?? 0));
	}

	add(referenceKeys('styles', data.styles), signalWeights.styles);
	add(referenceKeys('eras', data.eras), signalWeights.eras);
	add(referenceKeys('regions', data.regions), signalWeights.regions);
	add(referenceKeys('themes', data.themes), signalWeights.themes);
	add(creditKeys('artists', authoredArtists(entry), slugs), signalWeights.artistsAuthored);
	add(creditKeys('labels', data.labels ?? [], slugs), signalWeights.labelsAuthored);
	add(creditKeys('artists', listed.flatMap(rowArtists), slugs), signalWeights.artistsListed);
	add(
		creditKeys(
			'labels',
			listed.flatMap((row) => row.labels ?? []),
			slugs,
		),
		signalWeights.labelsListed,
	);

	return terms;
}

function creditKeys(
	vocabulary: keyof CreditSlugs,
	credits: Array<CreditValue>,
	slugs: CreditSlugs,
): Array<string> {
	return credits
		.map((credit) =>
			typeof credit === 'string' ? freeTextId(credit, slugs[vocabulary]) : credit.id,
		)
		.filter((id) => id !== '')
		.map((id) => termKey(vocabulary, id));
}

// Free text takes a cataloged Term's id when its name matches, as `resolveCredits` links it
function freeTextId(name: string, slugs: Map<string, string>): string {
	const slug = toSlug(name);

	return slugs.get(slug) ?? slug;
}

function getRelatedContext(): Promise<RelatedContext> {
	if (!contextPromise) contextPromise = buildRelatedContext();

	return contextPromise;
}

// A roundup names its Releases in passing, as a tracklist does
function listedRows(entry: LinkableEntry): Array<ListedRow> {
	if (entry.collection === 'posts') return entry.data.selections ?? [];

	return toFlatTracks(entry.data.tracks);
}

function measureRarity(profiles: Array<RelatedProfile>): Map<string, number> {
	const counts = new Map<string, number>();

	for (const profile of profiles) {
		for (const key of profile.terms.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return new Map(
		[...counts].map(([key, count]) => [key, Math.log(1 + profiles.length / count)] as const),
	);
}

// A Review's music can predate its writing by years; a Mix or Post belongs to the year it went up
function musicYear(entry: LinkableEntry): number | undefined {
	if (entry.collection !== 'reviews') return entry.data.dateCreated.getUTCFullYear();

	const year = Number(entry.data.releaseYear);

	return Number.isSafeInteger(year) ? year : undefined;
}

function rarityOf(context: RelatedContext, key: string): number {
	return context.rarity.get(key) ?? 0;
}

function referenceKeys(
	vocabulary: Vocabulary,
	references: Array<{ id: string }> | undefined,
): Array<string> {
	return (references ?? []).map((reference) => termKey(vocabulary, reference.id));
}

function rowArtists(row: ListedRow): Array<CreditValue> {
	return [...toCreditArray(row.artists), ...toCreditArray(row.mixArtists)];
}

function scoreCandidate(
	entry: RelatedProfile,
	candidate: RelatedProfile,
	context: RelatedContext,
): number {
	let score =
		sharedScore(entry, candidate, context) +
		ancestorScore(entry, candidate, context) +
		ancestorScore(candidate, entry, context);

	if (entry.references.has(candidate.id) || candidate.references.has(entry.id)) {
		score += referenceWeight;
	}

	return entry.collection === candidate.collection ? score * sameCollectionMultiplier : score;
}

function sharedScore(
	entry: RelatedProfile,
	candidate: RelatedProfile,
	context: RelatedContext,
): number {
	let score = 0;

	for (const [key, weight] of entry.terms) {
		const candidateWeight = candidate.terms.get(key);

		if (candidateWeight === undefined) continue;

		score += Math.max(weight, candidateWeight) * rarityOf(context, key);
	}

	return score;
}

function termKey(vocabulary: Vocabulary, id: string): string {
	return `${vocabulary}:${id}`;
}

function toProfile(entry: LinkableEntry, slugs: CreditSlugs): RelatedProfile {
	return {
		collection: entry.collection,
		dateCreated: entry.data.dateCreated,
		id: entry.id,
		references: collectReferences(entry),
		terms: collectTerms(entry, slugs),
		year: musicYear(entry),
	};
}

function yearDistance(entry: RelatedProfile, candidate: RelatedProfile): number {
	if (entry.year === undefined || candidate.year === undefined) return Number.MAX_SAFE_INTEGER;

	return Math.abs(entry.year - candidate.year);
}
