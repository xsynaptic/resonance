import { contentDataPath } from '#shared/content-path.ts';

// Paths are relative to the workspace root; join with findWorkspaceRoot() before use
export const audioSourceDir = `${contentDataPath}/audio`;
export const streamsDir = `${contentDataPath}/streams`;
export const mixesContentDir = `${contentDataPath}/collections/mixes`;
export const waveformsCacheDir = '.cache/waveforms';
