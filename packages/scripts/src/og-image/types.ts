// What the card itself draws
export interface OpenGraphCard {
	// Collection label shown as the eyebrow; absent on cards that get no eyebrow
	label: string | undefined;
	title: string;
}

// A card plus what the generator needs to schedule and cache it
export interface OpenGraphEntry extends OpenGraphCard {
	// Content hash from the data store; changes when the entry's frontmatter or body changes
	digest: string;
	imageFeatured: string | undefined;
	// Filename stem, `{collection}-{id}`
	outputId: string;
}
