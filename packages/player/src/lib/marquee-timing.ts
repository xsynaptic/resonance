export interface MarqueeProperties {
	'--player-marquee-distance': string;
	'--player-marquee-duration': string;
	'--player-marquee-timing': string;
}

const marqueeHoldSeconds = 8;

// Travel is proportional to the distance, so a long title marches rather than flying
const tempoPixelsPerSecond = 40;

// A keyframe selector cannot read a custom property, so the two holds ride in a `linear()` easing instead
export function marqueeProperties(distance: number): MarqueeProperties {
	const travelSeconds = distance / tempoPixelsPerSecond;
	const totalSeconds = marqueeHoldSeconds * 2 + travelSeconds * 2;
	const holdEnd = percentOf(marqueeHoldSeconds, totalSeconds);
	const travelEnd = percentOf(marqueeHoldSeconds + travelSeconds, totalSeconds);
	const holdBackEnd = percentOf(marqueeHoldSeconds * 2 + travelSeconds, totalSeconds);

	return {
		'--player-marquee-distance': `${String(distance)}px`,
		'--player-marquee-duration': `${totalSeconds.toFixed(2)}s`,
		'--player-marquee-timing': `linear(0 0%, 0 ${holdEnd}%, 1 ${travelEnd}%, 1 ${holdBackEnd}%, 0 100%)`,
	};
}

export function overflowDistance(box: HTMLElement): number {
	return Math.max(0, Math.round(box.scrollWidth - box.clientWidth));
}

function percentOf(elapsedSeconds: number, totalSeconds: number): string {
	return ((elapsedSeconds / totalSeconds) * 100).toFixed(2);
}
