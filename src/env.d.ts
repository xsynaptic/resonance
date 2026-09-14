/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		// Set by the feed renderer; MDX components branch on it for their unstyled output
		isFeed?: boolean;
		// Set by the mix layout when the player can play the entry
		playerMixId?: string;
	}
}
