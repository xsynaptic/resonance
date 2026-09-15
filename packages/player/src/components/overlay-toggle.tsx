import { Button } from '#components/button.tsx';
import { ChevronUpIcon } from '#components/icons.tsx';
import { overlayContentPart } from '#components/lazy-parts.ts';
import { usePreloadWhenQueued } from '#components/preload-when-queued.ts';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

export function OverlayToggle({
	className,
	label,
}: {
	className?: string | undefined;
	label: string;
}) {
	const hasQueue = usePlayer((state) => state.queue.length > 0);
	const store = usePlayerStoreApi();

	usePreloadWhenQueued(overlayContentPart.preload);

	return (
		<Button
			aria-haspopup="dialog"
			aria-label={label}
			className={joinClassNames('player-button-icon player-overlay-toggle', className)}
			disabled={!hasQueue}
			onClick={() => {
				store.getState().toggleOverlay();
			}}
			onFocus={overlayContentPart.preload}
			onPointerEnter={overlayContentPart.preload}
		>
			<ChevronUpIcon />
		</Button>
	);
}
