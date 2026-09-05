import type { PlayerTimeMode } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { usePlayer } from '#store/context.tsx';

// One number, Winamp style; the seek surface announces the position, so the button is named for what it does
export function TimeDisplay({
	className,
	label,
}: {
	className?: string | undefined;
	label: string;
}) {
	const currentTimeS = usePlayer((state) => state.currentTimeS);
	const durationS = usePlayer((state) => state.durationS);
	const timeMode = usePlayer((state) => state.timeMode);
	const toggleTimeMode = usePlayer((state) => state.toggleTimeMode);

	return (
		<button
			aria-label={label}
			aria-pressed={timeMode === 'remaining'}
			className={joinClassNames('player-time', className)}
			data-mode={timeMode}
			onClick={toggleTimeMode}
			type="button"
		>
			{clockText(currentTimeS, durationS, timeMode)}
		</button>
	);
}

function clockText(
	currentTimeS: number,
	durationS: number | undefined,
	timeMode: PlayerTimeMode,
): string {
	if (durationS === undefined) return '--:--';
	if (timeMode === 'remaining') return formatClock(currentTimeS - durationS);

	return formatClock(currentTimeS);
}
