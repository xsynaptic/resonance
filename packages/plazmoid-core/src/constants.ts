// No imports here, so a host reads these without pulling the package into its eager bundle

export const heldPressAttribute = 'data-pzm-held-press';

export const mutedStorageKey = 'pzm-muted';
export const queueDetailStorageKey = 'pzm-queue-detail';
// Beside the order rather than in it, so a reorder never rewrites every track
export const queueTracksStorageKey = 'pzm-queue-tracks';
export const queueStorageKey = 'pzm-queue';
export const volumeStorageKey = 'pzm-volume';

// A healthy mobile start takes a few seconds
export const stallAfterMs = 20_000;

export const cueTrackAttribute = 'data-pzm-cue-track';
export const cueSecondsAttribute = 'data-pzm-cue-seconds';
export const payloadAttribute = 'data-pzm-payload';
export const playTracksAttribute = 'data-pzm-play-tracks';
export const playTrackAttribute = 'data-pzm-play-track';
export const queueTrackAttribute = 'data-pzm-queue-track';
export const trackIdAttribute = 'data-pzm-track-id';

export const cueCurrentAttribute = 'data-pzm-cue-current';
export const loadedAttribute = 'data-pzm-loaded';
export const playingAttribute = 'data-pzm-playing';
export const queuedAttribute = 'data-pzm-queued';

export const controlSelector = `[${queueTrackAttribute}],[${playTrackAttribute}],[${playTracksAttribute}]`;
export const heldPressSelector = `[${heldPressAttribute}]`;
export const payloadSelector = `[${payloadAttribute}]`;
