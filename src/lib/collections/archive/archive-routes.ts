import type { GetStaticPaths } from 'astro';

import { listPageSize } from '#constants.ts';
import { getArchiveYears } from '#lib/collections/archive/archive-data.ts';

// Paginated static paths for every year: page 1 bare, pages 2+ at /archive/<year>/<n>/
// Neighbours skip empty years, so the gap in the middle of the archive never strands a reader
export const createArchiveYearPaths = (async ({ paginate }) => {
	const years = await getArchiveYears();

	return years.flatMap((group, index) =>
		paginate(group.items, {
			pageSize: listPageSize,
			params: { year: String(group.year) },
			props: {
				newerYear: years[index - 1]?.year,
				olderYear: years[index + 1]?.year,
				year: group.year,
			},
		}),
	);
}) satisfies GetStaticPaths;
