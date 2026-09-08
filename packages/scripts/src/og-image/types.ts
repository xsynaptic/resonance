export interface OpenGraphCard {
	label: string | undefined;
	style: string | undefined;
	title: string;
}

// A card plus what the generator needs to schedule and cache it
export interface OpenGraphEntry extends OpenGraphCard {
	// Content hash from the data store; changes when the entry's frontmatter or body changes
	digest: string;
	imageFeaturedId: string | undefined;
	// Filename stem, `{collection}-{id}`
	outputId: string;
}
