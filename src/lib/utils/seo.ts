import {
	openGraphBasePath,
	openGraphDefaultId,
	openGraphImageFormat,
} from '@xsynaptic/shared/constants';
import { OG_BASE_URL } from 'astro:env/server';

export { getOpenGraphId } from '@xsynaptic/shared/open-graph';

// `OG_BASE_URL` is the seam for another origin; unset today, so cards ship from `dist/`
export function getOpenGraphImageUrl(
	openGraphId: string | undefined,
	site: undefined | URL,
): string {
	const filename = `${openGraphId ?? openGraphDefaultId}.${openGraphImageFormat}`;

	return new URL(`${openGraphBasePath}/${filename}`, OG_BASE_URL ?? site).href;
}
