import { Button } from '#components/button.tsx';
import { WaveformIcon } from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { isLoaded } from '#store/selectors.ts';

// The overlay holds the panel's code already, so its toggle skips the preload that `WaveformToggle` adds
export function PanelToggle({
	className,
	label,
	onFocus,
	onPointerEnter,
}: {
	className?: string | undefined;
	label: string;
	onFocus?: (() => void) | undefined;
	onPointerEnter?: (() => void) | undefined;
}) {
	const isOpen = usePlayer((state) => state.isPanelOpen);
	const isTrackLoaded = usePlayer(isLoaded);
	const store = usePlayerStoreApi();

	return (
		<Button
			aria-label={label}
			aria-pressed={isOpen}
			className={joinClassNames('player-button-icon player-panel-toggle', className)}
			disabled={!isTrackLoaded}
			onClick={() => {
				store.getState().togglePanel();
			}}
			onFocus={onFocus}
			onPointerEnter={onPointerEnter}
		>
			<WaveformIcon />
		</Button>
	);
}
