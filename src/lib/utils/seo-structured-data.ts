import type { ResolvedRef } from '#lib/utils/terms.ts';

import { site } from '#lib/site.ts';
import { getContentUrl, getSiteUrl } from '#lib/utils/routing.ts';

export type Thing =
	Article | BreadcrumbList | CollectionPage | MusicPlaylist | Person | Review | WebPage | WebSite;

interface Article extends IdReference {
	'@type': 'Article';
	author: IdReference;
	dateModified?: string;
	datePublished: string;
	description?: string;
	headline: string;
	image?: string;
	mainEntity?: IdReference;
}

interface BreadcrumbList extends IdReference {
	'@type': 'BreadcrumbList';
	itemListElement: Array<{
		'@type': 'ListItem';
		item?: string;
		name: string;
		position: number;
	}>;
}

interface CollectionPage extends IdReference {
	'@type': 'CollectionPage';
	description?: string;
	name: string;
	url: string;
}

interface Graph {
	'@context': 'https://schema.org';
	'@graph': ReadonlyArray<Thing>;
}

interface IdReference {
	'@id': string;
}

// Inline on a Review, so it never stands alone in the graph
interface MusicAlbum extends IdReference {
	'@type': 'MusicAlbum';
	albumRelease?: MusicRelease;
	byArtist?: {
		'@type': 'MusicGroup';
		name: string;
	};
	datePublished?: string;
	name: string;
	sameAs?: string;
}

interface MusicPlaylist extends IdReference {
	'@type': 'MusicPlaylist';
	name: string;
	numTracks?: number;
}

// `recordLabel` is only valid on a MusicRelease; MusicAlbum reaches one through `albumRelease`
interface MusicRelease {
	'@type': 'MusicRelease';
	name: string;
	recordLabel: {
		'@type': 'Organization';
		name: string;
	};
}

interface Person extends IdReference {
	'@type': 'Person';
	alternateName: string;
	name: string;
	sameAs?: ReadonlyArray<string>;
	url: string;
}

interface Review extends IdReference {
	'@type': 'Review';
	author: IdReference;
	datePublished: string;
	itemReviewed: MusicAlbum;
	name: string;
	reviewRating?: {
		'@type': 'Rating';
		bestRating: number;
		ratingValue: number;
		worstRating: number;
	};
}

interface WebPage extends IdReference {
	'@type': 'WebPage';
	description?: string;
	mainEntity?: IdReference;
	name: string;
	url: string;
}

interface WebSite extends IdReference {
	'@type': 'WebSite';
	description: string;
	name: string;
	publisher: IdReference;
	url: string;
}

export const profilePageId = 'profile';

const siteUrl = getSiteUrl();
const profileUrl = getSiteUrl(getContentUrl('pages', profilePageId));

const ids = {
	album: (pageUrl: string) => `${pageUrl}#album`,
	article: (pageUrl: string) => `${pageUrl}#article`,
	breadcrumb: (pageUrl: string) => `${pageUrl}#breadcrumb`,
	collectionPage: (pageUrl: string) => `${pageUrl}#collection`,
	person: `${profileUrl}#person`,
	playlist: (pageUrl: string) => `${pageUrl}#playlist`,
	review: (pageUrl: string) => `${pageUrl}#review`,
	webPage: (pageUrl: string) => `${pageUrl}#webpage`,
	website: `${siteUrl}#website`,
};

export function buildArticleSchema(props: {
	dateCreated: Date;
	dateUpdated: Date | undefined;
	description: string | undefined;
	imageUrl: string | undefined;
	mainEntity?: IdReference | undefined;
	title: string;
	url: string;
}): Article {
	return {
		'@id': ids.article(props.url),
		'@type': 'Article',
		headline: props.title,
		...(props.description ? { description: props.description } : {}),
		...(props.imageUrl ? { image: props.imageUrl } : {}),
		datePublished: props.dateCreated.toISOString(),
		...(props.dateUpdated ? { dateModified: props.dateUpdated.toISOString() } : {}),
		author: { '@id': ids.person },
		...(props.mainEntity ? { mainEntity: props.mainEntity } : {}),
	};
}

export function buildAuthorSchema(options?: { sameAs?: ReadonlyArray<string> }): Person {
	return {
		'@id': ids.person,
		'@type': 'Person',
		// The site title names the persona; the Person node names the human behind it
		alternateName: 'DJ Basilisk',
		name: 'Basilisk',
		url: profileUrl,
		...(options?.sameAs && options.sameAs.length > 0 ? { sameAs: options.sameAs } : {}),
	};
}

