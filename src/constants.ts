import { CONTENT_DATA_PATH } from 'astro:env/server';

export const postPageSize = 10;

export const contentCollectionsPath = `./${CONTENT_DATA_PATH}/collections`;

// Emitted by <More />; a list view splits the rendered body on it
export const contentExcerptMarker = '<!--more-->';

// Pulled via `pnpm stats-pull`; may not exist locally
export const downloadsStatsPath = `./${CONTENT_DATA_PATH}/data/downloads.json`;

// Pulled via `pnpm listens-pull`; may not exist locally
export const listensStatsPath = `./${CONTENT_DATA_PATH}/data/listens.json`;

// Every feed item is a full off-page MDX render, so the count is the build cost
export const feedItemCount = 20;

export const listPageSize = 24;

// Pulled via `pnpm mixcloud-stats` and committed, so a build never reaches Mixcloud
export const mixcloudStatsPath = `./${CONTENT_DATA_PATH}/data/mixcloud-stats.jsonl`;

// Pulled via `pnpm soundcloud-stats` and committed, so a build never reaches SoundCloud
export const soundcloudStatsPath = `./${CONTENT_DATA_PATH}/data/soundcloud-stats.jsonl`;

// Hand-edited, unlike the generated files beside it
export const playlistsDataPath = `./${CONTENT_DATA_PATH}/data/playlists.yaml`;
