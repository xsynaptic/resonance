import type { MenuItem } from '#components/menu/menu-types.ts';

import { t } from '#lib/i18n/i18n-strings.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

export function getMenuIdentityLinks(items: ReadonlyArray<MenuItem>): Array<string> {
	const links: Array<string> = [];

	for (const item of items) {
		if (item.rel === 'me' && item.url) links.push(item.url);
		if (item.children) links.push(...getMenuIdentityLinks(item.children));
	}

	return links;
}

export function getMenuItemAriaLabel(item: MenuItem) {
	return formatStringTemplate(t('nav.submenu.label'), { title: item.title });
}

// Anchors are navigable, buttons open a submenu, spans are plain labels
export function getMenuItemTriggerType(item: MenuItem) {
	if (item.url) return 'anchor';
	if (item.children?.length) return 'button';

	return 'span';
}

export function isActiveMenuItem(item: MenuItem, pathname: string): boolean {
	if (isActiveMenuPath(item.url, pathname)) return true;

	return item.children?.some((child) => isActiveMenuItem(child, pathname)) ?? false;
}

// External URLs are never a page in this site, so they never take the active state
export function isActiveMenuPath(url: string | undefined, pathname: string): boolean {
	if (!url || url.startsWith('http')) return false;

	return pathname === url || pathname.startsWith(`${url}/`);
}
