export interface PeaksDescriptor {
	bands?: BandsDescriptor;
	byteOffset: number;
	formatVersion: number;
	pairCount: number;
	pairsPerSecond: number;
	rmsRange: readonly [quiet: number, loud: number];
	url: string;
}

export interface BandsDescriptor {
	bandCount: number;
	byteOffset: number;
	frameCount: number;
	framesPerSecond: number;
	medians: ReadonlyArray<number>;
	minDecibels: number;
	url: string;
}

export type BandsFacts = Omit<BandsDescriptor, 'url'>;

export interface PeaksFacts extends Omit<PeaksDescriptor, 'bands' | 'url'> {
	bands?: BandsFacts;
}
