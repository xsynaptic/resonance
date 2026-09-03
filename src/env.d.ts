/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		// Set by the feed renderer; MDX components branch on it for their unstyled output
		isFeed?: boolean;
	}
}
