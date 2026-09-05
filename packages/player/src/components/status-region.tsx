import type { PlayerLabels, PlayerStatus } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer } from '#store/context.tsx';

export function StatusRegion({
	className,
	labels,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'capped' | 'error' | 'loading'>;
}) {
	const status = usePlayer((state) => state.status);

	return (
		<span
			aria-live="polite"
			className={joinClassNames('player-status', className)}
			data-status={status}
			role="status"
		>
			{statusMessage(status, labels)}
		</span>
	);
}

function statusMessage(
	status: PlayerStatus,
	labels: Pick<PlayerLabels, 'capped' | 'error' | 'loading'>,
): string {
	if (status === 'capped') return labels.capped;
	if (status === 'error') return labels.error;
	if (status === 'loading') return labels.loading;

	return '';
}
