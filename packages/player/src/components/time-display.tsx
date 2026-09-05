import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { usePlayer } from '#store/context.tsx';

export function TimeDisplay({ className }: { className?: string | undefined }) {
	const currentTimeS = usePlayer((state) => state.currentTimeS);
	const durationS = usePlayer((state) => state.durationS);

	return (
		<span className={joinClassNames('player-time', className)}>
			{formatClock(currentTimeS)} / {durationS === undefined ? '--:--' : formatClock(durationS)}
		</span>
	);
}
