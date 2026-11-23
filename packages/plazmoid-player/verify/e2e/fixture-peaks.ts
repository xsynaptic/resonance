import { buildPeaks, peaksFieldCount, samplesPerPair } from '@xsynaptic/plazmoid-wavedata';

const sampleRate = 44_100;
const fixtureSeconds = 60;
const pairCount = Math.ceil((fixtureSeconds * sampleRate) / samplesPerPair);

function fixtureFields(): Int8Array {
	const fields = new Int8Array(pairCount * peaksFieldCount);

	for (let pair = 0; pair < pairCount; pair += 1) {
		fields.set([-90, 90, 60], pair * peaksFieldCount);
	}

	return fields;
}

export const fixturePeaks = buildPeaks(fixtureFields(), sampleRate);
