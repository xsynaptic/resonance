import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

export function TrackInfo({
	className,
	emptyLabel,
}: {
	className?: string | undefined;
	emptyLabel: string;
}) {
	const item = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);

	if (!item)
		return <div className={joinClassNames('player-track-empty', className)}>{emptyLabel}</div>;

	return (
		<div className={joinClassNames('player-track', className)}>
			{item.releaseHref === undefined ? (
				<span className="player-track-title">{item.title}</span>
			) : (
				<a className="player-track-title" href={item.releaseHref}>
					{item.title}
				</a>
			)}
			<span className="player-track-artist">{item.artistLine}</span>
		</div>
	);
}
