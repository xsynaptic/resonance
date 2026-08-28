declare global {
	// Read by the MDX language server for type-hinting in `.mdx` files
	// https://github.com/mdx-js/mdx-analyzer
	interface MDXProvidedComponents {
		// The satteri auto-import plugin injects these imports, so they are typed by hand
		Img: (props: { alt?: string; id: string }) => React.JSX.Element;
		ImgGroup: (props: {
			children: React.ReactNode;
			columns?: number | string;
		}) => React.JSX.Element;
		Link: (props: { children: React.JSX.Element | string; id: string }) => React.JSX.Element;
		// `items` and `tracks` carry collection schema types this package cannot resolve
		List: (props: {
			items?: unknown;
			order?: 'countdown' | 'ordered' | 'unordered';
		}) => React.JSX.Element;
		Mixcloud: (props: { mini?: boolean; tracklist?: boolean; url: string }) => React.JSX.Element;
		More: (props: { children?: never }) => React.JSX.Element;
		Soundcloud: (props: { url: string }) => React.JSX.Element;
		TrackList: (props: { tracks?: unknown }) => React.JSX.Element;
	}

	// Astro exposes the entry's own frontmatter to expressions in the body
	const frontmatter: Record<string, unknown>;
}

// The MDX language server only picks up the declarations above from a module
export {};
