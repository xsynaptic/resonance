import { CONTENT_DATA_PATH } from 'astro:env/server';

export const postPageSize = 10;

export const contentCollectionsPath = `./${CONTENT_DATA_PATH}/collections`;

// Emitted by <More />; a list view splits the rendered body on it
export const contentExcerptMarker = '<!--more-->';

// Pulled by `pnpm deploy-site`; may not exist locally
export const downloadsStatsPath = `./${CONTENT_DATA_PATH}/data/downloads.json`;

// Pulled by `pnpm deploy-site`; may not exist locally
export const listensStatsPath = `./${CONTENT_DATA_PATH}/data/listens.json`;

export const syndicationItemCount = 20;

// A configured breakpoint, so syndication reuses a transform the pages already emit
export const syndicationImageWidth = 1200;

export const siteAuthorName = 'Basilisk';

export const siteTimezoneOffsetHours = 8;

export const listPageSize = 24;

// Pulled by `pnpm deploy-site` and committed, so a build never reaches Mixcloud
export const mixcloudStatsPath = `./${CONTENT_DATA_PATH}/data/mixcloud-stats.jsonl`;

// Pulled by `pnpm deploy-site` and committed, so a build never reaches SoundCloud
export const soundcloudStatsPath = `./${CONTENT_DATA_PATH}/data/soundcloud-stats.jsonl`;

// Hand-edited, unlike the generated files beside it
export const playlistsDataPath = `./${CONTENT_DATA_PATH}/data/playlists.yaml`;
