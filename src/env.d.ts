/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		// Set by the mix layout when the player can play the entry
		playerMixId?: string;
	}
}
