import { useEffect, useRef } from 'react';

import type { PlayerTimeMode } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { usePlayer, usePlayerStoreApi, useSubscribeTime } from '#store/context.tsx';

const emptyClock = '--:--';

// One number, Winamp style; the seek surface announces the position, so the button is named for what it does
export function TimeDisplay({
	className,
	label,
}: {
	className?: string | undefined;
	label: string;
}) {
	const durationS = usePlayer((state) => state.durationS);
	const timeMode = usePlayer((state) => state.timeMode);
	const store = usePlayerStoreApi();
	const subscribeTime = useSubscribeTime();
	const textRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		let written = '';

		return subscribeTime((currentTimeS) => {
			const text = clockText(currentTimeS, durationS, timeMode);
			if (text === written) return;

			written = text;

			if (textRef.current) textRef.current.textContent = text;
		});
	}, [durationS, subscribeTime, timeMode]);

	return (
		<button
			aria-label={label}
			aria-pressed={timeMode === 'remaining'}
			className={joinClassNames('player-time', className)}
			data-mode={timeMode}
			onClick={() => {
				store.getState().toggleTimeMode();
			}}
			type="button"
		>
			<span ref={textRef}>{emptyClock}</span>
		</button>
	);
}

function clockText(
	currentTimeS: number,
	durationS: number | undefined,
	timeMode: PlayerTimeMode,
): string {
	if (durationS === undefined) return emptyClock;
	if (timeMode === 'remaining') return formatClock(currentTimeS - durationS);

	return formatClock(currentTimeS);
}
