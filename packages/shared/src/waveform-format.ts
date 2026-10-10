// Written by the build and described to the player on each queue item, so the player holds no format of its own

// The header audiowaveform writes at version 1
export const peakArchiveHeaderBytes = 20;

export const bandsHeaderBytes = 36;
export const bandCount = 3;
export const samplesPerFrame = 1024;
// How far below full scale a level byte reaches
export const bandsDecibelRange = 60;
