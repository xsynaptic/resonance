import {
	defineSearchToggle,
	searchToggleSearchEventName,
} from '@xsynaptic/astro-pagefind/search-toggle';

import { trackEvent } from '#components/main/main-analytics.ts';

const searchQueryMinLength = 2;
const searchQueryMaxLength = 100;

document.addEventListener(searchToggleSearchEventName, ({ detail }) => {
	const query = detail.query.replaceAll(/\s+/g, ' ').slice(0, searchQueryMaxLength);

	if (query.length < searchQueryMinLength) return;

	trackEvent('search-query', { clicked: detail.clicked, query, results: detail.results });

	if (detail.results > 0) return;

	trackEvent('search-empty', { query });
});

defineSearchToggle();
