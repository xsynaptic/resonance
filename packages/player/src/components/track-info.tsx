import { usePlayer } from '#store/context.tsx';

export function TrackInfo({ emptyLabel }: { emptyLabel: string }) {
	const item = usePlayer((state) =>
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex],
	);

	if (!item) return <div className="player-track-empty">{emptyLabel}</div>;

	return (
		<div className="player-track">
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
