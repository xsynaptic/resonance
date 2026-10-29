import { getCardName } from '@xsynaptic/astro-image-pipeline/names';
import { z } from 'zod';

import { openGraphBasePath, openGraphImageFormat } from '#constants.ts';

export const OpenGraphCardInputSchema = z.object({
	label: z.string().optional(),
	style: z.string().optional(),
	title: z.string(),
});

export type OpenGraphCardInput = z.infer<typeof OpenGraphCardInputSchema>;

export interface PageOpenGraphCard {
	id: string;
	imageId?: string | undefined;
	input: OpenGraphCardInput;
}

// Pages get no eyebrow; "Page" tells a reader nothing the title does not
const collectionLabels: Record<string, string> = {
	artists: 'Artist',
	eras: 'Era',
	labels: 'Label',
	mixes: 'Mix',
	posts: 'Posts',
	regions: 'Region',
	reviews: 'Review',
	series: 'Series',
	styles: 'Style',
	themes: 'Theme',
};

// The one definition of a card's identity, read by the redirect map and the page
// Kept free of node and image dependencies so production layouts can import it
export function getOpenGraphId(collection: string, id: string): string {
	return `${collection}-${id}`;
}

export function getOpenGraphPath(openGraphId: string): string {
	return `/${openGraphBasePath}/${openGraphId}.${openGraphImageFormat}`;
}

export function getOpenGraphLabel(collection: string): string | undefined {
	return collectionLabels[collection];
}

export function getOpenGraphCardPath({ id, imageId, input }: PageOpenGraphCard): string {
	const name = getCardName(
		{
			id,
			...(imageId === undefined ? {} : { image: { id: imageId } }),
			input: { label: input.label, style: input.style, title: input.title },
		},
		{ format: openGraphImageFormat },
	);

	return `/${openGraphBasePath}/${name}`;
}
