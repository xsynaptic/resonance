import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import { getMixCueSheets, hasMixTimestamps } from '#lib/collections/mixes/mixes-cue.ts';
import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';

// Cue files land beside the mix page: build.format is 'directory', so /mixes/<slug>/ already exists
// Static builds discard response headers, so the host decides the content type for .cue
// Workers Assets sends none at all, which renders inline; the `download` attribute on the link decides it instead
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
