import { formatClock } from '#lib/format.ts';
import { usePlayer } from '#store/context.tsx';

export function TimeDisplay() {
	const currentTimeS = usePlayer((state) => state.currentTimeS);
	const durationS = usePlayer((state) => state.durationS);

	return (
		<span className="player-time">
			{formatClock(currentTimeS)} / {durationS === undefined ? '--:--' : formatClock(durationS)}
		</span>
	);
}
