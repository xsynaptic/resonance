import { render } from 'astro:content';

import type { LabelRefValue, RefValue } from '#lib/schemas/refs.ts';
import type { SelectionValue } from '#lib/schemas/selections.ts';
import type { LinkableEntry } from '#lib/utils/entries.ts';
import type { ResolvedRef } from '#lib/utils/terms.ts';

import { getEntryBySlug, splitReleaseTitle } from '#lib/utils/entries.ts';
import { renderMarkdown } from '#lib/utils/markdown.ts';
import { getContentUrl } from '#lib/utils/routing.ts';
import { resolveRefs } from '#lib/utils/terms.ts';
import { toSlug } from '#lib/utils/text.ts';

export interface ResolvedSelection {
	anchor: string;
	artist?: ResolvedRef | undefined;
	Content?: ContentComponent | undefined;
	descriptionHtml?: string | undefined;
	href?: string | undefined;
	imagePath?: string | undefined;
	labels: Array<ResolvedRef>;
	linkDiscogs?: string | undefined;
	linkSource?: string | undefined;
	linkYoutube?: string | undefined;
	title: string;
	year?: string | undefined;
}

type ContentComponent = Awaited<ReturnType<typeof render>>['Content'];

interface DerivedSelection {
	artist?: ResolvedRef | undefined;
	href?: string | undefined;
	imageFeatured?: string | undefined;
	labels?: Array<LabelRefValue> | undefined;
	linkDiscogs?: string | undefined;
	linkYoutubeSearch?: boolean | undefined;
	title?: string | undefined;
	year?: string | undefined;
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
	const imageFeatured = entry.data.imageFeatured;

	if (entry.collection !== 'reviews') {
		return { href, imageFeatured, title: entry.data.title };
	}

	const artists = await resolveRefs('artists', entry.data.artists);
	const { artist, title } = splitReleaseTitle(entry.data.title, entry.data.releaseTitle, artists);

	return {
		artist,
		href,
		imageFeatured,
		labels: entry.data.labels,
		linkDiscogs: entry.data.discogsUrl,
		linkYoutubeSearch: entry.data.youtubeSearch,
		title,
		year: entry.data.releaseYear,
	};
}

async function resolveArtist(
	ref: RefValue | undefined,
	derived: ResolvedRef | undefined,
): Promise<ResolvedRef | undefined> {
	if (ref === undefined) return derived;

	const refs = await resolveRefs('artists', [ref]);

	return refs.at(0);
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
	const facts = { ...derived, ...selection };

	const [artist, body, labels] = await Promise.all([
		resolveArtist(selection.artist, derived.artist),
		resolveBody(selection.description, entry),
		resolveRefs('labels', facts.labels),
	]);
	const title = facts.title ?? '';

	return {
		anchor: toAnchor(selection.entryId, artist, title),
		artist,
		Content: body.Content,
		descriptionHtml: body.descriptionHtml,
		href: derived.href ?? selection.link,
		imagePath: facts.imageFeatured,
		labels,
		linkDiscogs: facts.linkDiscogs,
		linkSource: facts.linkSource,
		linkYoutube: youtubeSearchUrl(facts.linkYoutubeSearch, artist, title),
		title,
		year: facts.year,
	};
}

function toAnchor(
	entryId: string | undefined,
	artist: ResolvedRef | undefined,
	title: string,
): string {
	if (entryId !== undefined) return entryId;

	return toSlug([artist?.label, title].filter(Boolean).join(' '));
}

function youtubeSearchUrl(
	wanted: boolean | undefined,
	artist: ResolvedRef | undefined,
	title: string,
): string | undefined {
	if (wanted !== true) return undefined;

	const query = [artist?.label, title].filter(Boolean).join(' ');
	if (query === '') return undefined;

	return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
