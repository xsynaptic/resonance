import { waveformPanelSurfacePart } from '#components/lazy-parts.ts';
import { PanelToggle } from '#components/panel-toggle.tsx';

export function WaveformToggle({
	className,
	label,
}: {
	className?: string | undefined;
	label: string;
}) {
	const preload = waveformPanelSurfacePart.usePreload();

	return (
		<PanelToggle
			className={className}
			label={label}
			onFocus={preload.onFocus}
			onPointerEnter={preload.onPointerEnter}
		/>
	);
}
