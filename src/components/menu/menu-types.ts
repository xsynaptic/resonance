export interface MenuItem {
	children?: Array<MenuItem> | undefined;
	rel?: string | undefined;
	title: string;
	url?: string | undefined;
}

export const MENU_DEPTH_MAX = 2;
