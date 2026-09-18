// No imports here, so a host reads these without pulling the package into its eager bundle

// CSS pixels, matching `--player-artwork-size`
export const barArtworkSize = 120;

export const controlSelector =
	'[data-queue-track],[data-play-track],[data-play-release],[data-play-playlist]';
export const heldPressAttribute = 'data-player-held-press';
export const heldPressSelector = '[data-player-held-press]';
export const payloadSelector = '[data-player-payload]';
export const queueStorageKey = 'player:v2:queue';
