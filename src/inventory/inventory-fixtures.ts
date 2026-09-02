import { getCollection, render } from 'astro:content';

import type { ContentItem } from '#lib/catalog/catalog-data.ts';
import type { TrackValue } from '#lib/schemas/audio.ts';
import type { SelectionValue } from '#lib/schemas/selections.ts';
import type { IconId } from '#lib/utils/icon-types.ts';
import type { ResolvedRef, TitledCollectionKey } from '#lib/utils/terms.ts';

import { getContentItems } from '#lib/catalog/catalog-data.ts';
import { getDownloadCounts } from '#lib/collections/downloads/downloads-data.ts';
import { hasMixTimestamps } from '#lib/collections/mixes/mixes-cue.ts';
import { getDirectoryTerms } from '#lib/collections/terms/term-tree.ts';
import { splitReleaseTitle } from '#lib/utils/entries.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { getContentUrl } from '#lib/utils/routing.ts';
import { resolveRefs } from '#lib/utils/terms.ts';

// The inventory's one seam onto real content, so the page itself is only imports and prop-passing
// Everything is found by predicate rather than named by slug: re-running the extractor cannot break it
// A specimen whose content has vanished renders empty, which is the honest signal

interface ExcerptSample {
	Content: Awaited<ReturnType<typeof render>>['Content'];
	date: Date;
	href: string;
	title: string;
}

interface MixSample {
	cueSlug?: string | undefined;
	files: Array<string>;
	links: Array<string>;
	title: string;
	tracks: Array<TrackValue>;
}

interface ReleaseSample {
	artist?: ResolvedRef | undefined;
	date: Date;
	image?: string | undefined;
	labels: Array<ResolvedRef>;
	releaseTitle: string;
	releaseYear?: string | undefined;
	title: string;
}

// Hand-kept mirror of the symbols in components/main/main-sprites.astro, which nothing else needs to enumerate
const iconIds: Array<IconId> = [
	'chevron-down',
	'chevron-left',
	'chevron-right',
	'chevron-up',
	'download',
	'magnifying-glass',
	'mixcloud',
	'soundcloud',
	'youtube',
];

export async function getInventoryFixtures() {
	const [mixItems, reviewItems] = await Promise.all([
		getContentItems('mixes'),
		getContentItems('reviews'),
	]);

	const [vocabulary, formats, labels, styles, themes] = await Promise.all([
		sampleTerms('artists'),
		sampleTerms('formats', 1),
		sampleTerms('labels', 4),
		sampleTerms('styles', 3),
		sampleTerms('themes', 4),
	]);

	return {
		artists: vocabulary.slice(0, 8),
		card: cardItem([...mixItems, ...reviewItems]),
		downloadCounts: await getDownloadCounts(),
		excerpt: await sampleExcerpt(),
		formats,
		heroPath: await sampleHeroPath(),
		iconIds,
		imagePaths: await sampleImagePaths(4),
		labels,
		mix: await sampleMix(),
		mixcloudUrl: await sampleMixField('mixcloudEmbed'),
		mixItems,
		regionTree: await getDirectoryTerms('regions'),
		release: await sampleRelease(),
		reviewItems,
		selections: await sampleSelections(9),
		soundcloudUrl: await sampleMixField('soundcloudEmbed'),
		styles,
		themes,
		vocabulary,
	};
}

// The card specimens are about the card, so pick one whose artwork is actually on disk
function cardItem(items: Array<ContentItem>): ContentItem | undefined {
	return items.find((item) => item.image !== undefined && getMediaImage(item.image) !== undefined);
}

async function sampleExcerpt(): Promise<ExcerptSample | undefined> {
	const posts = await getCollection('posts');
	const entry = posts.find((post) => (post.body?.trim().length ?? 0) > 400) ?? posts.at(0);
	if (!entry) return undefined;

	const { Content } = await render(entry);

	return {
		Content,
		date: entry.data.dateCreated,
		href: getContentUrl('posts', entry.id),
		title: entry.data.title,
	};
}

// Mixes only carry square cover art, which the band's 4/3 crop guts
async function sampleHeroPath(): Promise<string | undefined> {
	for (const collection of ['posts', 'pages', 'series'] as const) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			const path = entry.data.imageHero;
			if (path !== undefined && getMediaImage(path)) return path;
		}
	}

	return undefined;
}

// Originals are gitignored, so collect the paths that resolve rather than naming any
async function sampleImagePaths(limit: number): Promise<Array<string>> {
	const mixes = await getCollection('mixes');
	const paths: Array<string> = [];

	for (const entry of mixes) {
		const path = entry.data.imageHero ?? entry.data.imageFeatured;
		if (path !== undefined && !paths.includes(path) && getMediaImage(path)) paths.push(path);
		if (paths.length === limit) break;
	}

	return paths;
}

// Timestamped tracks are what light up both the cue-sheet pairing and the track-list time column
async function sampleMix(): Promise<MixSample | undefined> {
	const mixes = await getCollection('mixes');
	const entry =
		mixes.find((mix) => hasMixTimestamps(mix) && (mix.data.files?.length ?? 0) > 0) ??
		mixes.find((mix) => (mix.data.tracks?.length ?? 0) > 0);
	if (!entry) return undefined;

	return {
		cueSlug: hasMixTimestamps(entry) ? entry.id : undefined,
		files: entry.data.files ?? [],
		links: entry.data.links ?? [],
		title: entry.data.title,
		tracks: entry.data.tracks ?? [],
	};
}

async function sampleMixField(
	field: 'mixcloudEmbed' | 'soundcloudEmbed',
): Promise<string | undefined> {
	const mixes = await getCollection('mixes');

	return mixes.find((mix) => mix.data[field] !== undefined)?.data[field];
}

// A review carries the fullest detail header there is: split title, artist, labels, year and rating
async function sampleRelease(): Promise<ReleaseSample | undefined> {
	const reviews = await getCollection('reviews');
	const entry =
		reviews.find(
			(review) =>
				review.data.releaseTitle !== undefined &&
				(review.data.labels?.length ?? 0) > 0 &&
				review.data.imageFeatured !== undefined &&
				getMediaImage(review.data.imageFeatured) !== undefined,
		) ?? reviews.at(0);
	if (!entry) return undefined;

	const artists = await resolveRefs('artists', entry.data.artists);
	const { artist, title } = splitReleaseTitle(entry.data.title, entry.data.releaseTitle, artists);

	return {
		artist,
		date: entry.data.dateCreated,
		image: entry.data.imageFeatured,
		labels: await resolveRefs('labels', entry.data.labels),
		releaseTitle: title,
		releaseYear: entry.data.releaseYear,
		title: entry.data.title,
	};
}

// Each order variant gets its own slice of these, so no selection anchor id is emitted twice
async function sampleSelections(count: number): Promise<Array<SelectionValue>> {
	const posts = await getCollection('posts');
	const entry =
		posts.find((post) => (post.data.selections?.length ?? 0) >= count) ??
		posts.find((post) => (post.data.selections?.length ?? 0) > 0);

	return entry?.data.selections?.slice(0, count) ?? [];
}

// Unlimited where a specimen needs the whole vocabulary, as TermDirectory does to reach its threshold
async function sampleTerms(
	collection: TitledCollectionKey,
	limit?: number,
): Promise<Array<ResolvedRef>> {
	const entries = await getCollection(collection);
	const terms = entries
		.map((entry) => ({ label: entry.data.title, url: getContentUrl(collection, entry.id) }))
		.sort((first, second) => first.label.localeCompare(second.label));

	return limit === undefined ? terms : terms.slice(0, limit);
}
