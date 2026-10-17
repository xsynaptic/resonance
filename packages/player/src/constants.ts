// No imports here, so a host reads these without pulling the package into its eager bundle

// CSS pixels, matching `--player-artwork-size`
export const barArtworkSize = 120;

export const heldPressAttribute = 'data-player-held-press';

export const mutedStorageKey = 'rez-player-muted';
export const panelOpenStorageKey = 'rez-player-panel-open';
export const panelZoomStorageKey = 'rez-player-panel-zoom';
export const queueDetailStorageKey = 'rez-player-queue-detail';
// Beside the order rather than in it, so a reorder never rewrites every item
export const queueItemsStorageKey = 'rez-player-queue-items';
export const queueStorageKey = 'rez-player-queue';
export const timeModeStorageKey = 'rez-player-time-mode';
export const volumeStorageKey = 'rez-player-volume';

export const cueMixAttribute = 'data-cue-mix';
export const cueSecondsAttribute = 'data-cue-seconds';
export const payloadAttribute = 'data-player-payload';
export const playPlaylistAttribute = 'data-play-playlist';
export const playTrackAttribute = 'data-play-track';
export const queueTrackAttribute = 'data-queue-track';
export const trackIdAttribute = 'data-track-id';

export const cueCurrentAttribute = 'data-cue-current';
export const loadedAttribute = 'data-loaded';
export const playingAttribute = 'data-playing';
export const queuedAttribute = 'data-queued';

export const controlSelector = `[${queueTrackAttribute}],[${playTrackAttribute}],[${playPlaylistAttribute}]`;
export const heldPressSelector = `[${heldPressAttribute}]`;
export const payloadSelector = `[${payloadAttribute}]`;
