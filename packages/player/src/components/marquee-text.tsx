import type { CSSProperties } from 'react';

import { useEffect, useRef, useState } from 'react';

import { joinClassNames } from '#lib/class-names.ts';

const marqueeHoldSeconds = 8;

// Travel is proportional to the distance, so a long title marches rather than flying
const tempoPixelsPerSecond = 40;

// One line that marches only when it does not fit; the measurement is the whole mechanism, there is no timer
export function MarqueeText({ className, text }: { className?: string | undefined; text: string }) {
	const boxRef = useRef<HTMLSpanElement>(null);
	const [distance, setDistance] = useState(0);

	useEffect(() => {
		const box = boxRef.current;
		if (!box) return;

		const measure = (): void => {
			setDistance(Math.max(0, Math.round(box.scrollWidth - box.clientWidth)));
		};

		measure();

		const observer = new ResizeObserver(measure);

		observer.observe(box);

		return () => {
			observer.disconnect();
		};
	}, [text]);

	return (
		<span
			className={joinClassNames('player-marquee', className)}
			data-overflow={distance > 0 ? '' : undefined}
			ref={boxRef}
			style={distance > 0 ? marqueeStyle(distance) : undefined}
		>
			<span className="player-marquee-text">{text}</span>
		</span>
	);
}

// A keyframe selector cannot read a custom property, so the two holds ride in a `linear()` easing instead
function marqueeStyle(distance: number): CSSProperties {
	const travelS = distance / tempoPixelsPerSecond;
	const totalS = marqueeHoldSeconds * 2 + travelS * 2;
	const holdEnd = percentOf(marqueeHoldSeconds, totalS);
	const travelEnd = percentOf(marqueeHoldSeconds + travelS, totalS);
	const holdBackEnd = percentOf(marqueeHoldSeconds * 2 + travelS, totalS);

	return {
		'--player-marquee-distance': `${String(distance)}px`,
		'--player-marquee-duration': `${totalS.toFixed(2)}s`,
		'--player-marquee-timing': `linear(0 0%, 0 ${holdEnd}%, 1 ${travelEnd}%, 1 ${holdBackEnd}%, 0 100%)`,
	};
}

function percentOf(elapsedS: number, totalS: number): string {
	return ((elapsedS / totalS) * 100).toFixed(2);
}
