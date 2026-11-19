import {
	getCollectionEntries,
	log,
	UserError,
	withAstroContent,
	withSpinner,
} from '@xsynaptic/astro-scripts';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	buildRedirectPairs,
	redirectCollections,
} from '#generate-redirects/build-redirect-pairs.ts';
import { isDynamic, toRedirectsFile } from '#generate-redirects/redirects-file.ts';

// WordPress permalinks the site no longer answers to, written by hand because no field records them
const structuralRedirects: Array<[string, string]> = [
	['/lists/*', '/:splat'],
	['/designs/*', '/:splat'],
	['/projects/*', '/artists/:splat'],
	['/time-periods/*', '/eras/:splat'],
	['/lists/', '/themes/charts/'],
	['/designs/', '/themes/graphic-design/'],
	['/about/frequently-asked-questions/', '/frequently-asked-questions/'],
	['/about/privacy-policy/', '/privacy-policy/'],
	['/profile/booking/', '/booking/'],
	['/resources/command-line-tools/', '/command-line-tools/'],
	['/resources/jriver-media-center-user-guide/', '/jriver-media-center-user-guide/'],
	[
		'/resources/verifying-lossless-audio-quality-with-spectral-analysis/',
		'/verifying-lossless-audio-quality-with-spectral-analysis/',
	],
	// `page_on_front`, which WordPress answered at the site root
	['/sounds-from-the-great-beyond/', '/'],
	['/keywords/best-mixes/', '/mixes/'],
	['/sitemap.xml', '/sitemap-index.xml'],
	['/sections/articles/', '/posts/'],
	['/sections/notes/', '/posts/'],
	['/sections/quotations/', '/posts/'],
	['/sections/tracks/', '/posts/'],
	['/keywords/album-artwork/', '/themes/graphic-design/'],
	['/sections/meta/', '/themes/meta/'],
	['/keywords/interviews/', '/themes/interviews/'],
	['/keywords/music-strategy/', '/themes/music-strategy/'],
	['/keywords/musicology/', '/themes/musicology/'],
	['/keywords/physical-media/', '/themes/physical-media/'],
	['/keywords/toolkit/', '/themes/toolkit/'],
	// A Cloudflare splat only sits at the end of a rule, so the per-entry feeds use placeholders
	// The exact `/feed/` stays so it never depends on a splat matching the empty string
	['/feed/', '/rss.xml'],
	['/feed/*', '/rss.xml'],
	['/:slug/feed/', '/rss.xml'],
	['/:section/:slug/feed/', '/rss.xml'],
	// 1.3 GB of mostly `-WxH` srcset derivatives has no place in every Worker version
	['/wp-content/uploads/*', 'https://files.djbasilisk.com/uploads/:splat'],
];

function readRouteSections(rootPath: string): Set<string> {
	const names = readdirSync(path.resolve(rootPath, 'src/pages'));

	return new Set(
		names
			.filter((name) => !name.startsWith('[') && !name.startsWith('index.'))
			.map((name) => name.replace(/\.(?:astro|ts)$/, '')),
	);
}

export async function generateRedirects(rootPath: string): Promise<void> {
	const entries = await withSpinner('Loading content', () =>
		withAstroContent((content) => getCollectionEntries(content, [...redirectCollections])),
	);

	const { collisions, pairs, skipped } = buildRedirectPairs(entries, {
		routeSections: readRouteSections(rootPath),
		ruleSources: structuralRedirects.map(([from]) => from).filter((from) => !isDynamic(from)),
	});

	// Writing the file anyway would ship a rule that takes a live page off the site
	if (collisions.length > 0) {
		for (const collision of collisions) log.error(`Former id collision: ${collision}`);

		throw new UserError(`${String(collisions.length)} former id collision(s)`);
	}

	// Cloudflare serves `_redirects` from the assets directory, which is where `public/` lands
	const outputFile = 'public/_redirects';

	writeFileSync(path.resolve(rootPath, outputFile), toRedirectsFile(structuralRedirects, pairs));

	for (const note of skipped) log.warn(`Skipped ${note}`);

	log.success(
		`${structuralRedirects.length.toString()} structural and ${pairs.length.toString()} generated redirects → ${outputFile}`,
	);
}
