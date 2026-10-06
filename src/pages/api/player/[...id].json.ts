import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import { getPlayerCatalogue } from '#lib/collections/mixes/mixes-catalogue.ts';

export const getStaticPaths = (async () => {
	return [{ params: { id: 'catalogue' }, props: { data: await getPlayerCatalogue() } }];
}) satisfies GetStaticPaths;

export const GET = (({ props: { data } }) => {
	return Response.json(data);
}) satisfies APIRoute<InferGetStaticPropsType<typeof getStaticPaths>>;
