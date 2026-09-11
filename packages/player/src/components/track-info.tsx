import type { ReactNode } from 'react';

import { MarqueeText } from '#components/marquee-text.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';
import { displayedItem, isLoaded } from '#store/selectors.ts';

export function TrackInfo({
	children,
	className,
	emptyLabel,
}: {
	// Rendered at the end of the artist row; the bar composes the clock in here
	children?: ReactNode;
	className?: string | undefined;
	emptyLabel: string;
}) {
	const item = usePlayer(displayedItem);
	const isTrackLoaded = usePlayer(isLoaded);

	if (!item)
		return (
			<div className={joinClassNames('player-track', className)}>
				<span className="player-track-empty">{emptyLabel}</span>
				<div className="player-track-meta">{children}</div>
			</div>
		);

	return (
		<div
			className={joinClassNames('player-track', className)}
			data-idle={isTrackLoaded ? undefined : ''}
		>
			{item.releaseHref === undefined ? (
				<span className="player-track-title">
					<MarqueeText text={item.title} />
				</span>
			) : (
				<a className="player-track-title" href={item.releaseHref}>
					<MarqueeText text={item.title} />
				</a>
			)}
			<div className="player-track-meta">
				<MarqueeText className="player-track-artist" text={item.artistLine} />
				{children}
			</div>
		</div>
	);
}
