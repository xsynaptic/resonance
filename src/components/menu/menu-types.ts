export interface MenuItem {
	children?: Array<MenuItem> | undefined;
	rel?: string | undefined;
	title: string;
	url?: string | undefined;
}

export const menuDepthMax = 2;
