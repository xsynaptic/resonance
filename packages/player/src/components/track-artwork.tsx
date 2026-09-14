import { useState } from 'react';

import { barArtworkSizes } from '#lib/artwork.ts';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';
import { displayedItem } from '#store/selectors.ts';

const smallestBarSize = Math.min(...barArtworkSizes);
const largestBarSize = Math.max(...barArtworkSizes);

// `auto` reads the rendered box where supported; elsewhere a 54rem viewport stands in for the 52rem tier plus the bar's padding
const barSizes = `auto, (width < 54rem) ${String(smallestBarSize)}px, ${String(largestBarSize)}px`;

export function TrackArtwork({
	className,
	sizes = barSizes,
}: {
	className?: string | undefined;
	sizes?: string | undefined;
}) {
	const artwork = usePlayer((state) => displayedItem(state)?.artwork);
	// A queue restored from storage can hold URLs a later deploy removed
	const [failedSrc, setFailedSrc] = useState<string | undefined>();

	const first = artwork?.[0];
	if (!artwork || !first || first.src === failedSrc) return;

	return (
		<img
			alt=""
			className={joinClassNames('player-artwork', className)}
			decoding="async"
			height={largestBarSize}
			loading="lazy"
			onError={() => {
				setFailedSrc(first.src);
			}}
			sizes={sizes}
			src={first.src}
			srcSet={artwork.map(({ src, width }) => `${src} ${String(width)}w`).join(', ')}
			width={largestBarSize}
		/>
	);
}
