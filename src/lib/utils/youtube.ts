import type { ResolvedRef } from '#lib/utils/terms.ts';

// The opt-in flag lives on the entry, so the guard sits here rather than at each call site
export function getYoutubeSearchUrl(
	wanted: boolean | undefined,
	artists: Array<ResolvedRef>,
	title: string,
): string | undefined {
	if (wanted !== true) return undefined;

	const query = [...artists.map((artist) => artist.label), title].filter(Boolean).join(' ');

	if (query === '') return undefined;

	return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
