// No imports here, so a host reads these without pulling the package into its eager bundle

// CSS pixels, compact then full, matching `--player-artwork-size-compact` and `--player-artwork-size`
export const barArtworkSizes = [120, 140] as const;

export const controlSelector =
	'[data-queue-toggle],[data-queue-track],[data-play-track],[data-play-release],[data-play-queue]';
export const heldPressAttribute = 'data-player-held-press';
export const heldPressSelector = '[data-player-held-press]';
export const payloadSelector = '[data-player-payload]';
export const queueStorageKey = 'player:v2:queue';
