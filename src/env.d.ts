/// <reference types="astro/client" />

// Stamped by vite.define in the Astro config, not an astro:env field
interface ImportMetaEnv {
	readonly BUILD_VERSION: string | undefined;
}

declare namespace App {
	interface Locals {
		// Set by the mix layout when the player can play the entry
		playerMixId?: string;
	}
}
