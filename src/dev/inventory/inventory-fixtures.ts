import type { OpenGraphEntry } from '@xsynaptic/scripts/og-image';
import type { CollectionEntry } from 'astro:content';

import {
	getOpenGraphIndexEntries,
	getStyleTitles,
	toOpenGraphEntry,
} from '@xsynaptic/scripts/og-image';
import { openGraphDefaultId, openGraphHomeId } from '@xsynaptic/shared/constants';
import { getCollection, render } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';
import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';
import type { TracklistValue } from '#lib/schemas/audio.ts';
import type { SelectionValue } from '#lib/schemas/selections.ts';
import type { IconId } from '#lib/utils/icon-types.ts';
import type { LinkedName, TitledCollectionKey } from '#lib/utils/terms.ts';

import { getPlayerLabels } from '#components/player/player-labels.ts';
import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { getDownloadCount } from '#lib/collections/downloads/downloads-data.ts';
import { hasMixTimestamps } from '#lib/collections/mixes/mixes-cue.ts';
import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { getDirectoryTerms } from '#lib/collections/terms/term-tree.ts';
import { getImageFeaturedId, getImageHeroId } from '#lib/image/image-featured.ts';
import { site } from '#lib/site.ts';
import { matchReleaseTitle, splitReleaseTitle } from '#lib/utils/entries.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { getContentPath } from '#lib/utils/routing.ts';
import { resolveCredits, resolveTermLinks } from '#lib/utils/terms.ts';

// The inventory's one seam onto real content, so the page itself is only imports and prop-passing
// Everything is found by predicate rather than named by slug, so editing content cannot break a specimen
// A specimen whose content has vanished renders empty, which is the honest signal

interface ExcerptSample {
	Content: Awaited<ReturnType<typeof render>>['Content'];
	date: Date;
	href: string;
	title: string;
}

interface MixSample {
	cueSlug?: string | undefined;
	downloads: number;
	files: Array<string>;
	links: Array<string>;
	// Absent when the mix has no rendition in the audio manifest
	queueItem?: PlayerPayloadItem | undefined;
	title: string;
	tracks: TracklistValue;
}

interface OpenGraphSample {
	entry: OpenGraphEntry;
	// Addresses the dev-only route; the production stem is on `entry.outputId`
	key: string;
	label: string;
}

