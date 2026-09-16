// A module of its own, so a host can hold a press made before the player loads without importing it
export const controlSelector =
	'[data-queue-toggle],[data-queue-track],[data-play-track],[data-play-release],[data-play-queue]';
export const heldPressAttribute = 'data-player-held-press';
export const heldPressSelector = '[data-player-held-press]';
export const payloadSelector = '[data-player-payload]';