export function buildCollectionGraph(props: {
	description: string | undefined;
	title: string;
	trail?: ReadonlyArray<ResolvedRef> | undefined;
	url: string;
}): Array<Thing> {
	return [
		buildCollectionPageSchema(props),
		buildBreadcrumbSchema(
			[
				{ name: site.title, url: siteUrl },
				...(props.trail ?? []).map((ref) => ({
					name: ref.label,
					...(ref.url ? { url: getSiteUrl(ref.url) } : {}),
				})),
				{ name: props.title },
			],
			props.url,
		),
	];
}

export function buildEntryGraph(props: {
	entities: ReadonlyArray<Thing>;
	kind: ResolvedRef;
	title: string;
	url: string;
}): Array<Thing> {
	return [
		...props.entities,
		buildAuthorSchema(),
		buildBreadcrumbSchema(
			[
				{ name: site.title, url: siteUrl },
				{ name: props.kind.label, ...(props.kind.url ? { url: getSiteUrl(props.kind.url) } : {}) },
				{ name: props.title },
			],
			props.url,
		),
	];
}

export function buildPlaylistSchema(props: {
	title: string;
	trackCount: number;
	url: string;
}): MusicPlaylist {
	return {
		'@id': ids.playlist(props.url),
		'@type': 'MusicPlaylist',
		name: props.title,
		...(props.trackCount > 0 ? { numTracks: props.trackCount } : {}),
	};
}

export function buildReviewSchema(props: {
	artist: string | undefined;
	dateCreated: Date;
	discogsUrl: string | undefined;
	label: string | undefined;
	rating: number | undefined;
	releaseTitle: string;
	releaseYear: string | undefined;
	title: string;
	url: string;
}): Review {
	return {
		'@id': ids.review(props.url),
		'@type': 'Review',
		author: { '@id': ids.person },
		datePublished: props.dateCreated.toISOString(),
		itemReviewed: buildAlbumSchema(props),
		name: props.title,
		...(props.rating
			? {
					reviewRating: {
						'@type': 'Rating',
						bestRating: 100,
						ratingValue: props.rating,
						worstRating: 1,
					},
				}
			: {}),
	};
}

export function buildWebPageSchema(props: {
	description: string | undefined;
	isPersonProfile: boolean;
	title: string;
	url: string;
}): WebPage {
	return {
		'@id': ids.webPage(props.url),
		'@type': 'WebPage',
		name: props.title,
		...(props.description ? { description: props.description } : {}),
		url: props.url,
		...(props.isPersonProfile ? { mainEntity: { '@id': ids.person } } : {}),
	};
}

export function buildWebSiteSchema(): WebSite {
	return {
		'@id': ids.website,
		'@type': 'WebSite',
		description: site.description,
		name: site.title,
		publisher: { '@id': ids.person },
		url: siteUrl,
	};
}

// JSON unicode escapes, not HTML entities; `set:html` would otherwise let content close the script tag
export function serializeGraph(entities: ReadonlyArray<Thing>): string {
	const graph: Graph = {
		'@context': 'https://schema.org',
		'@graph': entities,
	};

	return JSON.stringify(graph)
		.replaceAll('<', String.raw`\u003c`)
		.replaceAll('>', String.raw`\u003e`)
		.replaceAll('&', String.raw`\u0026`);
}

function buildAlbumSchema(props: {
	artist: string | undefined;
	discogsUrl: string | undefined;
	label: string | undefined;
	releaseTitle: string;
	releaseYear: string | undefined;
	url: string;
}): MusicAlbum {
	return {
		'@id': ids.album(props.url),
		'@type': 'MusicAlbum',
		name: props.releaseTitle,
		...(props.artist ? { byArtist: { '@type': 'MusicGroup', name: props.artist } } : {}),
		...(props.label
			? {
					albumRelease: {
						'@type': 'MusicRelease',
						name: props.releaseTitle,
						recordLabel: { '@type': 'Organization', name: props.label },
					},
				}
			: {}),
		...(props.releaseYear ? { datePublished: props.releaseYear } : {}),
		...(props.discogsUrl ? { sameAs: props.discogsUrl } : {}),
	};
}

function buildBreadcrumbSchema(
	items: ReadonlyArray<{ name: string; url?: string }>,
	pageUrl: string,
): BreadcrumbList {
	return {
		'@id': ids.breadcrumb(pageUrl),
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			name: item.name,
			position: index + 1,
			...(item.url ? { item: item.url } : {}),
		})),
	};
}

function buildCollectionPageSchema(props: {
	description: string | undefined;
	title: string;
	url: string;
}): CollectionPage {
	return {
		'@id': ids.collectionPage(props.url),
		'@type': 'CollectionPage',
		name: props.title,
		...(props.description ? { description: props.description } : {}),
		url: props.url,
	};
}