interface ReleaseSample {
	artist?: LinkedName | undefined;
	date: Date;
	image?: string | undefined;
	labels: Array<LinkedName>;
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

// No `waveformOverview`, so the seek bar falls back to its range input
// Both URLs point at this page, so nothing plays and the panel finds no archive
const itemWithoutPeaks: PlayerPayloadItem = {
	albumLoudness: {},
	archiveUrl: '/inventory/#player',
	artistLine: 'A Hand-Built Fixture',
	durationMs: 2_400_000,
	loudness: {},
	releaseTitle: 'Inventory Sample',
	streamUrl: '/inventory/#player',
	title: 'A Mix With No Measured Peaks',
	trackId: 'inventory-no-peaks',
};

// No mix in the corpus is split across audio files, so the grouped tracklist has to be hand-built
// The filenames are fictional, so the download buttons dangle; the page carries no mix slug for a cue link
const groupedTracks: TracklistValue = [
	{
		files: ['A Hand-Built Fixture - Part One.mp3'],
		title: 'Part One',
		tracks: [
			{ artists: 'Biosphere', timestamp: '00:00:00', title: 'Kobresia' },
			{ artists: 'Higher Intelligence Agency', timestamp: '00:06:12', title: 'Speech' },
			{ artists: ['Pete Namlook', 'Bill Laswell'], timestamp: '00:14:48', title: 'Outland' },
		],
	},
	{
		description: 'A second part is its own file, so its timestamps run from zero again.',
		files: ['A Hand-Built Fixture - Part Two.mp3'],
		title: 'Part Two',
		tracks: [
			{ artists: 'O Yuki Conjugate', timestamp: '00:00:00', title: 'Black Magic Box' },
			{ artists: 'Rapoon', timestamp: '00:09:37', title: 'Wanderer' },
		],
	},
];

export async function getInventoryFixtures() {
	const catalog = await getCatalog();

	const mixItems = catalog.byCollection('mixes');
	const reviewItems = catalog.byCollection('reviews');

	const mix = await sampleMix();

	const [vocabulary, labels, styles, themes] = await Promise.all([
		sampleTerms('artists'),
		sampleTerms('labels', 4),
		sampleTerms('styles', 5),
		sampleTerms('themes', 4),
	]);

	return {
		artists: vocabulary.slice(0, 8),
		card: cardItem([...mixItems, ...reviewItems]),
		cardWork: cardWorkItem(reviewItems),
		excerpt: await sampleExcerpt(),
		groupedTracks,
		heroPath: await sampleHeroPath(),
		iconIds,
		imagePaths: await sampleImagePaths(4),
		labels,
		mix,
		mixcloudUrl: await sampleMixField('mixcloudLink'),
		mixItems,
		openGraphCards: await getSampleOpenGraphCards(),
		playerItems: [...(mix?.queueItem ? [mix.queueItem] : []), itemWithoutPeaks],
		playerLabels: getPlayerLabels(),
		regionTree: await getDirectoryTerms('regions'),
		release: await sampleRelease(),
		reviewItems,
		selections: await sampleSelections(9),
		soundcloudUrl: await sampleMixField('soundcloudLink'),
		styles,
		themes,
		vocabulary,
	};
}

// The card specimens are about the card, so pick one whose artwork is actually on disk
function cardItem(items: Array<ContentCatalogItem>): ContentCatalogItem | undefined {
	return items.find((item) => item.image !== undefined && getMediaImage(item.image) !== undefined);
}

function cardWorkItem(items: Array<ContentCatalogItem>): ContentCatalogItem | undefined {
	return items.find((item) => matchReleaseTitle(item.title, item.releaseTitle) !== undefined);
}

async function createOpenGraphCards(): Promise<Array<OpenGraphSample>> {
	const [mixes, reviews, posts, styles] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('posts'),
		getCollection('styles'),
	]);

	const contentEntries = [...mixes, ...reviews, ...posts];
	const withImage = contentEntries.filter(hasImageFeaturedOnDisk);
	const withoutImage = contentEntries.filter((entry) => !hasImageFeaturedOnDisk(entry));

	const indexEntries = getOpenGraphIndexEntries();
	const styleTitles = getStyleTitles(styles);

	function toEntry(
		entry: CollectionEntry<'mixes' | 'posts' | 'reviews'> | undefined,
	): OpenGraphEntry | undefined {
		return entry ? toOpenGraphEntry(entry, styleTitles) : undefined;
	}

	const candidates = [
		{
			entry: indexEntries.get(openGraphHomeId),
			key: 'home',
			label: 'Homepage, the only index card with a Featured Image',
		},
		{
			entry: indexEntries.get('index-mixes'),
			key: 'index',
			label: 'List Page, where the pattern runs full width',
		},
		{
			entry: indexEntries.get(openGraphDefaultId),
			key: 'default',
			label: 'Default, behind the 404 alone',
		},
		{
			entry: toEntry(mixes.find(hasImageFeaturedOnDisk)),
			key: 'mix-image',
			label: 'Mix with a Featured Image',
		},
		{
			entry: toEntry(reviews.find(hasImageFeaturedOnDisk)),
			key: 'review-image',
			label: 'Review with a Featured Image',
		},
		{
			entry: toEntry(longestTitle(withoutImage)),
			key: 'title-long',
			label: 'Longest title with no Featured Image, set full width',
		},
		{
			entry: toEntry(longestTitle(withImage)),
			key: 'title-long-image',
			label: 'Longest title beside a Featured Image, where the clamp bites first',
		},
		{
			entry: toEntry(longestTitle(mixes.filter(hasImageFeaturedOnDisk))),
			key: 'mix-title-long',
			label: 'Longest mix title beside a Featured Image',
		},
	];

	const samples: Array<OpenGraphSample> = [];

	// Two predicates can land on the same entry, and the same card drawn twice shows nothing new
	const seen = new Set<string>();

	for (const candidate of candidates) {
		const { entry } = candidate;
		if (!entry || seen.has(entry.outputId)) continue;

		seen.add(entry.outputId);
		samples.push({ ...candidate, entry });
	}

	return samples;
}

