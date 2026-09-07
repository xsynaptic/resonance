import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { t } from '#lib/i18n/i18n-strings.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

export function getNavigationItemAriaLabel(item: NavigationItem) {
	return formatStringTemplate(t('nav.submenu.label'), { title: item.title });
}

// Anchors are navigable, buttons open a submenu, spans are plain labels
export function getNavigationItemTriggerType(item: NavigationItem) {
	if (item.url) return 'anchor';
	if (item.children?.length) return 'button';

	return 'span';
}

export function isActiveNavigationItem(item: NavigationItem, pathname: string): boolean {
	if (isActiveNavigationPath(item.url, pathname)) return true;

	return item.children?.some((child) => isActiveNavigationItem(child, pathname)) ?? false;
}

// External URLs are never a page in this site, so they never take the active state
export function isActiveNavigationPath(url: string | undefined, pathname: string): boolean {
	if (!url || url.startsWith('http')) return false;

	return normalizePathname(pathname).startsWith(url);
}

export function isCurrentNavigationPath(url: string | undefined, pathname: string): boolean {
	if (!url || url.startsWith('http')) return false;

	return normalizePathname(pathname) === url;
}

function normalizePathname(pathname: string): string {
	return pathname.endsWith('/') ? pathname : `${pathname}/`;
}
