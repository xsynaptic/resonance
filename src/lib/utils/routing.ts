export { getCollectionUrl, getContentUrl } from '@xsynaptic/shared/routing';

export function getSiteUrl(...routeParts: Array<string>): string {
	return [import.meta.env.SITE, ...routeParts].join('/').replaceAll(/(?<!:)\/\/+/g, '/');
}
