import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import { getPlayerLibrary } from '#lib/collections/mixes/mixes-library.ts';

export const getStaticPaths = (async () => {
	return [{ params: { id: 'library' }, props: { data: await getPlayerLibrary() } }];
}) satisfies GetStaticPaths;

export const GET = (({ props: { data } }) => {
	return Response.json(data);
}) satisfies APIRoute<InferGetStaticPropsType<typeof getStaticPaths>>;
