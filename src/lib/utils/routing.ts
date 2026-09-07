export { getCollectionPath, getContentPath } from '@xsynaptic/shared/routing';

export function getAbsoluteUrl(path: string): string {
	return new URL(path, import.meta.env.SITE).href;
}
