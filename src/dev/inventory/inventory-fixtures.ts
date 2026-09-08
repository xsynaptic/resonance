import type { PlayerLabels } from '@xsynaptic/player';
import type { CollectionEntry } from 'astro:content';

import {
	openGraphBasePath,
	openGraphDefaultId,
	openGraphHomeId,
	openGraphImageFormat,
} from '@xsynaptic/shared/constants';
import { getCollection, render } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';
import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';
import type { TracklistValue } from '#lib/schemas/audio.ts';
import type { SelectionValue } from '#lib/schemas/selections.ts';
import type { IconId } from '#lib/utils/icon-types.ts';
import type { ResolvedRef, TitledCollectionKey } from '#lib/utils/terms.ts';

import { skipSeconds } from '#dev/inventory/inventory-player.tsx';
import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { getDownloadCount } from '#lib/collections/downloads/downloads-data.ts';
import { hasMixTimestamps } from '#lib/collections/mixes/mixes-cue.ts';
import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { getDirectoryTerms } from '#lib/collections/terms/term-tree.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { getImageFeaturedId, getImageHeroId } from '#lib/image/image-featured.ts';
import { site } from '#lib/site.ts';
import { matchReleaseTitle, splitReleaseTitle } from '#lib/utils/entries.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { getContentPath } from '#lib/utils/routing.ts';
import { getOpenGraphId } from '#lib/utils/seo.ts';
import { resolveRefs, resolveTermLinks } from '#lib/utils/terms.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

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
	label: string;
	// Root-relative, so it resolves against whichever dev server is showing the page
	path: string;
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

const playerLabels: PlayerLabels = {
	capped: t('player.capped'),
	clearQueue: t('player.clearQueue'),
	empty: t('player.empty'),
	error: t('player.error'),
	loading: t('player.loading'),
	moved: t('player.moved'),
	mute: t('player.mute'),
	next: t('player.next'),
	nowPlaying: t('player.nowPlaying'),
	pause: t('player.pause'),
	play: t('player.play'),
	previous: t('player.previous'),
	queue: t('player.queue'),
	removeFromQueue: t('player.removeFromQueue'),
	reorder: t('player.reorder'),
	seek: t('player.seek'),
	shuffle: t('player.shuffle'),
	skipBack: formatStringTemplate(t('player.skipBack'), { seconds: skipSeconds }),
	skipForward: formatStringTemplate(t('player.skipForward'), { seconds: skipSeconds }),
	timestampsPartial: t('player.timestampsPartial'),
	toggleTimeMode: t('player.toggleTimeMode'),
	unmute: t('player.unmute'),
	volume: t('player.volume'),
	waveformPanel: t('player.waveformPanel'),
};

export async function getInventoryFixtures() {
	const catalog = await getCatalog();

	const mixItems = catalog.byCollection('mixes');
	const reviewItems = catalog.byCollection('reviews');

	const mix = await sampleMix();

	const [vocabulary, formats, labels, styles, themes] = await Promise.all([
		sampleTerms('artists'),
		sampleTerms('formats', 1),
		sampleTerms('labels', 4),
		sampleTerms('styles', 5),
		sampleTerms('themes', 4),
	]);

	return {
		artists: vocabulary.slice(0, 8),
		card: cardItem([...mixItems, ...reviewItems]),
		cardWork: cardWorkItem(reviewItems),
		excerpt: await sampleExcerpt(),
		formats,
		groupedTracks,
		heroPath: await sampleHeroPath(),
		iconIds,
		imagePaths: await sampleImagePaths(4),
		labels,
		mix,
		mixcloudUrl: await sampleMixField('mixcloudLink'),
		mixItems,
		openGraphCards: await sampleOpenGraphCards(),
		playerItems: [...(mix?.queueItem ? [mix.queueItem] : []), itemWithoutPeaks],
		playerLabels,
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

async function sampleOpenGraphCards(): Promise<Array<OpenGraphSample>> {
	const [mixes, reviews, posts] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('posts'),
	]);

	const contentEntries = [...mixes, ...reviews, ...posts];
	const withImage = contentEntries.filter(hasImageFeaturedOnDisk);
	const withoutImage = contentEntries.filter((entry) => !hasImageFeaturedOnDisk(entry));

	const candidates = [
		{ id: openGraphHomeId, label: 'Homepage, the only index card with a Featured Image' },
		{ id: 'index-mixes', label: 'List Page, where the pattern runs full width' },
		{ id: openGraphDefaultId, label: 'Default, behind the 404 alone' },
		{ entry: mixes.find(hasImageFeaturedOnDisk), label: 'Mix with a Featured Image' },
		{ entry: reviews.find(hasImageFeaturedOnDisk), label: 'Review with a Featured Image' },
		{
			entry: longestTitle(withoutImage),
			label: 'Longest title with no Featured Image, set full width',
		},
		{
			entry: longestTitle(withImage),
			label: 'Longest title beside a Featured Image, where the clamp bites first',
		},
		{
			entry: longestTitle(mixes.filter(hasImageFeaturedOnDisk)),
			label: 'Longest mix title beside a Featured Image',
		},
	];

	const samples: Array<OpenGraphSample> = [];
	const seen = new Set<string>();

	for (const candidate of candidates) {
		const id =
			'id' in candidate
				? candidate.id
				: candidate.entry && getOpenGraphId(candidate.entry.collection, candidate.entry.id);
		if (id === undefined || seen.has(id)) continue;

		seen.add(id);
		samples.push({
			label: candidate.label,
			path: `/${openGraphBasePath}/${id}.${openGraphImageFormat}`,
		});
	}

	return samples;
}

// The alias fallback matches the Mix Detail Page, so the bar shows the artist line production would
async function sampleQueueItem(
	entry: CollectionEntry<'mixes'>,
): Promise<PlayerPayloadItem | undefined> {
	const [alias] = await resolveTermLinks(
		'artists',
		entry.data.alias ? [entry.data.alias] : undefined,
	);

	return getMixQueueItem(entry, alias?.label ?? site.title);
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

	const artists = await resolveRefs('artists', entry.data.artists);
	const { artist, title } = splitReleaseTitle(entry.data.title, entry.data.releaseTitle, artists);

	return {
		artist,
		date: entry.data.dateCreated,
		image: getImageFeaturedId(entry.data.imageFeatured),
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
		.map((entry) => ({ label: entry.data.title, url: getContentPath(collection, entry.id) }))
		.sort((first, second) => first.label.localeCompare(second.label));

	return limit === undefined ? terms : terms.slice(0, limit);
}
