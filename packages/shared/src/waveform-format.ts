// Written by the build; each header's facts ride on the queue item, so the player never requests one

export const peaksHeaderBytes = 24;
// Min, max and RMS, one Int8 each at a full scale of 128
export const peaksFieldCount = 3;
export const peaksFullScale = 128;
export const samplesPerPair = 256;

export const bandsHeaderBytes = 36;
export const bandCount = 3;
export const samplesPerFrame = 1024;
// How far below full scale a level byte reaches
export const bandsDecibelRange = 60;
