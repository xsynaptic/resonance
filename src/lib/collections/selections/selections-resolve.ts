import { render } from 'astro:content';

import type { LabelRefValue } from '#lib/schemas/refs.ts';
import type { SelectionValue } from '#lib/schemas/selections.ts';
import type { LinkableEntry } from '#lib/utils/entries.ts';
import type { ResolvedRef } from '#lib/utils/terms.ts';

import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getEntryBySlug, splitReleaseTitle } from '#lib/utils/entries.ts';
import { renderMarkdown } from '#lib/utils/markdown.ts';
import { getContentUrl } from '#lib/utils/routing.ts';
import { resolveRefs, toRefArray } from '#lib/utils/terms.ts';
import { toSlug } from '#lib/utils/text.ts';

export interface ResolvedSelection {
	anchor: string;
	artists: Array<ResolvedRef>;
	Content?: ContentComponent | undefined;
	descriptionHtml?: string | undefined;
	discogsUrl?: string | undefined;
	href?: string | undefined;
	imagePath?: string | undefined;
	labels: Array<ResolvedRef>;
	links: Array<string>;
	linkYoutube?: string | undefined;
	title: string;
	year?: string | undefined;
}

type ContentComponent = Awaited<ReturnType<typeof render>>['Content'];

// The entry's own facts, already resolved where the selection would carry unresolved refs
interface DerivedSelection {
	artists?: Array<ResolvedRef> | undefined;
	discogsUrl?: string | undefined;
	href?: string | undefined;
	imageFeatured?: string | undefined;
	labels?: Array<LabelRefValue> | undefined;
	links?: Array<string> | undefined;
	title?: string | undefined;
	year?: string | undefined;
	youtubeSearch?: boolean | undefined;
}

interface SelectionBody {
	Content?: ContentComponent | undefined;
	descriptionHtml?: string | undefined;
}

export async function resolveSelections(
	selections: Array<SelectionValue>,
): Promise<Array<ResolvedSelection>> {
	return Promise.all(selections.map((selection) => resolveSelection(selection)));
}

async function deriveFromEntry(entry: LinkableEntry): Promise<DerivedSelection> {
	const href = getContentUrl(entry.collection, entry.id);
	const imageFeatured = getImageFeaturedId(entry.data.imageFeatured);

	if (entry.collection !== 'reviews') {
		return { href, imageFeatured, title: entry.data.title };
	}

	const artistTerms = await resolveRefs('artists', entry.data.artists);
	const { artist, title } = splitReleaseTitle(
		entry.data.title,
		entry.data.releaseTitle,
		artistTerms,
	);

	return {
		// Only the artist half of a split title; an unsplit title already carries the credit
		artists: artist ? [artist] : [],
		discogsUrl: entry.data.discogsUrl,
		href,
		imageFeatured,
		labels: entry.data.labels,
		links: entry.data.links,
		title,
		year: entry.data.releaseYear,
		youtubeSearch: entry.data.youtubeSearch,
	};
}

async function resolveBody(
	description: string | undefined,
	entry: LinkableEntry | undefined,
): Promise<SelectionBody> {
	if (description !== undefined) return { descriptionHtml: await renderMarkdown(description) };
	if (entry === undefined) return {};

	const { Content } = await render(entry);

	return { Content };
}

async function resolveSelection(selection: SelectionValue): Promise<ResolvedSelection> {
	const entry = selection.entryId ? await getEntryBySlug(selection.entryId) : undefined;
	const derived: DerivedSelection = entry ? await deriveFromEntry(entry) : {};

	// The selection's own fields win by key; zod omits absent optionals, so the spread never clobbers
	// `artists` sits outside it, since the entry's are resolved and the selection's are not
	const { artists: derivedArtists, ...derivedFacts } = derived;
	const { artists: ownArtists, ...ownFacts } = selection;
	const facts = { ...derivedFacts, ...ownFacts };

	const [artists, body, labels] = await Promise.all([
		ownArtists === undefined
			? Promise.resolve(derivedArtists ?? [])
			: resolveRefs('artists', toRefArray(ownArtists)),
		resolveBody(selection.description, entry),
		resolveRefs('labels', facts.labels),
	]);
	const title = facts.title ?? '';

	return {
		anchor: toAnchor(selection.entryId, artists, title),
		artists,
		Content: body.Content,
		descriptionHtml: body.descriptionHtml,
		discogsUrl: facts.discogsUrl,
		href: derived.href,
		imagePath: facts.imageFeatured,
		labels,
		links: facts.links ?? [],
		linkYoutube: youtubeSearchUrl(facts.youtubeSearch, artists, title),
		title,
		year: facts.year,
	};
}

function toAnchor(entryId: string | undefined, artists: Array<ResolvedRef>, title: string): string {
	if (entryId !== undefined) return entryId;

	return toSlug([...artists.map((artist) => artist.label), title].filter(Boolean).join(' '));
}

function youtubeSearchUrl(
	wanted: boolean | undefined,
	artists: Array<ResolvedRef>,
	title: string,
): string | undefined {
	if (wanted !== true) return undefined;

	const query = [...artists.map((artist) => artist.label), title].filter(Boolean).join(' ');
	if (query === '') return undefined;

	return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
