import { waveformPanelSurfacePart } from '#components/lazy-parts.ts';
import { PanelToggle } from '#components/panel-toggle.tsx';
import { usePreloadWhenQueued } from '#components/preload-when-queued.ts';

export function WaveformToggle({
	className,
	label,
}: {
	className?: string | undefined;
	label: string;
}) {
	usePreloadWhenQueued(waveformPanelSurfacePart.preload);

	return (
		<PanelToggle
			className={className}
			label={label}
			onFocus={waveformPanelSurfacePart.preload}
			onPointerEnter={waveformPanelSurfacePart.preload}
		/>
	);
}
