import type { CSSProperties } from 'react';

import { useEffect, useRef, useState } from 'react';

import type { MarqueeProperties } from '#lib/marquee-timing.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { marqueeProperties, overflowDistance } from '#lib/marquee-timing.ts';

interface MarqueeStyle extends CSSProperties, MarqueeProperties {}

// One line that marches only when it does not fit; the measurement is the whole mechanism, there is no timer
export function MarqueeText({ className, text }: { className?: string | undefined; text: string }) {
	const boxRef = useRef<HTMLSpanElement>(null);
	const [distance, setDistance] = useState(0);

	useEffect(() => {
		const box = boxRef.current;
		if (!box) return;

		const measure = (): void => {
			setDistance(overflowDistance(box));
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

function marqueeStyle(distance: number): MarqueeStyle {
	return marqueeProperties(distance);
}
