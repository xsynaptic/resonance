import type { GetStaticPaths } from 'astro';

import { listPageSize } from '#constants.ts';
import { getArchiveYears } from '#lib/archive/archive-data.ts';

// Paginated static paths for every year: page 1 bare, pages 2+ at /archive/<year>/<n>/
export const createArchiveYearPaths = (async ({ paginate }) => {
	const years = await getArchiveYears();

	return years.flatMap((group) =>
		paginate(group.items, {
			pageSize: listPageSize,
			params: { year: String(group.year) },
			props: { year: group.year },
		}),
	);
}) satisfies GetStaticPaths;
