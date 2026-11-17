import { recordTraversalPageviews } from '@xsynaptic/analytics/umami';
import {
	normalizeSearchQuery,
	searchToggleSearchEndEventName,
} from '@xsynaptic/astro-pagefind/search-toggle';

import { sendEvent } from '#lib/analytics/analytics-events.ts';

// Not `data-umami-event`: the tracker cancels that link's click and reassigns location, dropping `download`
document.addEventListener('click', (event) => {
	if (!(event.target instanceof Element)) return;

	const mix = event.target.closest<HTMLAnchorElement>('a[data-cue-sheet]')?.dataset.cueSheet;

	if (mix === undefined) return;

	sendEvent('cue-sheet-download', { mix });
});

document.addEventListener(
	searchToggleSearchEndEventName,
	({ detail: { clicked, query, results } }) => {
		const reportedQuery = normalizeSearchQuery(query);

		if (reportedQuery === undefined) return;

		sendEvent('search-query', { clicked, query: reportedQuery, results });

		if (results > 0) return;

		sendEvent('search-empty', { query: reportedQuery });
	},
);

recordTraversalPageviews();
