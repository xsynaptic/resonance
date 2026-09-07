export interface NavigationItem {
	children?: Array<NavigationItem> | undefined;
	rel?: string | undefined;
	title: string;
	url?: string | undefined;
}

export const navigationDepthMax = 2;
