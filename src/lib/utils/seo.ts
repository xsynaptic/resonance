import { openGraphDefaultId } from '@xsynaptic/shared/constants';
import { getOpenGraphPath } from '@xsynaptic/shared/open-graph';
import { OG_BASE_URL } from 'astro:env/server';

// Re-exported so layouts reach the generator's own definition rather than a second one
export { getOpenGraphId } from '@xsynaptic/shared/open-graph';

// `OG_BASE_URL` is the seam for another origin; unset today, so cards ship from `dist/`
export function getOpenGraphImageUrl(
	openGraphId: string | undefined,
	site: undefined | URL,
): string {
	return new URL(getOpenGraphPath(openGraphId ?? openGraphDefaultId), OG_BASE_URL ?? site).href;
}
