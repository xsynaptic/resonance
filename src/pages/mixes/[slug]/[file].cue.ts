import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import { getMixCueSheets, hasMixTimestamps } from '#lib/collections/mixes/mixes-cue.ts';
import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';

// Cue files land beside the mix page: build.format is 'directory', so /mixes/<slug>/ is already a
// directory and each <audio file>.cue sits inside it. Static builds discard response headers, so the
// content type is whatever the host serves an unknown extension as, which downloads either way
export const getStaticPaths = (async () => {
	const mixes = await getPublishedMixes();

	const paths = await Promise.all(
		mixes
			.filter((entry) => hasMixTimestamps(entry))
			.map(async (entry) => {
				const sheets = await getMixCueSheets(entry);

				return sheets.map(({ audioFile, text }) => ({
					params: { file: audioFile, slug: entry.id },
					props: { text },
				}));
			}),
	);

	return paths.flat();
}) satisfies GetStaticPaths;

export const GET = (({ props }) => new Response(props.text)) satisfies APIRoute<
	InferGetStaticPropsType<typeof getStaticPaths>
>;