let openGraphCards: Promise<Array<OpenGraphSample>> | undefined;

// `getStaticPaths` and the page both read this, and the dev server may call either more than once
export function getSampleOpenGraphCards(): Promise<Array<OpenGraphSample>> {
	if (!openGraphCards) {
		openGraphCards = createOpenGraphCards();
	}

	return openGraphCards;
}

function hasImageFeaturedOnDisk(entry: {
	data: { imageFeatured?: Parameters<typeof getImageFeaturedId>[0] };
}): boolean {
	const imagePath = getImageFeaturedId(entry.data.imageFeatured);

	return imagePath !== undefined && getMediaImage(imagePath) !== undefined;
}

function longestTitle<T extends { data: { title: string } }>(entries: Array<T>): T | undefined {
	return [...entries].sort(
		(first, second) => second.data.title.length - first.data.title.length,
	)[0];
}

async function sampleExcerpt(): Promise<ExcerptSample | undefined> {
	const posts = await getCollection('posts');
	const entry = posts.find((post) => (post.body?.trim().length ?? 0) > 400) ?? posts.at(0);
	if (!entry) return undefined;

	const { Content } = await render(entry);

	return {
		Content,
		date: entry.data.dateCreated,
		href: getContentPath('posts', entry.id),
		title: entry.data.title,
	};
}

// Mixes only carry square cover art, which the band's 4/3 crop guts
async function sampleHeroPath(): Promise<string | undefined> {
	for (const collection of ['posts', 'pages', 'series'] as const) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			const path = getImageHeroId(entry.data.imageFeatured);
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
		const path =
			getImageHeroId(entry.data.imageFeatured) ?? getImageFeaturedId(entry.data.imageFeatured);
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
		downloads: await getDownloadCount(entry.data),
		files: entry.data.files ?? [],
		links: entry.data.links ?? [],
		queueItem: await sampleQueueItem(entry),
		title: entry.data.title,
		tracks: entry.data.tracks ?? [],
	};
}

// `soundcloudLink` can be an array; the specimens want one URL, so a split mix is passed over
async function sampleMixField(
	field: 'mixcloudLink' | 'soundcloudLink',
): Promise<string | undefined> {
	const mixes = await getCollection('mixes');

	for (const mix of mixes) {
		const value = mix.data[field];

		if (typeof value === 'string') return value;
	}

	return undefined;
}

// The alias fallback matches the Mix Detail Page, so the bar shows the artist line production would
async function sampleQueueItem(
	entry: CollectionEntry<'mixes'>,
): Promise<PlayerPayloadItem | undefined> {
	const [alias] = await resolveTermLinks(
		'artists',
		entry.data.alias ? [entry.data.alias] : undefined,
	);

	return getMixQueueItem(entry, alias?.name ?? site.title);
}

// A review carries the fullest detail header there is: split title, artist, labels, year and rating
async function sampleRelease(): Promise<ReleaseSample | undefined> {
	const reviews = await getCollection('reviews');
	const entry =
		reviews.find((review) => {
			const path = getImageFeaturedId(review.data.imageFeatured);

			return (
				review.data.releaseTitle !== undefined &&
				(review.data.labels?.length ?? 0) > 0 &&
				path !== undefined &&
				getMediaImage(path) !== undefined
			);
		}) ?? reviews.at(0);
	if (!entry) return undefined;

	const artists = await resolveCredits('artists', entry.data.artists);
	const { artist, title } = splitReleaseTitle(entry.data.title, entry.data.releaseTitle, artists);

	return {
		artist,
		date: entry.data.dateCreated,
		image: getImageFeaturedId(entry.data.imageFeatured),
		labels: await resolveCredits('labels', entry.data.labels),
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
): Promise<Array<LinkedName>> {
	const entries = await getCollection(collection);
	const terms = entries
		.map((entry) => ({ name: entry.data.title, url: getContentPath(collection, entry.id) }))
		.sort((first, second) => first.name.localeCompare(second.name));

	return limit === undefined ? terms : terms.slice(0, limit);
}
